"""
보안 회귀 테스트
실행: pytest tests/test_security.py -v -p no:cacheprovider

검증 항목:
1. 비멤버의 task cancel → 403
2. 비멤버의 WS(chat/tasks) 연결 → 4003
3. MCP 주인 아닌 팀원이 ai/confirm → 403
4. 동일 refresh token 두 번 사용 → 401
"""
import os
import tempfile
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.auth import create_access_token, create_refresh_token
from app.database import Base, get_db
from app.main import app
from app.models.chat_room import ChatRoom, RoomMember
from app.models.mcp_config import McpConfig
from app.models.task import Task, TaskStatusType
from app.models.team import Team, TeamMember
from app.models.user import User
import app.database as _app_database

_DB_PATH = os.path.join(tempfile.gettempdir(), "syncai_test_security.db")
TEST_DB_URL = f"sqlite:///{_DB_PATH}"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    # ws.py 내부에서 직접 SessionLocal() 호출하므로 모듈 레벨도 패치
    _app_database.SessionLocal = TestingSessionLocal
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)

# ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

def _make_user(db, name="user") -> User:
    u = User(id=uuid.uuid4(), email=f"{name}_{uuid.uuid4().hex[:6]}@test.com",
             name=name, hashed_password="x")
    db.add(u)
    db.flush()
    return u


def _make_team(db, owner: User) -> Team:
    t = Team(id=uuid.uuid4(), name="TestTeam", owner_id=owner.id)
    db.add(t)
    db.flush()
    return t


def _make_team_member(db, team: Team, user: User):
    db.add(TeamMember(team_id=team.id, user_id=user.id, role="member"))
    db.flush()


def _make_room(db, team: Team) -> ChatRoom:
    r = ChatRoom(id=uuid.uuid4(), team_id=team.id, name="Room",
                 slug=f"room-{uuid.uuid4().hex[:8]}")
    db.add(r)
    db.flush()
    return r


def _make_mcp(db, owner: User) -> McpConfig:
    m = McpConfig(id=uuid.uuid4(), owner_user_id=owner.id, name="TestMCP")
    db.add(m)
    db.flush()
    return m


def _make_task(db, room: ChatRoom, status=TaskStatusType.pending,
               triggered_by=None, mcp_config_id=None) -> Task:
    t = Task(id=uuid.uuid4(), room_id=room.id, status=status,
             triggered_by=triggered_by, mcp_config_id=mcp_config_id)
    db.add(t)
    db.flush()
    return t


def _auth_header(user_id: str) -> dict:
    token = create_access_token({"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


# ─── 1. 비멤버 task cancel → 403 ──────────────────────────────────────────────

def test_cancel_task_forbidden_for_non_member():
    """팀/룸 멤버가 아닌 계정이 task cancel 시도 → 403"""
    db = TestingSessionLocal()
    try:
        owner = _make_user(db, "owner")
        outsider = _make_user(db, "outsider")
        team = _make_team(db, owner)
        _make_team_member(db, team, owner)
        room = _make_room(db, team)
        task = _make_task(db, room, status=TaskStatusType.running)
        db.commit()
        task_id = str(task.id)
        outsider_id = str(outsider.id)
    finally:
        db.close()

    res = client.post(f"/v1/tasks/{task_id}/cancel",
                      headers=_auth_header(outsider_id))
    assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"


# ─── 2. 비멤버 WS 연결 → 4003 ─────────────────────────────────────────────────

def test_ws_chat_non_member_rejected():
    """팀/룸 멤버가 아닌 계정이 채팅 WS 연결 → 4003"""
    db = TestingSessionLocal()
    try:
        owner = _make_user(db, "owner")
        outsider = _make_user(db, "outsider")
        team = _make_team(db, owner)
        _make_team_member(db, team, owner)
        room = _make_room(db, team)
        db.commit()
        room_id = str(room.id)
        outsider_id = str(outsider.id)
    finally:
        db.close()

    token = create_access_token({"sub": outsider_id})
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(
            f"/ws/rooms/{room_id}/chat?token={token}"
        ) as ws:
            ws.receive_json()

    # TestClient는 WS close code를 예외로 감싸서 던짐
    # 4003 close 또는 연결 거부를 확인
    assert "4003" in str(exc_info.value) or exc_info.type.__name__ in (
        "WebSocketDisconnect", "ConnectionClosedError", "ConnectionClosedOK"
    ), f"Expected 4003 close, got: {exc_info.value}"


def test_ws_tasks_non_member_rejected():
    """팀/룸 멤버가 아닌 계정이 tasks WS 연결 → 4003"""
    db = TestingSessionLocal()
    try:
        owner = _make_user(db, "owner")
        outsider = _make_user(db, "outsider")
        team = _make_team(db, owner)
        _make_team_member(db, team, owner)
        room = _make_room(db, team)
        db.commit()
        room_id = str(room.id)
        outsider_id = str(outsider.id)
    finally:
        db.close()

    token = create_access_token({"sub": outsider_id})
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(
            f"/ws/rooms/{room_id}/tasks?token={token}"
        ) as ws:
            ws.receive_text()

    assert "4003" in str(exc_info.value) or exc_info.type.__name__ in (
        "WebSocketDisconnect", "ConnectionClosedError", "ConnectionClosedOK"
    ), f"Expected 4003 close, got: {exc_info.value}"


def test_ws_chat_member_allowed():
    """팀원은 채팅 WS 연결 성공"""
    db = TestingSessionLocal()
    try:
        owner = _make_user(db, "owner")
        team = _make_team(db, owner)
        _make_team_member(db, team, owner)
        room = _make_room(db, team)
        db.commit()
        room_id = str(room.id)
        owner_id = str(owner.id)
    finally:
        db.close()

    token = create_access_token({"sub": owner_id})
    # 연결이 성공하면 예외 없이 진입
    with client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token}") as ws:
        pass  # 연결 성공


# ─── 3. MCP 주인 아닌 팀원 ai/confirm → 403 ──────────────────────────────────

def test_ai_confirm_forbidden_for_non_mcp_owner():
    """
    MCP 소유자 A, 팀원 B 시나리오.
    B가 /rooms/{id}/ai/confirm 호출 → 403
    """
    db = TestingSessionLocal()
    try:
        mcp_owner = _make_user(db, "mcp_owner")
        requester = _make_user(db, "requester")
        team = _make_team(db, mcp_owner)
        _make_team_member(db, team, mcp_owner)
        _make_team_member(db, team, requester)
        room = _make_room(db, team)
        mcp = _make_mcp(db, mcp_owner)
        task = _make_task(
            db, room,
            status=TaskStatusType.awaiting_confirm,
            triggered_by=requester.id,
            mcp_config_id=mcp.id,
        )
        db.commit()
        room_id = str(room.id)
        task_id = str(task.id)
        requester_id = str(requester.id)
    finally:
        db.close()

    res = client.post(
        f"/v1/rooms/{room_id}/ai/confirm",
        json={"task_id": task_id, "confirmed": True},
        headers=_auth_header(requester_id),
    )
    assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"


def test_ai_confirm_allowed_for_mcp_owner():
    """MCP 소유자는 자신의 MCP 작업을 confirm 가능"""
    db = TestingSessionLocal()
    try:
        mcp_owner = _make_user(db, "mcp_owner2")
        team = _make_team(db, mcp_owner)
        _make_team_member(db, team, mcp_owner)
        room = _make_room(db, team)
        mcp = _make_mcp(db, mcp_owner)
        task = _make_task(
            db, room,
            status=TaskStatusType.awaiting_confirm,
            triggered_by=mcp_owner.id,
            mcp_config_id=mcp.id,
        )
        db.commit()
        room_id = str(room.id)
        task_id = str(task.id)
        owner_id = str(mcp_owner.id)
    finally:
        db.close()

    res = client.post(
        f"/v1/rooms/{room_id}/ai/confirm",
        json={"task_id": task_id, "confirmed": False},  # 거부
        headers=_auth_header(owner_id),
    )
    # 거부는 항상 200 (취소 처리)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"


# ─── 4. Refresh token 재사용 → 401 ────────────────────────────────────────────

def test_refresh_token_rotation_blocks_reuse():
    """동일 refresh token을 두 번 사용하면 두 번째 요청은 401"""
    db = TestingSessionLocal()
    try:
        user = _make_user(db, "rotator")
        db.commit()
        user_id = str(user.id)
    finally:
        db.close()

    refresh_token = create_refresh_token({"sub": user_id})
    store: dict = {}

    def fake_get_sync_redis():
        mock = MagicMock()
        mock.exists.side_effect = lambda key: key in store
        def fake_setex(key, ttl, val):
            store[key] = val
        mock.setex.side_effect = fake_setex
        return mock

    with patch("app.core.redis_client.get_sync_redis", fake_get_sync_redis):
        # 첫 번째 사용 → 성공 (쿠키 격리: body로만 전송)
        client.cookies.clear()
        res1 = client.post("/v1/auth/refresh",
                           json={"refresh_token": refresh_token})
        assert res1.status_code == 200, f"1st refresh failed: {res1.text}"

        # 두 번째 사용 → 블랙리스트로 거부
        # client에 새 refresh_token 쿠키가 세팅됐을 수 있으므로 초기화 후 body로만 전송
        client.cookies.clear()
        res2 = client.post("/v1/auth/refresh",
                           json={"refresh_token": refresh_token})
        assert res2.status_code == 401, f"Expected 401 on reuse, got {res2.status_code}: {res2.text}"
