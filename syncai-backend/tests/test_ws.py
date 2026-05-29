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
from app.core.auth import create_access_token

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
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def get_token(user_id: str = "test-user-id") -> str:
    return create_access_token({"sub": user_id})


# ─────────────────────────────────────────
# WebSocket 채팅 테스트
# ─────────────────────────────────────────

def test_ws_chat_connect_and_receive():
    """정상 토큰으로 연결 후 메시지 송수신"""
    token = get_token("user-1")
    room_id = "room-abc"

    with client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token}") as ws:
        ws.send_json({"content": "안녕하세요", "user_id": "user-1"})
        data = ws.receive_json()
        assert data["type"] == "message"
        assert data["data"]["content"] == "안녕하세요"


def test_ws_chat_invalid_token():
    """잘못된 토큰이면 4001로 연결 거부"""
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/rooms/room-abc/chat?token=invalid.token") as ws:
            ws.receive_json()


def test_ws_chat_multi_client_broadcast():
    """두 클라이언트가 같은 방에 연결 → 한 쪽 메시지가 양쪽에 전달"""
    token1 = get_token("user-1")
    token2 = get_token("user-2")
    room_id = "room-multi"

    with client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token1}") as ws1, \
         client.websocket_connect(f"/ws/rooms/{room_id}/chat?token={token2}") as ws2:

        ws1.send_json({"content": "모두에게 전달", "user_id": "user-1"})

        # ws1 자신도 broadcast 수신
        msg1 = ws1.receive_json()
        assert msg1["type"] == "message"
        assert msg1["data"]["content"] == "모두에게 전달"

        # ws2도 수신
        msg2 = ws2.receive_json()
        assert msg2["type"] == "message"
        assert msg2["data"]["content"] == "모두에게 전달"


def test_ws_different_rooms_isolated():
    """다른 방의 클라이언트에게는 메시지 전달 안 됨"""
    token = get_token("user-1")

    with client.websocket_connect(f"/ws/rooms/room-A/chat?token={token}") as ws_a, \
         client.websocket_connect(f"/ws/rooms/room-B/chat?token={token}") as ws_b:

        ws_a.send_json({"content": "room-A 전용", "user_id": "user-1"})
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

        t = threading.Thread(target=try_receive)
        t.start()
        t.join(timeout=0.5)
        assert len(received) == 0, "다른 방 메시지가 유출됨"


# ─────────────────────────────────────────
# WebSocket Task 채널 테스트
# ─────────────────────────────────────────

def test_ws_task_connect():
    """Task 채널 정상 연결"""
    token = get_token("user-1")
    room_id = "room-task"

    with client.websocket_connect(f"/ws/rooms/{room_id}/tasks?token={token}") as ws:
        # keep-alive ping 전송 (서버는 receive_text로 대기)
        ws.send_text("ping")
        # 연결 유지 확인 (에러 없으면 성공)
