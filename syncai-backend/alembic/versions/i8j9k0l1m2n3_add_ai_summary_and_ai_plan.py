"""add_ai_summary_and_ai_plan

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2026-05-27

변경 내용:
- chat_rooms.ai_summary (Text, nullable): 오래된 채팅 요약 (토큰 절약용)
- messages.type Enum에 ai_plan 추가: AI 작업 계획 제안 메시지 (사용자 동의 대기)
"""
from alembic import op
import sqlalchemy as sa

revision = 'i8j9k0l1m2n3'
down_revision = 'h7i8j9k0l1m2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. chat_rooms에 ai_summary 컬럼 추가
    op.add_column(
        'chat_rooms',
        sa.Column('ai_summary', sa.Text(), nullable=True)
    )

    # 2. messages.type Enum에 ai_plan 추가 (PostgreSQL: ALTER TYPE)
    op.execute("ALTER TYPE messagetype ADD VALUE IF NOT EXISTS 'ai_plan'")

    # 3. tasks.status Enum에 awaiting_confirm, cancelled 추가
    op.execute("ALTER TYPE taskstatustype ADD VALUE IF NOT EXISTS 'awaiting_confirm'")
    op.execute("ALTER TYPE taskstatustype ADD VALUE IF NOT EXISTS 'cancelled'")


def downgrade() -> None:
    # ai_summary 컬럼 제거
    op.drop_column('chat_rooms', 'ai_summary')

    # PostgreSQL은 Enum 값 제거가 복잡하므로 downgrade 시 타입은 그대로 둠
    # (ai_plan 값을 가진 행이 없다면 실질적 문제 없음)
