"""ws_mcp_agent: add is_online, make endpoint nullable

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-05-28

변경 내용:
- mcp_configs.is_online (Boolean, default False): WS 연결 상태 실시간 반영
- mcp_configs.endpoint nullable=True: Cloudflare URL 불필요, deprecated
"""
from alembic import op
import sqlalchemy as sa

revision = 'j9k0l1m2n3o4'
down_revision = 'i8j9k0l1m2n3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. is_online 컬럼 추가 (기본값 False)
    op.add_column(
        'mcp_configs',
        sa.Column('is_online', sa.Boolean(), nullable=False, server_default='false')
    )

    # 2. endpoint 컬럼 nullable 처리 (WS 전환 후 불필요)
    op.alter_column(
        'mcp_configs',
        'endpoint',
        existing_type=sa.String(500),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'mcp_configs',
        'endpoint',
        existing_type=sa.String(500),
        nullable=False,
        server_default='',
    )
    op.drop_column('mcp_configs', 'is_online')
