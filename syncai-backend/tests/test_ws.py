"""
WebSocket 채팅 테스트
실행: pytest tests/test_ws.py -v -p no:cacheprovider
"""
import os
import tempfile
import pytest
import json
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
import uuid

from app.core.auth import create_access_token, hash_password
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.chat_room import ChatRoom

# 테스트용 SQLite DB (Windows/Linux 모두 호환)
_DB_PATH = os.path.join(tempfile.gettempdir(), "syncai_test_ws.db")
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
def setup_db(monkeypatch):
    app.dependency_overrides[get_db] = override_get_db
    # ws.py는 get_db가 아니라 SessionLocal()을 직접 연다 (방 조회·멤버십·메시지 저장)
    monkeypatch.setattr("app.database.SessionLocal", TestingSessionLocal)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


@pytest.fixture()
def shared_client(monkeypatch):
    """컨텍스트 매니저로 연 TestClient — 모든 WS 연결이 이벤트 루프 하나를 공유.
    (기본 client는 연결마다 루프가 달라 서로에게 broadcast하면 멈춘다)"""
    from unittest.mock import AsyncMock
    monkeypatch.setattr("app.routers.ws.redis_subscriber", AsyncMock(return_value=None))
    with TestClient(app) as c:
        yield c


def get_token(user_id) -> str:
    return create_access_token({"sub": str(user_id)})


def _make_user(db, name: str) -> User:
    user = User(id=uuid.uuid4(), email=f"{name}@example.com", name=name, hashed_password=hash_password("pw"))
    db.add(user)
    return user


@pytest.fixture()
def seed():
    """팀원 2명(user1, user2) + 팀 밖 사용자(outsider) + 같은 팀의 방 2개"""
    db = TestingSessionLocal()
    try:
        user1, user2, outsider = _make_user(db, "user1"), _make_user(db, "user2"), _make_user(db, "outsider")
        db.flush()
        team = Team(id=uuid.uuid4(), name="팀", owner_id=user1.id)
        db.add(team)
        db.flush()
        db.add_all([
            TeamMember(id=uuid.uuid4(), team_id=team.id, user_id=user1.id, role="owner"),
            TeamMember(id=uuid.uuid4(), team_id=team.id, user_id=user2.id, role="member"),
        ])
        room_a = ChatRoom(id=uuid.uuid4(), team_id=team.id, name="A")
        room_b = ChatRoom(id=uuid.uuid4(), team_id=team.id, name="B")
        db.add_all([room_a, room_b])
        db.commit()
        return {"user1": user1.id, "user2": user2.id, "outsider": outsider.id,
                "room_a": str(room_a.id), "room_b": str(room_b.id)}
    finally:
        db.close()


def _send(ws, content: str):
    ws.send_json({"type": "send_message", "content": content})


# ─────────────────────────────────────────
# WebSocket 채팅 테스트
# ─────────────────────────────────────────

def test_ws_chat_connect_and_receive(seed):
    """팀원 토큰으로 연결 후 메시지 송수신"""
    token = get_token(seed["user1"])

    with client.websocket_connect(f"/ws/rooms/{seed['room_a']}/chat?token={token}") as ws:
        _send(ws, "안녕하세요")
        data = ws.receive_json()
        assert data["type"] == "message"
        assert data["data"]["content"] == "안녕하세요"
        assert data["data"]["user"]["name"] == "user1"


def test_ws_chat_invalid_token():
    """잘못된 토큰이면 4001로 연결 거부"""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/rooms/room-abc/chat?token=invalid.token") as ws:
            ws.receive_json()


def test_ws_chat_non_member_rejected(seed):
    """팀 밖 사용자는 4003으로 연결 거부"""
    token = get_token(seed["outsider"])
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/rooms/{seed['room_a']}/chat?token={token}") as ws:
            ws.receive_json()


def test_ws_chat_multi_client_broadcast(seed, shared_client):
    """두 팀원이 같은 방에 연결 → 한 쪽 메시지가 양쪽에 전달"""
    token1 = get_token(seed["user1"])
    token2 = get_token(seed["user2"])
    room_id = seed["room_a"]

    with shared_client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token1}") as ws1, \
         shared_client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token2}") as ws2:

        _send(ws1, "모두에게 전달")

        # ws1 자신도 broadcast 수신
        msg1 = ws1.receive_json()
        assert msg1["type"] == "message"
        assert msg1["data"]["content"] == "모두에게 전달"

        # ws2도 수신
        msg2 = ws2.receive_json()
        assert msg2["type"] == "message"
        assert msg2["data"]["content"] == "모두에게 전달"


def test_ws_different_rooms_isolated(seed):
    """다른 방의 클라이언트에게는 메시지 전달 안 됨"""
    token = get_token(seed["user1"])

    with client.websocket_connect(f"/ws/rooms/{seed['room_a']}/chat?token={token}") as ws_a, \
         client.websocket_connect(f"/ws/rooms/{seed['room_b']}/chat?token={token}") as ws_b:

        _send(ws_a, "room-A 전용")
        msg = ws_a.receive_json()
        assert msg["data"]["content"] == "room-A 전용"

        # ws_b는 아무것도 못 받아야 함 (timeout으로 확인)
        import threading
        received = []
        def try_receive():
            try:
                received.append(ws_b.receive_json())
            except Exception:
                pass

        t = threading.Thread(target=try_receive, daemon=True)
        t.start()
        t.join(timeout=0.5)
        assert len(received) == 0, "다른 방 메시지가 유출됨"


# ─────────────────────────────────────────
# WebSocket Task 채널 테스트
# ─────────────────────────────────────────

def test_ws_task_connect(seed):
    """Task 채널 정상 연결"""
    token = get_token(seed["user1"])

    with client.websocket_connect(f"/ws/rooms/{seed['room_a']}/tasks?token={token}") as ws:
        # keep-alive ping 전송 (서버는 receive_text로 대기)
        ws.send_text("ping")
        # 연결 유지 확인 (에러 없으면 성공)
