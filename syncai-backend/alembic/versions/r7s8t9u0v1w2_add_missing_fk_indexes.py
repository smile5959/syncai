"""add missing FK indexes (room_members, team_members, chat_rooms, workers, mcp_configs)

require_room_access / require_team_member 가 매 요청마다 풀 스캔하던 문제 수정.

Revision ID: r7s8t9u0v1w2
Revises: q6r7s8t9u0v1
Create Date: 2026-06-24

"""
from alembic import op

revision = 'r7s8t9u0v1w2'
down_revision = 'q6r7s8t9u0v1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # require_room_access: RoomMember 조회 — (room_id, user_id) 항상 같이 쓰임
    op.create_index('ix_room_members_room_id_user_id', 'room_members', ['room_id', 'user_id'])

    # require_room_access / require_team_member: TeamMember 조회
    op.create_index('ix_team_members_team_id_user_id', 'team_members', ['team_id', 'user_id'])

    # list_rooms: ChatRoom.team_id 필터
    op.create_index('ix_chat_rooms_team_id', 'chat_rooms', ['team_id'])

    # list workers: Worker.team_id 필터
    op.create_index('ix_workers_team_id', 'workers', ['team_id'])

    # MCP listMine: McpConfig.owner_user_id 필터
    op.create_index('ix_mcp_configs_owner_user_id', 'mcp_configs', ['owner_user_id'])

    # MCP token 조회 (heartbeat / sse / lookup-by-email)
    op.create_index('ix_mcp_configs_mcp_token', 'mcp_configs', ['mcp_token'])

    # McpConfigTeam: team_id 기반 조회 (listForTeam)
    op.create_index('ix_mcp_config_teams_team_id', 'mcp_config_teams', ['team_id'])


def downgrade() -> None:
    op.drop_index('ix_mcp_config_teams_team_id', table_name='mcp_config_teams')
    op.drop_index('ix_mcp_configs_mcp_token', table_name='mcp_configs')
    op.drop_index('ix_mcp_configs_owner_user_id', table_name='mcp_configs')
    op.drop_index('ix_workers_team_id', table_name='workers')
    op.drop_index('ix_chat_rooms_team_id', table_name='chat_rooms')
    op.drop_index('ix_team_members_team_id_user_id', table_name='team_members')
    op.drop_index('ix_room_members_room_id_user_id', table_name='room_members')
