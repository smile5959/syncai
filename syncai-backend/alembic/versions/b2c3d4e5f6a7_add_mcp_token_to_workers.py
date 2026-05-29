"""add mcp_token to workers

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('workers', sa.Column('mcp_token', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('workers', 'mcp_token')
