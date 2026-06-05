"""Wallet, deposit, withdrawal, and mock-chain API endpoints."""
from datetime import datetime, timezone
from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user_id, require_admin, require_api_permission
from app.config import settings
from app.db.session import get_db
from app.models.asset import Asset
from app.models.operations import MockChainTransaction
from app.models.wallet import Deposit, Withdrawal, UserWallet
from app.services.notification_service import create_notification
from app.services.outbox_service import add_outbox_event
from app.services.wallet_service import add_ledger, get_wallet_for_update

router = APIRouter()


class WithdrawalRequest(BaseModel):
    asset_symbol: str
    address: str = Field(min_length=8, max_length=255)
    amount: Decimal = Field(gt=0)


class MockDepositRequest(BaseModel):
    asset_symbol: str
    amount: Decimal = Field(gt=0)
    address: str | None = None
    confirmations: int = Field(default=0, ge=0)


class ConfirmDepositRequest(BaseModel):
    confirmations: int = Field(default=1, ge=1)


async def get_asset(db: AsyncSession, symbol: str) -> Asset:
    asset = (
        await db.execute(select(Asset).where(Asset.symbol == symbol.upper(), Asset.is_active.is_(True)))
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/balances")
async def get_balances(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserWallet, Asset)
        .join(Asset, UserWallet.asset_id == Asset.id)
        .where(UserWallet.user_id == user_id)
        .order_by(Asset.symbol)
    )
    return {
        "balances": [
            {
                "asset": asset.symbol,
                "asset_name": asset.name,
                "available": str(wallet.available),
                "locked": str(wallet.locked),
                "total": str(wallet.available + wallet.locked),
            }
            for wallet, asset in result.all()
        ]
    }


@router.get("/balances/{asset_symbol}")
async def get_balance(
    asset_symbol: str,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserWallet, Asset)
        .join(Asset, UserWallet.asset_id == Asset.id)
        .where(UserWallet.user_id == user_id, Asset.symbol == asset_symbol.upper())
    )
    row = result.first()
    if not row:
        return {"asset": asset_symbol.upper(), "available": "0", "locked": "0", "total": "0"}
    wallet, asset = row
    return {
        "asset": asset.symbol,
        "available": str(wallet.available),
        "locked": str(wallet.locked),
        "total": str(wallet.available + wallet.locked),
    }


@router.get("/deposit-address/{asset_symbol}")
async def get_deposit_address(
    asset_symbol: str,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    asset = await get_asset(db, asset_symbol)
    return {
        "asset": asset.symbol,
        "address": f"mock_{asset.symbol.lower()}_{str(user_id).replace('-', '')[:24]}",
        "network": "MOCKNET",
        "required_confirmations": asset.deposit_confirmations,
        "min_deposit": str(asset.min_deposit),
    }


@router.post("/deposits/mock", status_code=201)
async def create_mock_deposit(
    req: MockDepositRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    asset = await get_asset(db, req.asset_symbol)
    if req.amount < asset.min_deposit:
        raise HTTPException(status_code=400, detail=f"Minimum deposit is {asset.min_deposit}")
    tx_hash = f"mockdep_{uuid.uuid4().hex}"
    deposit_id = uuid.uuid4()
    deposit = Deposit(
        id=deposit_id,
        user_id=user_id,
        asset_id=asset.id,
        address=req.address or f"mock_{asset.symbol.lower()}_{str(user_id).replace('-', '')[:24]}",
        tx_hash=tx_hash,
        amount=req.amount,
        confirmations=req.confirmations,
        required_confirmations=asset.deposit_confirmations,
        status="PENDING",
    )
    chain_tx = MockChainTransaction(
        user_id=user_id,
        asset_id=asset.id,
        direction="DEPOSIT",
        address=deposit.address,
        tx_hash=tx_hash,
        amount=str(req.amount),
        confirmations=req.confirmations,
        required_confirmations=asset.deposit_confirmations,
        status="PENDING",
        reference_type="DEPOSIT",
        reference_id=deposit_id,
    )
    db.add_all([deposit, chain_tx])
    await db.flush()
    add_outbox_event(
        db,
        aggregate_type="DEPOSIT",
        aggregate_id=str(deposit_id),
        event_type="deposit.detected",
        topic=settings.KAFKA_WALLET_TOPIC,
        key=str(user_id),
        payload={"deposit_id": str(deposit_id), "asset": asset.symbol, "amount": str(req.amount)},
    )
    return {
        "id": str(deposit.id),
        "tx_hash": tx_hash,
        "asset": asset.symbol,
        "amount": str(req.amount),
        "status": deposit.status,
        "confirmations": deposit.confirmations,
        "required_confirmations": deposit.required_confirmations,
    }


@router.post("/deposits/{deposit_id}/confirm")
async def confirm_deposit(
    deposit_id: uuid.UUID,
    req: ConfirmDepositRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    deposit = (
        await db.execute(
            select(Deposit).where(Deposit.id == deposit_id, Deposit.user_id == user_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.status == "COMPLETED":
        return {"id": str(deposit.id), "status": deposit.status}

    deposit.confirmations += req.confirmations
    if deposit.confirmations >= deposit.required_confirmations:
        chain_tx = (
            await db.execute(
                select(MockChainTransaction).where(
                    MockChainTransaction.reference_type == "DEPOSIT",
                    MockChainTransaction.reference_id == deposit.id,
                )
            )
        ).scalar_one_or_none()
        if chain_tx:
            chain_tx.confirmations = deposit.confirmations
            chain_tx.status = "COMPLETED"
        wallet = await get_wallet_for_update(db, user_id, deposit.asset_id)
        wallet.available += deposit.amount
        wallet.version += 1
        deposit.status = "COMPLETED"
        deposit.completed_at = datetime.now(timezone.utc)
        add_ledger(
            db,
            transaction_id=deposit.id,
            wallet=wallet,
            credit=deposit.amount,
            entry_type="DEPOSIT_CREDIT",
            reference_type="DEPOSIT",
            reference_id=deposit.id,
        )
        await create_notification(
            db,
            user_id=user_id,
            notification_type="DEPOSIT_COMPLETED",
            title="Deposit credited",
            body=f"Your deposit of {deposit.amount} has been credited.",
            data={"deposit_id": str(deposit.id)},
        )
    return {
        "id": str(deposit.id),
        "status": deposit.status,
        "confirmations": deposit.confirmations,
        "required_confirmations": deposit.required_confirmations,
    }


@router.get("/deposits")
async def get_deposits(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * limit
    rows = (
        await db.execute(
            select(Deposit, Asset)
            .join(Asset, Deposit.asset_id == Asset.id)
            .where(Deposit.user_id == user_id)
            .order_by(Deposit.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    total = (
        await db.execute(select(func.count()).select_from(Deposit).where(Deposit.user_id == user_id))
    ).scalar()
    return {
        "deposits": [
            {
                "id": str(d.id),
                "asset": asset.symbol,
                "address": d.address,
                "amount": str(d.amount),
                "status": d.status,
                "confirmations": d.confirmations,
                "required_confirmations": d.required_confirmations,
                "tx_hash": d.tx_hash,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d, asset in rows
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("/withdrawals", status_code=201, dependencies=[Depends(require_api_permission("withdraw"))])
async def create_withdrawal(
    req: WithdrawalRequest,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    asset = await get_asset(db, req.asset_symbol)
    if req.amount < asset.min_withdrawal:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is {asset.min_withdrawal}")
    if asset.max_withdrawal > 0 and req.amount > asset.max_withdrawal:
        raise HTTPException(status_code=400, detail=f"Maximum withdrawal is {asset.max_withdrawal}")

    wallet = await get_wallet_for_update(db, user_id, asset.id)
    if wallet.available < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    fee = asset.withdrawal_fee
    net_amount = req.amount - fee
    if net_amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must exceed fee")

    wallet.available -= req.amount
    wallet.locked += req.amount
    wallet.version += 1
    withdrawal_id = uuid.uuid4()
    withdrawal = Withdrawal(
        id=withdrawal_id,
        user_id=user_id,
        asset_id=asset.id,
        address=req.address,
        amount=req.amount,
        fee=fee,
        net_amount=net_amount,
        status="PENDING",
        requires_2fa=True,
        requires_admin=req.amount >= Decimal("1000"),
    )
    db.add(withdrawal)
    await db.flush()
    add_ledger(
        db,
        transaction_id=withdrawal.id,
        wallet=wallet,
        debit=req.amount,
        entry_type="WITHDRAWAL_RESERVE",
        reference_type="WITHDRAWAL",
        reference_id=withdrawal.id,
    )
    add_outbox_event(
        db,
        aggregate_type="WITHDRAWAL",
        aggregate_id=str(withdrawal.id),
        event_type="withdrawal.requested",
        topic=settings.KAFKA_WALLET_TOPIC,
        key=str(user_id),
        payload={"withdrawal_id": str(withdrawal.id), "asset": asset.symbol, "amount": str(req.amount)},
    )
    return {
        "id": str(withdrawal.id),
        "asset": asset.symbol,
        "amount": str(req.amount),
        "fee": str(fee),
        "net_amount": str(net_amount),
        "status": withdrawal.status,
        "requires_admin": withdrawal.requires_admin,
    }


@router.post("/withdrawals/{withdrawal_id}/approve", dependencies=[Depends(require_admin)])
async def approve_withdrawal(
    withdrawal_id: uuid.UUID,
    admin_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    withdrawal = await db.get(Withdrawal, withdrawal_id)
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot approve {withdrawal.status} withdrawal")
    withdrawal.status = "APPROVED"
    withdrawal.approved_by = admin_id
    return {"id": str(withdrawal.id), "status": withdrawal.status}


@router.post("/withdrawals/{withdrawal_id}/broadcast")
async def broadcast_withdrawal(
    withdrawal_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    withdrawal = (
        await db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id, Withdrawal.user_id == user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.requires_admin and withdrawal.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Withdrawal requires admin approval")
    if withdrawal.status not in {"PENDING", "APPROVED"}:
        raise HTTPException(status_code=400, detail=f"Cannot broadcast {withdrawal.status} withdrawal")
    tx_hash = f"mockwd_{uuid.uuid4().hex}"
    withdrawal.status = "BROADCAST"
    withdrawal.tx_hash = tx_hash
    chain_tx = MockChainTransaction(
        user_id=user_id,
        asset_id=withdrawal.asset_id,
        direction="WITHDRAWAL",
        address=withdrawal.address,
        tx_hash=tx_hash,
        amount=str(withdrawal.net_amount),
        confirmations=0,
        required_confirmations=1,
        status="BROADCAST",
        reference_type="WITHDRAWAL",
        reference_id=withdrawal.id,
    )
    db.add(chain_tx)
    return {"id": str(withdrawal.id), "status": withdrawal.status, "tx_hash": tx_hash}


@router.post("/withdrawals/{withdrawal_id}/cancel")
async def cancel_withdrawal(
    withdrawal_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    withdrawal = (
        await db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id, Withdrawal.user_id == user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status not in {"PENDING", "APPROVED"}:
        raise HTTPException(status_code=400, detail=f"Cannot cancel {withdrawal.status} withdrawal")
    wallet = await get_wallet_for_update(db, user_id, withdrawal.asset_id)
    release = min(wallet.locked, withdrawal.amount)
    wallet.locked -= release
    wallet.available += release
    wallet.version += 1
    withdrawal.status = "CANCELLED"
    add_ledger(
        db,
        transaction_id=withdrawal.id,
        wallet=wallet,
        credit=release,
        entry_type="WITHDRAWAL_RELEASE",
        reference_type="WITHDRAWAL",
        reference_id=withdrawal.id,
    )
    return {"id": str(withdrawal.id), "status": withdrawal.status}


@router.post("/withdrawals/{withdrawal_id}/complete")
async def complete_withdrawal(
    withdrawal_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
):
    withdrawal = (
        await db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id, Withdrawal.user_id == user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "BROADCAST":
        raise HTTPException(status_code=400, detail="Withdrawal must be broadcast first")
    wallet = await get_wallet_for_update(db, user_id, withdrawal.asset_id)
    if wallet.locked < withdrawal.amount:
        raise HTTPException(status_code=409, detail="Withdrawal reserve invariant violated")
    wallet.locked -= withdrawal.amount
    wallet.version += 1
    withdrawal.status = "COMPLETED"
    withdrawal.completed_at = datetime.now(timezone.utc)
    chain_tx = (
        await db.execute(
            select(MockChainTransaction).where(
                MockChainTransaction.reference_type == "WITHDRAWAL",
                MockChainTransaction.reference_id == withdrawal.id,
            )
        )
    ).scalar_one_or_none()
    if chain_tx:
        chain_tx.confirmations = chain_tx.required_confirmations
        chain_tx.status = "COMPLETED"
    add_ledger(
        db,
        transaction_id=withdrawal.id,
        wallet=wallet,
        debit=withdrawal.amount,
        entry_type="WITHDRAWAL_COMPLETE",
        reference_type="WITHDRAWAL",
        reference_id=withdrawal.id,
    )
    await create_notification(
        db,
        user_id=user_id,
        notification_type="WITHDRAWAL_COMPLETED",
        title="Withdrawal completed",
        body=f"Your withdrawal of {withdrawal.net_amount} has completed.",
        data={"withdrawal_id": str(withdrawal.id), "tx_hash": withdrawal.tx_hash},
    )
    return {"id": str(withdrawal.id), "status": withdrawal.status, "tx_hash": withdrawal.tx_hash}


@router.get("/withdrawals")
async def get_withdrawals(
    user_id: uuid.UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * limit
    withdrawals = (
        await db.execute(
            select(Withdrawal)
            .where(Withdrawal.user_id == user_id)
            .order_by(Withdrawal.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    total = (
        await db.execute(select(func.count()).select_from(Withdrawal).where(Withdrawal.user_id == user_id))
    ).scalar()
    return {
        "withdrawals": [
            {
                "id": str(w.id),
                "address": w.address,
                "amount": str(w.amount),
                "fee": str(w.fee),
                "net_amount": str(w.net_amount),
                "status": w.status,
                "tx_hash": w.tx_hash,
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in withdrawals
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }
