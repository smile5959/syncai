"""
엔드투엔드 통합 테스트: Worker 큐 → @mention → diff → revert
실행: pytest tests/test_e2e_ai_flow.py -v -p no:cacheprovider

필요 환경변수:
  SECRET_KEY="test-secret-key-for-testing-only-32chars!!"
  DATABASE_URL="sqlite:////tmp/syncai_test_e2e.db"

테스트 범위:
  1. 기본 AI 흐름 (POST /ai → completed, diff 생성)
  2. 파일 변경 없이 텍스트만 반환 (diff=None)
  3. @mention으로 특정 MCP 선택
  4. public MCP 없으면 400
  5. Worker busy 시 큐 대기 → 해제 후 자동 실행
  6. Revert — 수정된 파일 원본으로 복원 (write_file 호출)
  7. Revert — AI가 새로 만든 파일 삭제 (delete_file 호출)
  8. Revert — pending 상태 거부 (400)
  9. Revert — backup_snapshot 없으면 422
  10. Revert — 두 번 revert 거부 (400)

Mock 전략:
  - Gemini (AsyncOpenAI): patch("app.agents.supervisor.AsyncOpenAI") + _get_client
  - MCP call_tool: patch("app.agents.mcp_client.MCPClient.call_tool")
  - Redis startup: patch("app.routers.ws.redis_subscriber")
  - SessionLocal: monkeypatch("app.routers.messages.SessionLocal")
    → _run_ai_task / _release_worker가 직접 SessionLocal() 호출하므로 필수
"""

import asyncio
import json
import uuid
import os
import tempfile
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.core.auth import create_access_token, hash_password
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.chat_room import ChatRoom, RoomMember
from app.models.worker import Worker, WorkerStatus
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.models.task import Task, TaskStatusType
from app.models.message import Message

# ─────────────────────────────────────────
# DB 설정
# file-based SQLite 필요:
#   _run_ai_task가 별도 SessionLocal()을 생성하므로
#   in-memory(:memory:)는 연결 간 데이터 공유 불가
# tempfile.gettempdir() 사용 → Windows/Linux 모두 호환
# ─────────────────────────────────────────
_DB_PATH = os.path.join(tempfile.gettempdir(), "syncai_test_e2e.db")
TEST_DB_URL = f"sqlite:///{_DB_PATH}"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ─────────────────────────────────────────
# OpenAI(Gemini) mock 응답 헬퍼
# ─────────────────────────────────────────

def _openai_stop(content: str):
    """finish_reason=stop, 텍스트 응답"""
    msg = MagicMock()
    msg.content = content
    msg.tool_calls = None
    choice = MagicMock()
    choice.finish_reason = "stop"
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _openai_tool_call(tool_name: str, args: dict, call_id: str = "tc_1"):
    """finish_reason=tool_calls, 단일 tool_call"""
    tc = MagicMock()
    tc.id = call_id
    tc.function.name = tool_name
    tc.function.arguments = json.dumps(args)

    msg = MagicMock()
    msg.content = None
    msg.tool_calls = [tc]
    choice = MagicMock()
    choice.finish_reason = "tool_calls"
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


# ─────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    """각 테스트 전 DB 초기화 + 큐 초기화"""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # 팀별 큐 전역 상태 초기화 (테스트 간 누수 방지)
    import app.routers.messages as msg_module
    msg_module._team_queues.clear()

    yield

    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def seed(db):
    """기본 테스트 데이터: user, team, room, worker(idle), mcp_config(public)"""
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        name="테스터",
        hashed_password=hash_password("pw"),
    )
    db.add(user)

    team = Team(
        id=uuid.uuid4(),
        name="테스트팀",
        owner_id=user.id,
    )
    db.add(team)

    team_member = TeamMember(
        id=uuid.uuid4(),
        team_id=team.id,
        user_id=user.id,
        role="owner",
    )
    db.add(team_member)

    room = ChatRoom(
        id=uuid.uuid4(),
        team_id=team.id,
        name="일반",
    )
    db.add(room)

    worker = Worker(
        id=uuid.uuid4(),
        team_id=team.id,
        name="내PC",
        status=WorkerStatus.idle,
    )
    db.add(worker)

    mcp_config = McpConfig(
        id=uuid.uuid4(),
        owner_user_id=user.id,
        name="내PC",
        endpoint="http://localhost:7860",
        base_dir="C:/project",
        mcp_token="test-token",
    )
    db.add(mcp_config)

    mcp_team = McpConfigTeam(
        mcp_config_id=mcp_config.id,
        team_id=team.id,
        is_public=True,
    )
    db.add(mcp_team)
    db.commit()

    return {
        "user": user,
        "team": team,
        "room": room,
        "worker": worker,
        "mcp_config": mcp_config,
    }


@pytest.fixture()
def token(seed):
    user = seed["user"]
    return create_access_token({"sub": str(user.id)})


@pytest_asyncio.fixture()
async def client(token, monkeypatch):
    """
    httpx.AsyncClient + FastAPI app.
    monkeypatch 적용 순서:
      1. get_db override → TestingSessionLocal
      2. SessionLocal 직접 참조 교체 (messages.py 내부용)
      3. redis_subscriber → no-op (startup 이벤트 Redis 연결 방지)
    """
    # 1. FastAPI dependency override
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # 2. _run_ai_task / _release_worker의 직접 SessionLocal() 호출 교체
    monkeypatch.setattr("app.routers.messages.SessionLocal", TestingSessionLocal)

    # 3. startup 이벤트의 Redis 무한루프 방지
    monkeypatch.setattr("app.routers.ws.redis_subscriber", AsyncMock(return_value=None))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ─────────────────────────────────────────
# 헬퍼: task 완료 대기
# ─────────────────────────────────────────

async def _wait_for_task(client, task_id: str, target_status: str, retries: int = 20) -> dict:
    """task가 target_status가 될 때까지 폴링 (최대 retries * 0.1s)"""
    for _ in range(retries):
        await asyncio.sleep(0.1)
        resp = await client.get(f"/v1/tasks/{task_id}")
        if resp.status_code == 200:
            data = resp.json()
            if data["status"] == target_status:
                return data
    return resp.json()


# ─────────────────────────────────────────
# Case 1: 기본 AI 흐름 (write_file → diff 생성)
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_basic_ai_flow(client, seed):
    """
    POST /ai → Gemini가 write_file 호출 → task completed
    검증: result_diff에 diff 포함, has_snapshot=True
    """
    room_id = str(seed["room"].id)

    # MCP: read_file("before") → write_file(None) 순서
    mcp_side_effects = ["기존 내용\n", None]

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_openai, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://x/", "k"))), \
         patch("app.agents.mcp_client.MCPClient.call_tool", new=AsyncMock(side_effect=mcp_side_effects)):

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(side_effect=[
            _openai_tool_call("write_file", {"path": "app/main.py", "content": "새 내용\n"}),
            _openai_stop("파일을 수정했습니다."),
        ])

        resp = await client.post(f"/v1/rooms/{room_id}/ai", json={"content": "/ai main.py 수정해줘"})
        assert resp.status_code == 202
        task_id = resp.json()["task_id"]

        task_data = await _wait_for_task(client, task_id, "completed")

    assert task_data["status"] == "completed"
    assert task_data["result_diff"] is not None
    assert "app/main.py" in task_data["result_diff"]
    assert task_data["has_snapshot"] is True


# ─────────────────────────────────────────
# Case 2: 파일 변경 없이 텍스트만 반환
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_no_file_change_no_diff(client, seed):
    """
    Gemini가 툴 호출 없이 텍스트만 반환 → diff=None, has_snapshot=False
    """
    room_id = str(seed["room"].id)

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_openai, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://x/", "k"))):

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(
            return_value=_openai_stop("파일 변경 없이 설명만 드렸습니다.")
        )

        resp = await client.post(f"/v1/rooms/{room_id}/ai", json={"content": "/ai 프로젝트 구조 설명해줘"})
        assert resp.status_code == 202
        task_id = resp.json()["task_id"]

        task_data = await _wait_for_task(client, task_id, "completed")

    assert task_data["status"] == "completed"
    assert task_data["result_diff"] is None
    assert task_data["has_snapshot"] is False


# ─────────────────────────────────────────
# Case 3: @mention으로 특정 MCP 선택
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_mention_selects_correct_mcp(client, seed, db):
    """
    두 번째 MCP "다른PC" 추가 후 @다른PC 멘션 → 두 번째 MCP로 task 실행
    """
    room_id = str(seed["room"].id)
    user = seed["user"]
    team = seed["team"]

    # 두 번째 MCP 등록
    mcp2 = McpConfig(
        id=uuid.uuid4(),
        owner_user_id=user.id,
        name="다른PC",
        endpoint="http://localhost:7861",
        base_dir="D:/other",
        mcp_token="other-token",
    )
    db.add(mcp2)
    db.add(McpConfigTeam(mcp_config_id=mcp2.id, team_id=team.id, is_public=True))
    db.commit()

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_openai, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://x/", "k"))):

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(
            return_value=_openai_stop("다른PC에서 작업했습니다.")
        )

        resp = await client.post(
            f"/v1/rooms/{room_id}/ai",
            json={"content": "/ai @다른PC 디렉토리 보여줘"},
        )
        assert resp.status_code == 202
        task_id = resp.json()["task_id"]

        task_data = await _wait_for_task(client, task_id, "completed")

    assert task_data["status"] == "completed"

    # mcp_config_id가 두 번째 MCP인지 확인
    task_resp = await client.get(f"/v1/tasks/{task_id}")
    task_json = task_resp.json()
    # TaskOut에는 mcp_config_id가 없으므로 DB 직접 확인
    db.expire_all()
    task_obj = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    assert task_obj is not None
    assert str(task_obj.mcp_config_id) == str(mcp2.id)


# ─────────────────────────────────────────
# Case 4: public MCP 없으면 400
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_public_mcp_returns_400(client, seed, db):
    """
    mcp_config_team.is_public=False인 경우 → 400
    """
    room_id = str(seed["room"].id)

    # public 플래그 해제
    mcp_team = db.query(McpConfigTeam).filter(
        McpConfigTeam.mcp_config_id == seed["mcp_config"].id
    ).first()
    mcp_team.is_public = False
    db.commit()

    resp = await client.post(f"/v1/rooms/{room_id}/ai", json={"content": "/ai 뭔가해줘"})
    assert resp.status_code == 400
    assert "MCP" in resp.json()["detail"]


# ─────────────────────────────────────────
# Case 5: Worker busy → 큐 대기 → 해제 후 자동 실행
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_worker_queue_then_auto_execute(client, seed, db):
    """
    worker를 busy 상태로 만들기 → POST /ai → task pending(queued)
    → _release_worker 직접 호출 → 자동 실행 → completed
    """
    from app.routers.messages import _release_worker

    room_id = str(seed["room"].id)
    worker = seed["worker"]
    team = seed["team"]

    # worker를 busy 상태로 강제 설정
    worker.status = WorkerStatus.busy
    db.commit()

    with patch("app.agents.supervisor.AsyncOpenAI") as mock_openai, \
         patch("app.agents.supervisor._get_client", new=AsyncMock(return_value=("https://x/", "k"))):

        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create = AsyncMock(
            return_value=_openai_stop("큐에서 실행됐습니다.")
        )

        resp = await client.post(f"/v1/rooms/{room_id}/ai", json={"content": "/ai 큐 테스트"})
        assert resp.status_code == 202
        task_id = resp.json()["task_id"]

        # 즉시 조회하면 아직 pending
        await asyncio.sleep(0.05)
        task_resp = await client.get(f"/v1/tasks/{task_id}")
        assert task_resp.json()["status"] == "pending"

        # worker idle로 복구 후 _release_worker 호출 → 큐 자동 소비
        db.refresh(worker)
        worker.status = WorkerStatus.idle
        db.commit()
        await _release_worker(str(worker.id), str(team.id))

        task_data = await _wait_for_task(client, task_id, "completed")

    assert task_data["status"] == "completed"


# ─────────────────────────────────────────
# Case 6: Revert — 수정된 파일 원본 복원
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_revert_restores_modified_file(client, seed, db):
    """
    completed task with backup_snapshot={"app/main.py": "원본내용"}
    → POST /revert → write_file("app/main.py", "원본내용") 호출, status=reverted
    """
    room_id = str(seed["room"].id)
    user = seed["user"]
    mcp_config = seed["mcp_config"]

    task = Task(
        id=uuid.uuid4(),
        room_id=seed["room"].id,
        worker_id=seed["worker"].id,
        triggered_by=user.id,
        status=TaskStatusType.completed,
        result_diff="--- a/app/main.py\n+++ b/app/main.py\n",
        backup_snapshot={"app/main.py": "원본내용\n"},
        mcp_config_id=mcp_config.id,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()

    with patch("app.agents.mcp_client.MCPClient.call_tool", new=AsyncMock(return_value="ok")) as mock_tool:
        resp = await client.post(f"/v1/tasks/{str(task.id)}/revert")

    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # write_file 호출 확인
    mock_tool.assert_called_once_with("write_file", {"path": "app/main.py", "content": "원본내용\n"})

    # DB 상태 확인
    db.expire_all()
    updated = db.query(Task).filter(Task.id == task.id).first()
    assert updated.status == TaskStatusType.reverted


# ─────────────────────────────────────────
# Case 7: Revert — AI가 새로 생성한 파일 삭제
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_revert_deletes_newly_created_file(client, seed, db):
    """
    backup_snapshot={"new_file.py": None} (before=None → AI 신규 생성)
    → POST /revert → delete_file("new_file.py") 호출
    """
    room_id = str(seed["room"].id)
    user = seed["user"]
    mcp_config = seed["mcp_config"]

    task = Task(
        id=uuid.uuid4(),
        room_id=seed["room"].id,
        worker_id=seed["worker"].id,
        triggered_by=user.id,
        status=TaskStatusType.completed,
        backup_snapshot={"new_file.py": None},
        mcp_config_id=mcp_config.id,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()

    with patch("app.agents.mcp_client.MCPClient.call_tool", new=AsyncMock(return_value="ok")) as mock_tool:
        resp = await client.post(f"/v1/tasks/{str(task.id)}/revert")

    assert resp.status_code == 200
    mock_tool.assert_called_once_with("delete_file", {"path": "new_file.py"})

    db.expire_all()
    updated = db.query(Task).filter(Task.id == task.id).first()
    assert updated.status == TaskStatusType.reverted


# ─────────────────────────────────────────
# Case 8: Revert — pending 상태 거부 (400)
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_revert_pending_task_returns_400(client, seed, db):
    """pending 상태 task → POST /revert → 400"""
    room_id = str(seed["room"].id)

    task = Task(
        id=uuid.uuid4(),
        room_id=seed["room"].id,
        worker_id=None,
        triggered_by=seed["user"].id,
        status=TaskStatusType.pending,
        backup_snapshot={"a.py": "내용"},
        mcp_config_id=seed["mcp_config"].id,
    )
    db.add(task)
    db.commit()

    resp = await client.post(f"/v1/tasks/{str(task.id)}/revert")
    assert resp.status_code == 400
    assert "completed" in resp.json()["detail"].lower()


# ─────────────────────────────────────────
# Case 9: Revert — backup_snapshot 없으면 422
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_revert_no_snapshot_returns_422(client, seed, db):
    """completed이지만 backup_snapshot=None → 422"""
    room_id = str(seed["room"].id)

    task = Task(
        id=uuid.uuid4(),
        room_id=seed["room"].id,
        worker_id=seed["worker"].id,
        triggered_by=seed["user"].id,
        status=TaskStatusType.completed,
        backup_snapshot=None,
        mcp_config_id=seed["mcp_config"].id,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()

    resp = await client.post(f"/v1/tasks/{str(task.id)}/revert")
    assert resp.status_code == 422


# ─────────────────────────────────────────
# Case 10: Revert — 두 번 revert 시 400
# ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_revert_twice_returns_400(client, seed, db):
    """
    첫 번째 revert 성공 → status=reverted
    두 번째 POST /revert → 400 ("Only completed tasks can be reverted")
    """
    room_id = str(seed["room"].id)
    mcp_config = seed["mcp_config"]

    task = Task(
        id=uuid.uuid4(),
        room_id=seed["room"].id,
        worker_id=seed["worker"].id,
        triggered_by=seed["user"].id,
        status=TaskStatusType.completed,
        backup_snapshot={"b.py": "원본\n"},
        mcp_config_id=mcp_config.id,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(task)
    db.commit()

    with patch("app.agents.mcp_client.MCPClient.call_tool", new=AsyncMock(return_value="ok")):
        resp1 = await client.post(f"/v1/tasks/{str(task.id)}/revert")
    assert resp1.status_code == 200

    # 두 번째 revert 시도
    resp2 = await client.post(f"/v1/tasks/{str(task.id)}/revert")
    assert resp2.status_code == 400
