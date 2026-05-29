"""add_team_invitations

Revision ID: a1b2c3d4e5f6
Revises: 4329f6ad8ac9
Create Date: 2026-05-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '4329f6ad8ac9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'team_invitations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('team_id', sa.UUID(), nullable=False),
        sa.Column('inviter_id', sa.UUID(), nullable=False),
        sa.Column('invitee_email', sa.String(255), nullable=False),
        sa.Column('status', sa.Enum('pending', 'accepted', 'rejected', name='invitationstatus'), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['inviter_id'], ['users.id']),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_team_invitations_invitee_email', 'team_invitations', ['invitee_email'])
    op.create_index('ix_team_invitations_team_id', 'team_invitations', ['team_id'])


def downgrade() -> None:
    op.drop_index('ix_team_invitations_team_id', table_name='team_invitations')
    op.drop_index('ix_team_invitations_invitee_email', table_name='team_invitations')
    op.drop_table('team_invitations')
    op.execute("DROP TYPE IF EXISTS invitationstatus")
