from pydantic import BaseModel, ConfigDict
from datetime import datetime
import uuid


class McpConfigCreate(BaseModel):
    name: str
    mcp_token: str | None = None
    base_dir: str | None = None


class McpConfigUpdate(BaseModel):
    name: str | None = None
    base_dir: str | None = None


class McpConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    name: str
    endpoint: str | None = None
    base_dir: str | None = None
    mcp_token: str | None = None
    is_online: bool = False
    created_at: datetime


class McpConfigTeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mcp_config_id: uuid.UUID
    team_id: uuid.UUID
    is_public: bool


class McpConfigWithTeam(McpConfigOut):
    """팀 내 접근 가능한 MCP 목록 응답 — is_public 포함"""
    is_public: bool


class McpHeartbeatRequest(BaseModel):
    """MCP 서버 → 백엔드 heartbeat 요청"""
    mcp_token: str
    endpoint: str  # 자신의 엔드포인트 (Cloudflare tunnel URL)
    base_dir: str | None = None  # .env MCP_BASE_DIR — DB null일 때만 반영


class McpHeartbeatResponse(BaseModel):
    ok: bool
    mcp_config_id: str
    base_dir: str | None = None


class McpAutoRegisterRequest(BaseModel):
    mcp_token: str
    name: str = "My PC"
    base_dir: str | None = None
    endpoint: str = ""  # MCP 서버 현재 tunnel URL — 재연결 신호용


class McpAutoRegisterResponse(BaseModel):
    ok: bool
    mcp_config_id: str
    created: bool  # True=신규 생성, False=기존 반환


class McpRenameRequest(BaseModel):
    name: str
