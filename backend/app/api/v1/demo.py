"""Demo bootstrap endpoints for a fully interactive portfolio deployment."""
import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.core.matching_engine import EngineOrder, OrderSide, OrderType, TimeInForce
from app.db.session import get_db
from app.models.asset import Asset, TradingPair
from app.models.order import Order
from app.models.user import User
from app.models.wallet import UserWallet
from app.services.copy_trading_service import floor_to_step
from app.services.market_data_service import SUPPORTED_MARKETS, market_data_service
from app.services.wallet_service import reserve_order_funds
from app.utils.security import hash_password

router = APIRouter()

ASSETS = [("USDT", "Tether", 2, Decimal("1"), Decimal("10"), Decimal("100000"), Decimal("1"), 1)] + [
    (market["base"], market["name"], 8, Decimal("0.0001"), Decimal("0.0001"), Decimal("100000"), Decimal("0"), 1)
    for market in SUPPORTED_MARKETS
]

PAIR_SPECS = [
    (
        market["symbol"],
        market["base"],
        "USDT",
        8,
        2,
        Decimal("0.000001"),
        Decimal("1000000"),
        Decimal("10"),
        Decimal("0.00000001") if market["seed"] < Decimal("1") else Decimal("0.01"),
        Decimal("0.000001"),
        market["seed"],
    )
    for market in SUPPORTED_MARKETS
]

USER_STARTER_BALANCES = {
    "USDT": Decimal("100000"),
}

LIQUIDITY_BALANCES = {"USDT": Decimal("100000000000")}
for market in SUPPORTED_MARKETS:
    LIQUIDITY_BALANCES[market["base"]] = Decimal("100000000")

# Order-book depth seeded per pair so market orders fill realistically.
# Each level adds LIQUIDITY_NOTIONAL_STEP * index of notional depth, giving a deep
# two-sided book (~$150k per side) instead of the old ~$150.
LIQUIDITY_LEVELS = 12
LIQUIDITY_NOTIONAL_STEP = Decimal("2000")


def build_liquidity_ladder(
    symbol: str,
    pair: TradingPair,
    mid: Decimal,
    tick_size: Decimal,
    step_size: Decimal,
) -> list[tuple[OrderSide, Decimal, Decimal, str]]:
    """Build a deep two-sided liquidity ladder.

    Returns a list of ``(side, price, quantity, client_order_id)`` tuples. Prices
    widen ~0.05% per level (at least a few ticks) so both high- and low-priced
    assets show a realistic spread, and quantities scale so each level holds
    meaningful notional.
    """
    if mid <= 0:
        mid = max(tick_size, Decimal("1"))
    ladder: list[tuple[OrderSide, Decimal, Decimal, str]] = []
    for index in range(1, LIQUIDITY_LEVELS + 1):
        raw_offset = max(tick_size * Decimal(index * 5), mid * Decimal("0.0005") * Decimal(index))
        # Snap the offset onto the tick grid for clean price levels.
        ticks = (raw_offset / tick_size).to_integral_value(rounding=ROUND_HALF_UP)
        offset = tick_size * ticks
        bid_price = max(tick_size, mid - offset)
        ask_price = mid + offset
        quantity = floor_to_step((LIQUIDITY_NOTIONAL_STEP * Decimal(index)) / mid, step_size)
        if quantity < pair.min_qty:
            quantity = pair.min_qty
        ladder.append((OrderSide.BUY, bid_price, quantity, f"demo-liq:{symbol}:bid:{index}"))
        ladder.append((OrderSide.SELL, ask_price, quantity, f"demo-liq:{symbol}:ask:{index}"))
    return ladder


async def ensure_assets_and_pairs(db: AsyncSession) -> tuple[dict[str, Asset], dict[str, TradingPair]]:
    assets: dict[str, Asset] = {
        asset.symbol: asset for asset in (await db.execute(select(Asset))).scalars().all()
    }
    for symbol, name, decimals, min_deposit, min_withdrawal, max_withdrawal, fee, confirmations in ASSETS:
        if symbol not in assets:
            asset = Asset(
                id=uuid.uuid4(),
                symbol=symbol,
                name=name,
                decimals=decimals,
                is_active=True,
                min_deposit=min_deposit,
                min_withdrawal=min_withdrawal,
                max_withdrawal=max_withdrawal,
                withdrawal_fee=fee,
                deposit_confirmations=confirmations,
            )
            db.add(asset)
            assets[symbol] = asset
    await db.flush()

    pairs: dict[str, TradingPair] = {
        pair.symbol: pair for pair in (await db.execute(select(TradingPair))).scalars().all()
    }
    for symbol, base, quote, base_precision, quote_precision, min_qty, max_qty, min_notional, tick_size, step_size, _ in PAIR_SPECS:
        if symbol not in pairs:
            pair = TradingPair(
                id=uuid.uuid4(),
                symbol=symbol,
                base_asset_id=assets[base].id,
                quote_asset_id=assets[quote].id,
                base_precision=base_precision,
                quote_precision=quote_precision,
                min_qty=min_qty,
                max_qty=max_qty,
                min_notional=min_notional,
                tick_size=tick_size,
                step_size=step_size,
                maker_fee=Decimal("0.001"),
                taker_fee=Decimal("0.001"),
                is_active=True,
            )
            db.add(pair)
            pairs[symbol] = pair
    await db.flush()
    return assets, pairs


async def ensure_wallet_balance(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    asset: Asset,
    starting_available: Decimal,
) -> UserWallet:
    wallet = (
        await db.execute(
            select(UserWallet).where(UserWallet.user_id == user_id, UserWallet.asset_id == asset.id)
        )
    ).scalar_one_or_none()
    if not wallet:
        wallet = UserWallet(
            user_id=user_id,
            asset_id=asset.id,
            available=starting_available,
            locked=Decimal("0"),
        )
        db.add(wallet)
    await db.flush()
    return wallet


async def topup_liquidity_balance(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    asset: Asset,
    target_available: Decimal,
) -> UserWallet:
    """Ensure the liquidity user has at least ``target_available`` available.

    This only ever *raises* available and never touches ``locked``, so it is safe
    to call while orders rest in the book — it can never wipe the reservation
    backing a resting order (which would corrupt settlement).
    """
    wallet = (
        await db.execute(
            select(UserWallet).where(UserWallet.user_id == user_id, UserWallet.asset_id == asset.id)
        )
    ).scalar_one_or_none()
    if not wallet:
        wallet = UserWallet(user_id=user_id, asset_id=asset.id, available=target_available, locked=Decimal("0"))
        db.add(wallet)
    elif wallet.available < target_available:
        wallet.available = target_available
        wallet.version += 1
    await db.flush()
    return wallet


async def ensure_liquidity_user(db: AsyncSession) -> User:
    email = "liquidity@tradeoff.local"
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user:
        return user
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(f"Liquidity-{uuid.uuid4()}"),
        display_name="TradeOff Liquidity",
        kyc_level=2,
        status="ACTIVE",
        referral_code="LIQUIDITY",
    )
    db.add(user)
    await db.flush()
    return user


async def ensure_liquidity_order(
    db: AsyncSession,
    *,
    liquidity_user: User,
    pair: TradingPair,
    side: OrderSide,
    price: Decimal,
    quantity: Decimal,
    client_order_id: str,
) -> bool:
    from app.api.v1.trading import get_engine

    engine = get_engine(pair.symbol)
    existing = (
        await db.execute(
            select(Order).where(
                Order.user_id == liquidity_user.id,
                Order.trading_pair_id == pair.id,
                Order.client_order_id == client_order_id,
                Order.status.in_(("OPEN", "PARTIALLY_FILLED")),
            )
            .order_by(Order.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing and engine.order_book.get_order(existing.id):
        return False

    if existing:
        order_id = existing.id
    else:
        order_id = uuid.uuid4()
        await reserve_order_funds(
            db,
            user_id=liquidity_user.id,
            pair=pair,
            side=side.value,
            quantity=quantity,
            price=price,
            quote_quantity=None,
            order_id=order_id,
            fee_rate=pair.taker_fee,
        )
        db.add(
            Order(
                id=order_id,
                user_id=liquidity_user.id,
                trading_pair_id=pair.id,
                side=side.value,
                order_type="LIMIT",
                time_in_force="GTC",
                price=price,
                quantity=quantity,
                filled_quantity=Decimal("0"),
                status="OPEN",
                client_order_id=client_order_id,
            )
        )

    if not engine.order_book.get_order(order_id):
        await engine.process_order(
            EngineOrder(
                order_id=order_id,
                user_id=liquidity_user.id,
                trading_pair=pair.symbol,
                side=side,
                order_type=OrderType.LIMIT,
                price=price,
                quantity=quantity,
                time_in_force=TimeInForce.GTC,
            )
        )
    return True


@router.post("/bootstrap")
async def bootstrap_demo(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    assets, pairs = await ensure_assets_and_pairs(db)
    for symbol, amount in USER_STARTER_BALANCES.items():
        await ensure_wallet_balance(db, user_id=user_id, asset=assets[symbol], starting_available=amount)

    liquidity_user = await ensure_liquidity_user(db)

    # Top up the liquidity desk's balance non-destructively. We never reset or
    # zero `locked` here: doing so would invalidate the reservations backing
    # orders already resting in the book and corrupt trade settlement.
    for symbol, amount in LIQUIDITY_BALANCES.items():
        await topup_liquidity_balance(
            db,
            user_id=liquidity_user.id,
            asset=assets[symbol],
            target_available=amount,
        )

    seeded_orders = 0
    from app.api.v1.trading import get_engine

    for symbol, _, _, _, _, _, _, _, tick_size, step_size, mid in PAIR_SPECS:
        pair = pairs[symbol]
        live_tick = market_data_service.get_tick(symbol)
        mid = live_tick.price if live_tick else mid
        for side, price, quantity, client_order_id in build_liquidity_ladder(
            symbol, pair, mid, tick_size, step_size
        ):
            if await ensure_liquidity_order(
                db,
                liquidity_user=liquidity_user,
                pair=pair,
                side=side,
                price=price,
                quantity=quantity,
                client_order_id=client_order_id,
            ):
                seeded_orders += 1
        get_engine(symbol).order_book.last_trade_price = mid

    await db.commit()
    return {
        "status": "ready",
        "pairs": sorted(pairs),
        "funded_assets": sorted(USER_STARTER_BALANCES),
        "seeded_liquidity_orders": seeded_orders,
    }
