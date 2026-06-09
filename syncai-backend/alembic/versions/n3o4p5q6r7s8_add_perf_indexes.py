"""add performance indexes

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-06-09

"""
from alembic import op

revision = 'n3o4p5q6r7s8'
down_revision = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_messages_room_id', 'messages', ['room_id'])
    op.create_index('ix_messages_created_at', 'messages', ['created_at'])
    op.create_index('ix_tasks_status', 'tasks', ['status'])
    op.create_index('ix_tasks_room_id', 'tasks', ['room_id'])
    op.create_index('ix_file_locks_file_path', 'file_locks', ['file_path'])


def downgrade() -> None:
    op.drop_index('ix_file_locks_file_path', table_name='file_locks')
    op.drop_index('ix_tasks_room_id', table_name='tasks')
    op.drop_index('ix_tasks_status', table_name='tasks')
    op.drop_index('ix_messages_created_at', table_name='messages')
    op.drop_index('ix_messages_room_id', table_name='messages')
