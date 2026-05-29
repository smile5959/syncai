"""add color and icon to teams

Revision ID: f5g6h7i8j9k0
Revises: e5f6a7b8c9d0
Create Date: 2026-05-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'f5g6h7i8j9k0'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('teams', sa.Column('color', sa.String(7), nullable=True))
    op.add_column('teams', sa.Column('icon', sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column('teams', 'icon')
    op.drop_column('teams', 'color')
