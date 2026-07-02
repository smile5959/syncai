"""add user plan and quota fields

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa

revision = 's8t9u0v1w2x3'
down_revision = 'r7s8t9u0v1w2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('plan', sa.String(20), nullable=False, server_default='free'))
    op.add_column('users', sa.Column('ai_calls_month', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('ai_calls_reset_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'ai_calls_reset_at')
    op.drop_column('users', 'ai_calls_month')
    op.drop_column('users', 'plan')
