"""add auto_approve to mcp_config

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa

revision = 'k0l1m2n3o4p5'
down_revision = 'j9k0l1m2n3o4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('mcp_configs', sa.Column('auto_approve', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('mcp_configs', 'auto_approve')
