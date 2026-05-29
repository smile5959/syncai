"""add manager role to roletype

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-12 00:00:00.000000

"""
from alembic import op

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL에서 Enum에 값 추가 (트랜잭션 밖에서 실행)
    op.execute("ALTER TYPE roletype ADD VALUE IF NOT EXISTS 'manager'")


def downgrade() -> None:
    # PostgreSQL Enum에서 값 제거는 지원하지 않으므로 pass
    pass
