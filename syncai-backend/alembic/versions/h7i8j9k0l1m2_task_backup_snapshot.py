"""task_backup_snapshot — Task에 backup_snapshot/mcp_config_id 추가

Revision ID: h7i8j9k0l1m2
Revises: g6h7i8j9k0l1
Create Date: 2026-05-14

변경 내용:
- tasks.backup_snapshot (JSON, nullable): AI 실행 전 파일 원본 스냅샷
- tasks.mcp_config_id (UUID FK → mcp_configs.id, ON DELETE SET NULL): 실행 MCP 추적
"""
from alembic import op
import sqlalchemy as sa

revision = 'h7i8j9k0l1m2'
down_revision = 'g6h7i8j9k0l1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # backup_snapshot: {파일경로: 원본내용 | null} dict (PostgreSQL JSON 타입)
    op.add_column('tasks', sa.Column('backup_snapshot', sa.JSON(), nullable=True))

    # mcp_config_id: revert 시 어느 MCP로 복원할지 추적
    # MCP Config 삭제 시 SET NULL (task 히스토리는 보존, revert만 불가)
    op.add_column('tasks', sa.Column('mcp_config_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_mcp_config_id',
        'tasks', 'mcp_configs',
        ['mcp_config_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tasks_mcp_config_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'mcp_config_id')
    op.drop_column('tasks', 'backup_snapshot')
