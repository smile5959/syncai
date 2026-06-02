"""add model to workers

Revision ID: l1m2n3o4p5q6
Revises: k0l1m2n3o4p5
Create Date: 2026-06-02

"""
from alembic import op
import sqlalchemy as sa

revision = 'l1m2n3o4p5q6'
down_revision = 'k0l1m2n3o4p5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('workers', sa.Column(
        'model',
        sa.String(100),
        nullable=False,
        server_default='google/gemma-4-31b-it:free',
    ))


def downgrade():
    op.drop_column('workers', 'model')
