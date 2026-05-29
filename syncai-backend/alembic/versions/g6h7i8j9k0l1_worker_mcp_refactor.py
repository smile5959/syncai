"""worker_mcp_refactor — Worker 슬롯 / MCP Config 분리

Revision ID: g6h7i8j9k0l1
Revises: f5g6h7i8j9k0
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa

revision = 'g6h7i8j9k0l1'
down_revision = 'f5g6h7i8j9k0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. 신규 ENUM 타입 (worker status) ──────────────────────────────
    op.execute("CREATE TYPE workerstatustype AS ENUM ('idle', 'busy')")

    # ── 2. mcp_configs 테이블 생성 ────────────────────────────────────
    op.create_table(
        'mcp_configs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('owner_user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('endpoint', sa.String(500), nullable=False, server_default=''),
        sa.Column('base_dir', sa.String(1000), nullable=True),
        sa.Column('mcp_token', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── 3. mcp_config_teams 테이블 생성 ──────────────────────────────
    op.create_table(
        'mcp_config_teams',
        sa.Column('mcp_config_id', sa.Uuid(), nullable=False),
        sa.Column('team_id', sa.Uuid(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['mcp_config_id'], ['mcp_configs.id']),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id']),
        sa.PrimaryKeyConstraint('mcp_config_id', 'team_id'),
    )

    # ── 4. 데이터 마이그레이션: workers → mcp_configs ────────────────
    # 기존 Workers에 mcp_endpoint가 있는 경우 → mcp_configs로 이전 (팀 owner 소유)
    op.execute("""
        WITH inserted AS (
            INSERT INTO mcp_configs (id, owner_user_id, name, endpoint, base_dir, mcp_token, created_at)
            SELECT
                gen_random_uuid(),
                t.owner_id,
                w.name,
                COALESCE(w.mcp_endpoint, ''),
                w.mcp_base_dir,
                w.mcp_token,
                COALESCE(w.created_at, NOW())
            FROM workers w
            JOIN teams t ON t.id = w.team_id
            WHERE w.mcp_endpoint IS NOT NULL AND w.mcp_endpoint <> ''
            RETURNING id, owner_user_id, name, mcp_token
        )
        INSERT INTO mcp_config_teams (mcp_config_id, team_id, is_public)
        SELECT ins.id, w.team_id, true
        FROM inserted ins
        JOIN workers w ON w.mcp_token = ins.mcp_token
        WHERE w.mcp_endpoint IS NOT NULL AND w.mcp_endpoint <> ''
        ON CONFLICT DO NOTHING
    """)

    # ── 5. chat_rooms.worker_id 제거 ──────────────────────────────────
    op.drop_constraint('chat_rooms_worker_id_fkey', 'chat_rooms', type_='foreignkey')
    op.drop_column('chat_rooms', 'worker_id')

    # ── 6. tasks.worker_id → nullable (큐 대기 중 task는 worker 미배정) ─
    op.alter_column('tasks', 'worker_id', nullable=True)

    # ── 7. workers 테이블 기존 컬럼 제거 ─────────────────────────────
    op.drop_column('workers', 'connection_status')
    op.drop_column('workers', 'task_status')
    op.drop_column('workers', 'mcp_endpoint')
    op.drop_column('workers', 'mcp_token')
    op.drop_column('workers', 'mcp_base_dir')
    op.drop_column('workers', 'last_heartbeat_at')

    # ── 8. workers 테이블 새 컬럼 추가 ───────────────────────────────
    op.add_column('workers', sa.Column(
        'status',
        sa.Enum('idle', 'busy', name='workerstatustype', create_type=False),
        nullable=False,
        server_default='idle',
    ))
    op.add_column('workers', sa.Column('current_task_id', sa.Uuid(), nullable=True))

    # ── 9. 구 ENUM 타입 삭제 ─────────────────────────────────────────
    op.execute("DROP TYPE IF EXISTS connectionstatus")
    op.execute("DROP TYPE IF EXISTS taskstatus")


def downgrade() -> None:
    # new worker columns 제거
    op.drop_column('workers', 'current_task_id')
    op.drop_column('workers', 'status')

    # 구 ENUM 타입 복구
    op.execute("CREATE TYPE connectionstatus AS ENUM ('online', 'offline')")
    op.execute("CREATE TYPE taskstatus AS ENUM ('idle', 'busy')")

    # 구 workers 컬럼 복구
    op.add_column('workers', sa.Column('last_heartbeat_at', sa.DateTime(), nullable=True))
    op.add_column('workers', sa.Column('mcp_base_dir', sa.String(1000), nullable=True))
    op.add_column('workers', sa.Column('mcp_token', sa.String(500), nullable=True))
    op.add_column('workers', sa.Column('mcp_endpoint', sa.String(500), nullable=False, server_default=''))
    op.add_column('workers', sa.Column('task_status', sa.Enum('idle', 'busy', name='taskstatus', create_type=False), nullable=False, server_default='idle'))
    op.add_column('workers', sa.Column('connection_status', sa.Enum('online', 'offline', name='connectionstatus', create_type=False), nullable=False, server_default='offline'))

    # tasks.worker_id 다시 NOT NULL
    op.alter_column('tasks', 'worker_id', nullable=False)

    # chat_rooms.worker_id 복구
    op.add_column('chat_rooms', sa.Column('worker_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('chat_rooms_worker_id_fkey', 'chat_rooms', 'workers', ['worker_id'], ['id'])

    # mcp_config_teams, mcp_configs 삭제
    op.drop_table('mcp_config_teams')
    op.drop_table('mcp_configs')

    op.execute("DROP TYPE IF EXISTS workerstatustype")
