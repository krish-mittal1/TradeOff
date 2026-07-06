"""Transactional wallet reservation, release, and trade settlement."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import TradingPair
from app.models.wallet import LedgerEntry, UserWallet


async def get_wallet_for_update(
    db: AsyncSession, user_id: uuid.UUID, asset_id: uuid.UUID
) -> UserWallet:
    result = await db.execute(
        select(UserWallet)
        .where(UserWallet.user_id == user_id, UserWallet.asset_id == asset_id)
        .with_for_update()
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = UserWallet(user_id=user_id, asset_id=asset_id, available=Decimal("0"), locked=Decimal("0"))
        db.add(wallet)
        await db.flush()
    return wallet


def add_ledger(
    db: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    wallet: UserWallet,
    debit: Decimal = Decimal("0"),
    credit: Decimal = Decimal("0"),
    entry_type: str,
    reference_type: str,
    reference_id: uuid.UUID,
) -> None:
    db.add(
        LedgerEntry(
            transaction_id=transaction_id,
            user_id=wallet.user_id,
            asset_id=wallet.asset_id,
            debit=debit,
            credit=credit,
            balance_after=wallet.available + wallet.locked,
            entry_type=entry_type,
            reference_type=reference_type,
            reference_id=reference_id,
            created_at=datetime.now(timezone.utc),
        )
    )


async def reserve_order_funds(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    pair: TradingPair,
    side: str,
    quantity: Decimal,
    price: Decimal | None,
    quote_quantity: Decimal | None,
    order_id: uuid.UUID,
    fee_rate: Decimal = Decimal("0"),
) -> Decimal:
    """Move available funds to locked and return the reserved amount."""
    if side == "BUY":
        reserve = (quote_quantity or ((price or Decimal("0")) * quantity)) * (Decimal("1") + fee_rate)
        asset_id = pair.quote_asset_id
    else:
        reserve = quantity
        asset_id = pair.base_asset_id
    if reserve <= 0:
        raise HTTPException(status_code=400, detail="Unable to calculate order reserve")

    wallet = await get_wallet_for_update(db, user_id, asset_id)
    if wallet.available < reserve:
        raise HTTPException(status_code=400, detail="Insufficient available balance")
    wallet.available -= reserve
    wallet.locked += reserve
    wallet.version += 1
    add_ledger(
        db,
        transaction_id=uuid.uuid4(),
        wallet=wallet,
        debit=reserve,
        entry_type="ORDER_RESERVE",
        reference_type="ORDER",
        reference_id=order_id,
    )
    return reserve


async def release_order_funds(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    pair: TradingPair,
    side: str,
    remaining_quantity: Decimal,
    price: Decimal | None,
    remaining_quote: Decimal | None,
    order_id: uuid.UUID,
    fee_rate: Decimal = Decimal("0"),
) -> Decimal:
    if side == "BUY":
        release = (
            remaining_quote
            if remaining_quote is not None
            else (price or Decimal("0")) * remaining_quantity
        ) * (Decimal("1") + fee_rate)
        asset_id = pair.quote_asset_id
    else:
        release = remaining_quantity
        asset_id = pair.base_asset_id
    if release <= 0:
        return Decimal("0")
    wallet = await get_wallet_for_update(db, user_id, asset_id)
    release = min(release, wallet.locked)
    wallet.locked -= release
    wallet.available += release
    wallet.version += 1
    add_ledger(
        db,
        transaction_id=uuid.uuid4(),
        wallet=wallet,
        credit=release,
        entry_type="ORDER_RELEASE",
        reference_type="ORDER",
        reference_id=order_id,
    )
    return release


# Settlement absorbs sub-unit drift from Decimal division during multi-level
# fills (e.g. (quote/price)*price rounding a hair over budget). The reservation
# is the authority, so a shortfall within this tolerance is clamped rather than
# rejected; anything larger is a genuine invariant violation.
_SETTLE_TOLERANCE = Decimal("1e-6")


def _reserve_ok(locked: Decimal, needed: Decimal) -> bool:
    return locked >= needed - (abs(needed) * _SETTLE_TOLERANCE + Decimal("1e-12"))


async def settle_trade(
    db: AsyncSession,
    *,
    pair: TradingPair,
    trade,
) -> None:
    """Atomically settle base/quote transfers and fees for maker and taker."""
    buyer_id = trade.taker_user_id if trade.taker_side.value == "BUY" else trade.maker_user_id
    seller_id = trade.maker_user_id if trade.taker_side.value == "BUY" else trade.taker_user_id
    buyer_fee = trade.taker_fee if trade.taker_side.value == "BUY" else trade.maker_fee
    seller_fee = trade.maker_fee if trade.taker_side.value == "BUY" else trade.taker_fee

    buyer_quote = await get_wallet_for_update(db, buyer_id, pair.quote_asset_id)
    buyer_base = await get_wallet_for_update(db, buyer_id, pair.base_asset_id)
    seller_base = await get_wallet_for_update(db, seller_id, pair.base_asset_id)
    seller_quote = await get_wallet_for_update(db, seller_id, pair.quote_asset_id)

    quote_cost = trade.quote_quantity
    buyer_debit = quote_cost + buyer_fee
    if not _reserve_ok(buyer_quote.locked, buyer_debit):
        raise HTTPException(status_code=409, detail="Buyer reserve invariant violated")
    if not _reserve_ok(seller_base.locked, trade.quantity):
        raise HTTPException(status_code=409, detail="Seller reserve invariant violated")

    # Clamp to the available reservation so locked can never go negative from drift.
    base_debit = min(trade.quantity, seller_base.locked)
    buyer_debit = min(buyer_debit, buyer_quote.locked)

    buyer_quote.locked -= buyer_debit
    buyer_base.available += trade.quantity
    seller_base.locked -= base_debit
    seller_quote.available += quote_cost - seller_fee
    for wallet in (buyer_quote, buyer_base, seller_base, seller_quote):
        wallet.version += 1

    tx_id = trade.trade_id
    add_ledger(db, transaction_id=tx_id, wallet=buyer_quote, debit=buyer_debit, entry_type="TRADE_BUY_QUOTE", reference_type="TRADE", reference_id=trade.trade_id)
    add_ledger(db, transaction_id=tx_id, wallet=buyer_base, credit=trade.quantity, entry_type="TRADE_BUY_BASE", reference_type="TRADE", reference_id=trade.trade_id)
    add_ledger(db, transaction_id=tx_id, wallet=seller_base, debit=trade.quantity, entry_type="TRADE_SELL_BASE", reference_type="TRADE", reference_id=trade.trade_id)
    add_ledger(db, transaction_id=tx_id, wallet=seller_quote, credit=quote_cost - seller_fee, entry_type="TRADE_SELL_QUOTE", reference_type="TRADE", reference_id=trade.trade_id)
