"""Initial exchange schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-05
"""
from alembic import op

from app.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
                CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
                EXECUTE 'SELECT create_hypertable(''candles'', ''time'', if_not_exists => TRUE, migrate_data => TRUE)';
            END IF;
        END $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_trades_pair_time ON trades (trading_pair_id, trade_timestamp DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_user_status_time ON orders (user_id, status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ledger_user_asset_time ON ledger_entries (user_id, asset_id, created_at DESC)")


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
