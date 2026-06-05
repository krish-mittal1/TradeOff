"""Operational APIs for reconciliation and outbox inspection."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import require_admin
from app.db.session import get_db
from app.models.operations import OutboxEvent, ReconciliationRun
from app.services.reconciliation_service import run_reconciliation

router = APIRouter(dependencies=[Depends(require_admin)])


@router.post("/reconciliation/run")
async def trigger_reconciliation(db: AsyncSession = Depends(get_db)):
    run = await run_reconciliation(db)
    return {
        "id": str(run.id),
        "status": run.status,
        "checked_wallets": run.checked_wallets,
        "mismatches": run.mismatches,
        "details": run.details,
    }


@router.get("/reconciliation")
async def list_reconciliation_runs(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    runs = (
        await db.execute(select(ReconciliationRun).order_by(ReconciliationRun.created_at.desc()).limit(limit))
    ).scalars().all()
    return {
        "runs": [
            {
                "id": str(run.id),
                "status": run.status,
                "scope": run.scope,
                "checked_wallets": run.checked_wallets,
                "mismatches": run.mismatches,
                "started_at": run.created_at.isoformat() if run.created_at else None,
                "finished_at": run.completed_at.isoformat() if run.completed_at else None,
                "created_at": run.created_at.isoformat() if run.created_at else None,
            }
            for run in runs
        ]
    }


@router.get("/outbox")
async def list_outbox(
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    limit: int = Query(50, ge=1, le=100),
):
    query = select(OutboxEvent)
    if status:
        query = query.where(OutboxEvent.status == status.upper())
    events = (await db.execute(query.order_by(OutboxEvent.created_at.desc()).limit(limit))).scalars().all()
    return {
        "events": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "topic": event.topic,
                "status": event.status,
                "attempts": event.attempts,
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ]
    }
