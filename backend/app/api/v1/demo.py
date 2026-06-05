"""Demo bootstrap endpoints for a fully interactive portfolio deployment."""
from decimal import Decimal
import uuid

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
from app.services.wallet_service import reserve_order_funds
from app.utils.security import hash_password

router = APIRouter()

ASSETS = [
    ("BTC", "Bitcoin", 8, Decimal("0.0001"), Decimal("0.001"), Decimal("10"), Decimal("0.0005"), 2),
    ("ETH", "Ethereum", 18, Decimal("0.001"), Decimal("0.01"), Decimal("100"), Decimal("0.005"), 12),
    ("USDT", "Tether", 2, Decimal("1"), Decimal("10"), Decimal("100000"), Decimal("1"), 1),
    ("SOL", "Solana", 9, Decimal("0.01"), Decimal("0.1"), Decimal("1000"), Decimal("0.01"), 1),
    ("ADA", "Cardano", 6, Decimal("1"), Decimal("1"), Decimal("100000"), Decimal("0.5"), 1),
]

PAIR_SPECS = [
    ("BTCUSDT", "BTC", "USDT", 5, 2, Decimal("0.00001"), Decimal("1000"), Decimal("10"), Decimal("0.01"), Decimal("0.00001"), Decimal("68429.12")),
    ("ETHUSDT", "ETH", "USDT", 4, 2, Decimal("0.0001"), Decimal("10000"), Decimal("10"), Decimal("0.01"), Decimal("0.0001"), Decimal("3641.87")),
    ("SOLUSDT", "SOL", "USDT", 2, 2, Decimal("0.01"), Decimal("100000"), Decimal("10"), Decimal("0.01"), Decimal("0.01"), Decimal("172.46")),
    ("ADAUSDT", "ADA", "USDT", 1, 4, Decimal("1"), Decimal("1000000"), Decimal("10"), Decimal("0.0001"), Decimal("1"), Decimal("0.4518")),
]

USER_STARTER_BALANCES = {
    "USDT": Decimal("50000"),
    "BTC": Decimal("1.25"),
    "ETH": Decimal("12"),
    "SOL": Decimal("250"),
    "ADA": Decimal("15000"),
}

LIQUIDITY_BALANCES = {
    "USDT": Decimal("100000000"),
    "BTC": Decimal("200"),
    "ETH": Decimal("5000"),
    "SOL": Decimal("100000"),
    "ADA": Decimal("20000000"),
}


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
    minimum_available: Decimal,
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
            available=minimum_available,
            locked=Decimal("0"),
        )
        db.add(wallet)
    elif wallet.available < minimum_available:
        wallet.available = minimum_available
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
        await ensure_wallet_balance(db, user_id=user_id, asset=assets[symbol], minimum_available=amount)

    liquidity_user = await ensure_liquidity_user(db)
    for symbol, amount in LIQUIDITY_BALANCES.items():
        await ensure_wallet_balance(
            db,
            user_id=liquidity_user.id,
            asset=assets[symbol],
            minimum_available=amount,
        )

    seeded_orders = 0
    for symbol, _, _, _, _, _, _, _, tick_size, step_size, mid in PAIR_SPECS:
        pair = pairs[symbol]
        base_quantity = max(pair.min_qty, step_size * Decimal("1000"))
        for index in range(1, 6):
            bid_price = mid - (tick_size * Decimal(index * 25))
            ask_price = mid + (tick_size * Decimal(index * 25))
            quantity = base_quantity * Decimal(index)
            if await ensure_liquidity_order(
                db,
                liquidity_user=liquidity_user,
                pair=pair,
                side=OrderSide.BUY,
                price=bid_price,
                quantity=quantity,
                client_order_id=f"demo-liq:{symbol}:bid:{index}",
            ):
                seeded_orders += 1
            if await ensure_liquidity_order(
                db,
                liquidity_user=liquidity_user,
                pair=pair,
                side=OrderSide.SELL,
                price=ask_price,
                quantity=quantity,
                client_order_id=f"demo-liq:{symbol}:ask:{index}",
            ):
                seeded_orders += 1
        from app.api.v1.trading import get_engine

        get_engine(symbol).order_book.last_trade_price = mid

    await db.commit()
    return {
        "status": "ready",
        "pairs": sorted(pairs),
        "funded_assets": sorted(USER_STARTER_BALANCES),
        "seeded_liquidity_orders": seeded_orders,
    }
