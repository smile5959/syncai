"""add mcp_base_dir to workers

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('workers', sa.Column('mcp_base_dir', sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column('workers', 'mcp_base_dir')
