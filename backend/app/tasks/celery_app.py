"""Celery worker configuration for asynchronous exchange workflows."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "cex",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.jobs"],
)
celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    beat_schedule={
        "aggregate-candles-every-minute": {
            "task": "app.tasks.jobs.aggregate_candles",
            "schedule": 60.0,
        },
        "expire-orders-every-minute": {
            "task": "app.tasks.jobs.expire_orders",
            "schedule": 60.0,
        },
        "publish-outbox-every-five-seconds": {
            "task": "app.tasks.jobs.publish_outbox",
            "schedule": 5.0,
        },
        "reconcile-ledger-every-five-minutes": {
            "task": "app.tasks.jobs.reconcile_ledger",
            "schedule": 300.0,
        },
    },
)
