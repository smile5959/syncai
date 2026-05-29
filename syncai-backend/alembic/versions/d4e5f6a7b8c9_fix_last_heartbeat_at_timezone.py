"""fix last_heartbeat_at to timezone-aware

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-11

"""
from alembic import op

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE workers ALTER COLUMN last_heartbeat_at "
        "TYPE TIMESTAMP WITH TIME ZONE "
        "USING last_heartbeat_at AT TIME ZONE 'UTC'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE workers ALTER COLUMN last_heartbeat_at "
        "TYPE TIMESTAMP WITHOUT TIME ZONE "
        "USING last_heartbeat_at AT TIME ZONE 'UTC'"
    )
