"""add slug to chat_rooms

Revision ID: m2n3o4p5q6r7
Revises: l1m2n3o4p5q6
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'm2n3o4p5q6r7'
down_revision = 'l1m2n3o4p5q6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chat_rooms', sa.Column('slug', sa.String(120), nullable=True))
    op.create_unique_constraint('uq_chat_rooms_slug', 'chat_rooms', ['slug'])
    op.create_index('ix_chat_rooms_slug', 'chat_rooms', ['slug'])


def downgrade() -> None:
    op.drop_index('ix_chat_rooms_slug', table_name='chat_rooms')
    op.drop_constraint('uq_chat_rooms_slug', 'chat_rooms', type_='unique')
    op.drop_column('chat_rooms', 'slug')
