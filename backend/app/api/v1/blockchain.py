"""Blockchain API — on-chain trade settlement, verification, and token info."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id
from app.db.session import get_db
from app.models.trade import Trade
from app.models.user import User
from app.services.blockchain_service import blockchain_service

router = APIRouter()


class WalletLinkRequest(BaseModel):
    wallet_address: str


class SettleTradeRequest(BaseModel):
    trade_id: str


@router.get("/status")
async def blockchain_status():
    return blockchain_service.get_status()


@router.post("/link-wallet")
async def link_wallet(
    req: WalletLinkRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not req.wallet_address.startswith("0x") or len(req.wallet_address) != 42:
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.eth_wallet = req.wallet_address
    await db.commit()
    return {"status": "linked", "wallet_address": req.wallet_address}


@router.get("/wallet")
async def get_linked_wallet(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    wallet = user.eth_wallet
    if not wallet:
        return {"linked": False, "wallet_address": None}

    token_info = await blockchain_service.get_token_balance(wallet) if wallet else {}
    return {"linked": True, "wallet_address": wallet, "token": token_info}


@router.post("/settle")
async def settle_trade(
    req: SettleTradeRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not blockchain_service.can_write:
        raise HTTPException(status_code=503, detail="Blockchain settlement not available")

    result = await db.execute(
        select(Trade).where(
            Trade.id == uuid.UUID(req.trade_id),
            (Trade.taker_user_id == user_id) | (Trade.maker_user_id == user_id),
        )
    )
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    trader_address = (user.eth_wallet if user else None) or "0x0000000000000000000000000000000000000000"

    from app.models.asset import TradingPair

    pair_result = await db.execute(select(TradingPair).where(TradingPair.id == trade.trading_pair_id))
    pair = pair_result.scalar_one_or_none()

    receipt = await blockchain_service.settle_trade_on_chain(
        trade_id=str(trade.id),
        trader_address=trader_address,
        pair=pair.symbol if pair else "UNKNOWN",
        side=trade.taker_side,
        price=int(trade.price * 10**8),
        quantity=int(trade.quantity * 10**8),
    )

    if not receipt:
        raise HTTPException(status_code=500, detail="Settlement transaction failed")
    return {"settlement": receipt, "trade_id": str(trade.id)}


@router.get("/verify/{trade_id}")
async def verify_trade(trade_id: str):
    result = await blockchain_service.verify_trade(trade_id)
    return result


@router.get("/settlements/count")
async def settlement_count():
    count = await blockchain_service.get_total_settlements()
    return {"total_settlements": count}


@router.get("/token/balance/{address}")
async def token_balance(address: str):
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")
    return await blockchain_service.get_token_balance(address)


@router.post("/token/faucet")
async def token_faucet(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Claim 1000 TFO test tokens via the on-chain faucet."""
    if not blockchain_service.can_write:
        raise HTTPException(status_code=503, detail="Blockchain not available")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    wallet = user.eth_wallet if user else None
    if not wallet:
        raise HTTPException(status_code=400, detail="Link an Ethereum wallet first")

    receipt = await blockchain_service.faucet_tokens(wallet)
    if not receipt:
        raise HTTPException(status_code=500, detail="Faucet transaction failed")
    return receipt
