"""add token_issued_at and last_heartbeat_at to mcp_configs

Revision ID: p5q6r7s8t9u0
Revises: o4p5q6r7s8t9
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'p5q6r7s8t9u0'
down_revision = 'o4p5q6r7s8t9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('mcp_configs', sa.Column('token_issued_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('mcp_configs', sa.Column('last_heartbeat_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('mcp_configs', 'last_heartbeat_at')
    op.drop_column('mcp_configs', 'token_issued_at')
