"""Ledger and reserve reconciliation checks."""
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operations import ReconciliationRun
from app.models.wallet import LedgerEntry, UserWallet


async def run_reconciliation(db: AsyncSession) -> ReconciliationRun:
    run = ReconciliationRun(status="RUNNING", scope="WALLETS_AND_LEDGER")
    db.add(run)
    await db.flush()

    mismatches = []

    # --- 1. Negative-balance check ---
    wallets = (await db.execute(select(UserWallet))).scalars().all()
    for wallet in wallets:
        if wallet.available < 0 or wallet.locked < 0:
            mismatches.append(
                {
                    "type": "NEGATIVE_BALANCE",
                    "wallet_id": str(wallet.id),
                    "user_id": str(wallet.user_id),
                    "asset_id": str(wallet.asset_id),
                    "available": str(wallet.available),
                    "locked": str(wallet.locked),
                }
            )

    # --- 2. Ledger sum vs wallet balance check ---
    # For each (user_id, asset_id) pair, sum credits - debits and compare against
    # wallet.available + wallet.locked.
    ledger_rows = (
        await db.execute(
            select(
                LedgerEntry.user_id,
                LedgerEntry.asset_id,
                func.coalesce(func.sum(LedgerEntry.credit), Decimal("0")).label("total_credit"),
                func.coalesce(func.sum(LedgerEntry.debit), Decimal("0")).label("total_debit"),
            ).group_by(LedgerEntry.user_id, LedgerEntry.asset_id)
        )
    ).all()

    wallet_map = {(str(w.user_id), str(w.asset_id)): w for w in wallets}
    tolerance = Decimal("0.00000001")

    for row in ledger_rows:
        key = (str(row.user_id), str(row.asset_id))
        net = Decimal(str(row.total_credit)) - Decimal(str(row.total_debit))
        wallet = wallet_map.get(key)
        if wallet is None:
            if abs(net) > tolerance:
                mismatches.append(
                    {
                        "type": "LEDGER_WITHOUT_WALLET",
                        "user_id": str(row.user_id),
                        "asset_id": str(row.asset_id),
                        "ledger_net": str(net),
                    }
                )
            continue
        wallet_total = wallet.available + wallet.locked
        if abs(net - wallet_total) > tolerance:
            mismatches.append(
                {
                    "type": "LEDGER_WALLET_MISMATCH",
                    "user_id": str(row.user_id),
                    "asset_id": str(row.asset_id),
                    "ledger_net": str(net),
                    "wallet_total": str(wallet_total),
                    "delta": str(net - wallet_total),
                }
            )

    run.checked_wallets = len(wallets)
    run.mismatches = len(mismatches)
    run.details = {"mismatches": mismatches}
    run.status = "FAILED" if mismatches else "PASSED"
    run.completed_at = datetime.now(timezone.utc)
    return run
