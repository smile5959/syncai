"""add composite index on messages(room_id, created_at)

Revision ID: q6r7s8t9u0v1
Revises: p5q6r7s8t9u0
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'q6r7s8t9u0v1'
down_revision = 'p5q6r7s8t9u0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # (room_id, created_at DESC) 복합 인덱스 — 채팅방 메시지 조회 최적화
    # 기존 단일 인덱스(ix_messages_room_id, ix_messages_created_at)는 유지
    op.create_index(
        'ix_messages_room_id_created_at',
        'messages',
        ['room_id', sa.text('created_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_messages_room_id_created_at', table_name='messages')
