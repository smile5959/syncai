"""add interrupted task status and interrupted_context column

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-06-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'o4p5q6r7s8t9'
down_revision = 'n3o4p5q6r7s8'
branch_labels = None
depends_on = None

# PostgreSQL ENUM ADD VALUE는 트랜잭션 밖에서 실행해야 함
def upgrade():
    # ENUM 값 추가 — 트랜잭션 밖에서 실행
    connection = op.get_bind()
    connection.execution_options(isolation_level="AUTOCOMMIT")
    connection.execute(sa.text("ALTER TYPE taskstatustype ADD VALUE IF NOT EXISTS 'interrupted'"))
    connection.execution_options(isolation_level="READ COMMITTED")

    # interrupted_context 컬럼 추가
    op.add_column(
        'tasks',
        sa.Column('interrupted_context', postgresql.JSON(astext_type=sa.Text()), nullable=True)
    )


def downgrade():
    op.drop_column('tasks', 'interrupted_context')
    # PostgreSQL은 ENUM 값 제거를 지원하지 않으므로 downgrade 시 enum 값은 유지
