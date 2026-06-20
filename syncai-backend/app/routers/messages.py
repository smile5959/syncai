import re
import uuid
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.database import get_db, SessionLocal
from app.core.deps import get_current_user, require_room_access
from app.models.user import User
from app.models.message import Message
from app.models.task import Task
from app.models.worker import Worker, WorkerStatus
from app.models.chat_room import ChatRoom
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.schemas.message import MessageCreate, MessageOut, MessagesResponse, AiCommandRequest, AiCommandResponse, AiConfirmRequest
from app.routers.ws import broadcast, chat_connections, task_connections
from app.config import settings

router = APIRouter(tags=["Messages"])


def _format_error_for_chat(error: str) -> str:
    """에러 메시지를 사용자 친화적인 한국어로 변환"""
    e = error.lower()
    if "quota" in e or "rate limit" in e or "429" in e:
        return "API 요청 한도를 초과했어요. 잠시 후 다시 시도해 주세요."
    if "mcp" in e and ("오프라인" in error or "offline" in e or "not connected" in e):
        return "PC(MCP)가 오프라인 상태예요. PC가 켜져 있는지 확인해 주세요."
    if "401" in e or "unauthorized" in e or "api key" in e:
        return "AI API 인증에 실패했어요. 관리자에게 문의해 주세요."
    if "404" in e and "model" in e:
        return "AI 모델을 찾을 수 없어요. 설정을 확인해 주세요."
    if "timeout" in e:
        return "응답 시간이 초과됐어요. 다시 시도해 주세요."
    if "최대 반복" in error:
        return "작업이 너무 복잡해서 완료하지 못했어요. 더 구체적으로 요청해 주세요."
    # 기술적 에러는 간단히 요약
    return "작업 중 오류가 발생했어요. 다시 시도해 주세요."


# ── Chat-only 시스템 프롬프트 (MCP 없을 때) ───────────────────────────────────
CHAT_ONLY_SYSTEM_PROMPT = (
    "당신은 SyncAI입니다. 개발 팀의 AI 어시스턴트입니다.\n\n"
    "## 현재 상태: MCP 미연결\n"
    "현재 MCP(로컬 PC 연결)가 없습니다. 파일 접근 툴이 전혀 없습니다.\n"
    "이전 대화에 파일 목록이나 파일 내용이 있더라도, 그것은 과거 MCP 연결 시의 결과입니다.\n"
    "지금은 파일에 접근할 수 없으므로, 절대로 파일 목록을 출력하거나 "
    "'접근했습니다' 같은 표현을 사용하지 마세요.\n\n"
    "## 파일 접근 요청 시\n"
    "파일 읽기·수정·목록 조회 등 로컬 작업 요청이 오면 반드시 이렇게 답하세요:\n"
    "\"현재 MCP가 연결되어 있지 않아 파일에 접근할 수 없어요. "
    "설정 > 내 MCP에서 MCP를 등록하고 설치 명령어를 실행해주세요.\"\n\n"
    "## 절대 금지\n"
    "- 응답에 '/ai @...' 명령어 포함 금지\n"
    "- @멘션 형식 포함 금지\n"
    "- 명령어나 지시문을 만들어서 응답에 넣지 마세요\n\n"
    "## 가능한 작업\n"
    "대화·질문·코드 작성·코드 리뷰·설명 등은 모두 가능합니다.\n"
    "항상 한국어로 답하세요. 인사말·자기소개 없이 바로 답변하세요."
)

# ── Chat-only 시스템 프롬프트 (MCP 연결됐지만 파일 작업 불필요한 경우) ──────────
def _make_chat_with_mcp_prompt(mcp_names: list[str]) -> str:
    names_str = ", ".join(f"@{n}" for n in mcp_names) if mcp_names else ""
    return (
        "당신은 SyncAI입니다. 개발 팀의 AI 어시스턴트입니다.\n\n"
        f"현재 연결된 MCP(로컬 PC): {names_str or '있음'}.\n\n"
        "## 이 응답에서 할 일\n"
        "지금 이 질문에 바로 답변하세요.\n\n"
        "## 절대 금지\n"
        "- 응답에 '/ai @...' 명령어 포함 금지\n"
        "- @멘션 형식 포함 금지\n"
        "- 명령어나 지시문을 만들어서 응답에 넣지 마세요\n\n"
        "## 가능한 작업\n"
        "대화·질문·코드 작성·코드 리뷰·설명·웹 정보(학습 데이터 기반) 등 모두 가능합니다.\n"
        "항상 한국어로 답하세요. 인사말·자기소개 없이 바로 답변하세요."
    )

# ── 팀별 대기 큐 (asyncio.Queue) ──────────────────────────────────────────────
# 큐 항목: (task_id, content, mcp_config_id, room_id, team_id)
_team_queues: dict[str, asyncio.Queue] = {}

# ── 실행 중인 asyncio Task 참조 (취소용) ────────────────────────────────────
_active_tasks: dict[str, "asyncio.Task[None]"] = {}


def _get_queue(team_id: str) -> asyncio.Queue:
    if team_id not in _team_queues:
        _team_queues[team_id] = asyncio.Queue()
    return _team_queues[team_id]


# ── @멘션 파싱 ────────────────────────────────────────────────────────────────

def _parse_mention(content: str) -> str | None:
    """'/ai @내PC 버그 고쳐줘' → '내PC'"""
    match = re.search(r'@(\S+)', content)
    return match.group(1) if match else None


# ── Worker 슬롯 점유 (SELECT FOR UPDATE) ──────────────────────────────────────

def _acquire_worker(db: Session, team_id: str) -> Worker | None:
    team_uuid = uuid.UUID(team_id)
    worker = (
        db.query(Worker)
        .filter(Worker.team_id == team_uuid, Worker.status == WorkerStatus.idle)
        .with_for_update(skip_locked=True)
        .first()
    )
    if worker:
        worker.status = WorkerStatus.busy
        db.commit()
    return worker


# ── Worker 슬롯 해제 + 큐 처리 ───────────────────────────────────────────────

async def _release_worker(worker_id: str, team_id: str):
    db = SessionLocal()
    try:
        worker = db.query(Worker).filter(Worker.id == uuid.UUID(worker_id)).first()
        if worker:
            worker.status = WorkerStatus.idle
            worker.current_task_id = None
            db.commit()
    finally:
        db.close()

    # 큐에 대기 중인 작업이 있으면 자동 실행
    q = _get_queue(team_id)
    if not q.empty():
        item = await q.get()
        task_id, content, mcp_config_id, room_id, queued_user_name = item
        asyncio.create_task(_run_ai_task(task_id, content, mcp_config_id, room_id, team_id, queued_user_name))


# ── MCP Config 선택 ───────────────────────────────────────────────────────────

def _select_mcp_config(
    db: Session,
    team_id: str,
    mention_name: str | None,
    current_user: User,
) -> McpConfig | None:
    """
    @멘션 있으면 이름으로 직접 조회, 없으면 팀 내 public MCP 중 첫 번째.
    접근 조건: 소유자이거나 해당 팀에 is_public=True.
    endpoint가 있는 config(연결된 MCP)를 우선 반환한다.

    Fallback: 팀 연결이 없어도 소유자 본인 MCP 중 endpoint가 설정된 것 반환.
    (auto-register가 McpConfigTeam 없이 생성한 config 대응)
    """
    team_uuid = uuid.UUID(team_id)
    base_q = (
        db.query(McpConfig)
        .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
        .filter(
            McpConfigTeam.team_id == team_uuid,
            or_(
                McpConfig.owner_user_id == current_user.id,
                McpConfigTeam.is_public.is_(True),
            ),
        )
    )
    if mention_name:
        # 1) 팀 연결 + 이름 일치 + 온라인 우선
        result = (
            base_q
            .filter(McpConfig.name == mention_name, McpConfig.is_online.is_(True))
            .first()
        )
        if result:
            return result
        # 2) 팀 연결 + 이름 일치 (온/오프라인 무관)
        result = base_q.filter(McpConfig.name == mention_name).first()
        if result:
            return result
        # 3) Fallback: 팀 연결 없어도 소유자 config 중 이름 일치
        return (
            db.query(McpConfig)
            .filter(McpConfig.owner_user_id == current_user.id, McpConfig.name == mention_name)
            .first()
        )

    # @멘션 없음 — 본인 MCP 최우선
    # 1) 소유자 본인 + 팀 연결 + 온라인
    result = (
        base_q
        .filter(McpConfig.owner_user_id == current_user.id, McpConfig.is_online.is_(True))
        .first()
    )
    if result:
        return result
    # 2) 팀 public + 온라인 (타 팀원 MCP)
    result = (
        base_q
        .filter(McpConfigTeam.is_public.is_(True), McpConfig.is_online.is_(True))
        .first()
    )
    if result:
        return result
    # 3) Fallback: 팀 연결 없어도 소유자 config 중 온라인인 것
    return (
        db.query(McpConfig)
        .filter(McpConfig.owner_user_id == current_user.id, McpConfig.is_online.is_(True))
        .order_by(McpConfig.created_at.desc())
        .first()
    )


def _get_public_mcp_list(db: Session, team_id: str) -> list[dict]:
    """Supervisor 프롬프트에 주입할 팀 내 public MCP 목록."""
    rows = (
        db.query(McpConfig)
        .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
        .filter(
            McpConfigTeam.team_id == uuid.UUID(team_id),
            McpConfigTeam.is_public.is_(True),
        )
        .all()
    )
    return [{"name": c.name, "base_dir": c.base_dir or ""} for c in rows]


# ── 핵심: AI 태스크 실행 ──────────────────────────────────────────────────────

async def _run_ai_task(
    task_id: str,
    content: str,
    mcp_config_id: str,
    room_id: str,
    team_id: str,
    user_name: str = "",
):
    from app.models.task import Task
    from app.models.message import Message
    from app.models.worker import Worker, WorkerStatus
    from app.models.mcp_config import McpConfig
    from app.agents.mcp_client import MCPClient
    from app.agents.worker import WorkerAgent
    from app.services.room_service import get_recent_messages

    db = SessionLocal()
    task = None
    worker_id: str | None = None

    # 현재 asyncio Task 등록 (취소 버튼 지원)
    _cur = asyncio.current_task()
    if _cur:
        _active_tasks[task_id] = _cur

    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
        mcp_config = db.query(McpConfig).filter(McpConfig.id == uuid.UUID(mcp_config_id)).first()
        if not task or not mcp_config:
            return

        # idle Worker 슬롯 점유
        worker = _acquire_worker(db, team_id)
        if not worker:
            # 슬롯 없음 → 큐에 재삽입 (이 경로는 정상적으로는 발생 안 함)
            q = _get_queue(team_id)
            await q.put((task_id, content, mcp_config_id, room_id, user_name))
            return

        worker_id = str(worker.id)
        worker.current_task_id = task.id
        task.worker_id = worker.id
        task.status = "running"
        db.commit()

        await broadcast(task_connections, room_id, {
            "type": "task_started",
            "data": {"task_id": task_id, "worker_id": worker_id},
        })

        # public MCP 목록 수집 (Supervisor 프롬프트용)
        public_mcps = _get_public_mcp_list(db, team_id)

        from app.core import mcp_broker
        is_connected = mcp_broker.is_online(mcp_config.mcp_token or "")
        if not is_connected:
            if task:
                task.status = "failed"
                task.error = f"MCP 오프라인: {mcp_config.name}"
                db.commit()
            error_msg = f"**{mcp_config.name}** PC가 오프라인 상태예요. PC가 켜져 있는지 확인해 주세요."
            await broadcast(chat_connections, room_id, {
                "type": "message",
                "data": {
                    "id": f"err-{task_id}",
                    "room_id": room_id,
                    "user_id": None,
                    "content": f"⚠️ {error_msg}",
                    "type": "ai_res",
                    "created_at": datetime.utcnow().isoformat() + "Z",
                },
            })
            await broadcast(task_connections, room_id, {
                "type": "task_failed",
                "data": {
                    "task_id": task_id,
                    "error": f"'{mcp_config.name}' MCP 서버가 연결되지 않았습니다. PC가 켜져 있는지 확인해 주세요.",
                },
            })
            return

        mcp_client = MCPClient(mcp_config.endpoint, token=mcp_config.mcp_token or "")
        worker_agent = WorkerAgent(mcp_client, db, task_id, worker_id)

        recent = get_recent_messages(
            db, room_id, limit=20,
            exclude_id=str(task.message_id) if task.message_id else None,
        )
        recent.reverse()

        # 발신자 이름 맵 구성 (N+1 방지: 일괄 조회)
        user_ids = [m.user_id for m in recent if m.user_id is not None]
        user_name_map: dict[str, str] = {}
        if user_ids:
            from app.models.user import User as _User
            users_in_ctx = db.query(_User).filter(_User.id.in_(user_ids)).all()
            user_name_map = {str(u.id): u.name for u in users_in_ctx}

        def _clean_msg_content(content: str, msg_type: str) -> str:
            if msg_type == "ai_cmd":
                return re.sub(r'^/ai\s+@\S+\s*', '', content, flags=re.IGNORECASE).strip()
            return content

        def _clean_ai_res(content: str) -> str:
            content = re.sub(r'`/ai\s+@[^`]+`', '', content, flags=re.DOTALL)
            content = re.sub(r'^/ai\s+@\S+[^\n]*$', '', content, flags=re.MULTILINE)
            return content.strip()

        context = [
            {
                "role": "assistant" if m.type == "ai_res" else "user",
                "content": (
                    f"[{user_name_map.get(str(m.user_id), '팀원')}] {_clean_msg_content(m.content, m.type)}"
                    if m.type != "ai_res" and m.user_id
                    else _clean_ai_res(m.content)
                ),
            }
            for m in recent
        ]

        step_counter = [0]

        async def on_progress(message: str):
            step_counter[0] += 1
            await broadcast(task_connections, room_id, {
                "type": "task_progress",
                "data": {
                    "task_id": task_id,
                    "progress": min(step_counter[0] * 10, 90),
                    "message": message,
                },
            })

        async def on_tool_call(tool_name: str, desc: str):
            await broadcast(task_connections, room_id, {
                "type": "task_progress",
                "data": {
                    "task_id": task_id,
                    "progress": min(step_counter[0] * 10, 90),
                    "message": desc,
                    "step": desc,
                },
            })

        async def on_chunk(text: str):
            await broadcast(chat_connections, room_id, {
                "type": "message_chunk",
                "data": {"task_id": task_id, "text": text},
            })

        from app.agents.supervisor import SupervisorAgent, DEFAULT_MODEL, _get_client
        from app.agents.worker_llm import WorkerLLM

        supervisor = SupervisorAgent(
            mcp_base_dir=mcp_config.base_dir or "",
            available_mcps=public_mcps,
            selected_mcp_name=mcp_config.name,
        )

        await broadcast(task_connections, room_id, {
            "type": "task_progress",
            "data": {
                "task_id": task_id,
                "progress": 5,
                "message": "요청 분석 중...",
                "step": "요청 분석 중...",
            },
        })
        clean_content = re.sub(r'^/ai\s+@\S+\s*', '', content, flags=re.IGNORECASE).strip()
        task_plan = await supervisor.analyze(clean_content, context, user_name=user_name)

        worker_llm = WorkerLLM(
            worker_agent=worker_agent,
            mcp_base_dir=mcp_config.base_dir or "",
            available_mcps=public_mcps,
            selected_mcp_name=mcp_config.name,
        )
        base_url, api_key = await _get_client()
        worker_model = worker.model or DEFAULT_MODEL

        result_text = await worker_llm.run(
            task_plan, context, on_progress,
            model=worker_model,
            base_url=base_url,
            api_key=api_key,
            user_name=user_name,
            on_chunk=on_chunk,
            on_tool_call=on_tool_call,
        )

        # Supervisor 검증 + 재시도 루프 (최대 2회)
        # 멀티 워커 확장 시: supervisor.validate()에 여러 Worker 결과 리스트 전달
        MAX_RETRIES = 2
        for retry_num in range(MAX_RETRIES):
            validation = await supervisor.validate(
                task_plan=task_plan,
                worker_result=result_text,
                file_changes=worker_agent.file_changes,
            )
            if validation["success"] or not validation["retry_plan"]:
                break

            print(f"[_run_ai_task] 재시도 {retry_num + 1}/{MAX_RETRIES}: {validation['retry_plan']}")
            await broadcast(task_connections, room_id, {
                "type": "task_progress",
                "data": {
                    "task_id": task_id,
                    "progress": 50 + retry_num * 20,
                    "message": f"작업 보완 중... ({retry_num + 1}/{MAX_RETRIES})",
                },
            })
            result_text = await worker_llm.run(
                validation["retry_plan"], context, on_progress,
                model=worker_model,
                base_url=base_url,
                api_key=api_key,
                user_name=user_name,
                on_chunk=on_chunk,
                on_tool_call=on_tool_call,
            )

        diff = worker_agent.generate_diff()

        # /ai @... 패턴이 결과에 포함되지 않도록 정제 (모델이 명령어를 흉내낼 때 방어)
        result_text = re.sub(r'`/ai\s+@[^`]+`', '', result_text, flags=re.DOTALL)
        result_text = re.sub(r'^/ai\s+@\S+[^\n]*$', '', result_text, flags=re.MULTILINE)
        result_text = result_text.strip()
        if not result_text:
            result_text = "완료했습니다." if worker_agent.file_changes else "작업이 수행되지 않았습니다. 다시 시도해 주세요."

        # 모든 재시도 후에도 에러 응답이면 failed 처리
        is_error_result = result_text.startswith("[MCP 오류]") or result_text.startswith("⚠️")

        now = datetime.now(timezone.utc)
        if is_error_result:
            task.status = "failed"
            task.error = result_text
        else:
            task.status = "completed"
        task.result_diff = diff if diff else None
        # revert용: 파일 원본 스냅샷 + 실행에 사용한 MCP Config 저장
        snapshot = worker_agent.build_backup_snapshot()
        task.backup_snapshot = snapshot if snapshot else None
        task.mcp_config_id = uuid.UUID(mcp_config_id)
        task.completed_at = now
        db.commit()

        ai_msg = Message(
            room_id=uuid.UUID(room_id),
            user_id=None,
            content=result_text,
            type="ai_res",
        )
        db.add(ai_msg)
        db.commit()
        db.refresh(ai_msg)

        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": str(ai_msg.id),
                "room_id": room_id,
                "user_id": None,
                "content": result_text,
                "type": "ai_res",
                "created_at": ai_msg.created_at.isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_completed",
            "data": {
                "task_id": task_id,
                "result_diff": diff if diff else None,
                "completed_at": now.isoformat(),
            },
        })

    except asyncio.CancelledError:
        print(f"[_run_ai_task] 사용자 취소: {task_id}")
        if task:
            task.status = "cancelled"
            db.commit()
        await broadcast(task_connections, room_id, {
            "type": "task_cancelled",
            "data": {"task_id": task_id},
        })
        # streaming 청크 제거용 빈 message 이벤트는 보내지 않음
        raise  # CancelledError는 반드시 re-raise
    except Exception as e:
        print(f"[_run_ai_task] 오류: {e}")
        if task:
            # 예상치 못한 예외(네트워크 오류, 타임아웃 등) → interrupted로 마킹 (재개 가능)
            task.status = "interrupted"
            task.error = str(e)
            task.interrupted_context = {
                "original_instruction": content,
                "progress_summary": f"작업 실행 중 오류로 중단: {str(e)[:200]}",
                "mcp_config_id": mcp_config_id,
            }
            db.commit()
        error_msg = _format_error_for_chat(str(e))
        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": f"err-{task_id}",
                "room_id": room_id,
                "user_id": None,
                "content": f"⚠️ {error_msg}",
                "type": "ai_res",
                "created_at": datetime.utcnow().isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_interrupted",
            "data": {"task_id": task_id, "error": str(e)},
        })
    finally:
        _active_tasks.pop(task_id, None)
        db.close()
        if worker_id:
            await _release_worker(worker_id, team_id)


# ── Chat-only AI (MCP 없는 순수 대화 모드) ────────────────────────────────────

async def _run_chat_only(task_id: str, content: str, room_id: str, user_name: str = "", team_id: str = "", available_mcp_names: list[str] | None = None):
    from app.agents.supervisor import _get_client, DEFAULT_MODEL
    from app.services.room_service import get_recent_messages
    from openai import AsyncOpenAI

    db = SessionLocal()
    task = None

    # 현재 asyncio Task 등록 (취소 버튼 지원)
    _cur = asyncio.current_task()
    if _cur:
        _active_tasks[task_id] = _cur

    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
        if not task:
            return

        task.status = "running"
        db.commit()

        # chat-only도 task_started 전송 → 프론트에서 streaming 메시지 즉시 생성
        await broadcast(task_connections, room_id, {
            "type": "task_started",
            "data": {"task_id": task_id, "worker_id": None},
        })

        # worker 모델 결정: team_id가 있으면 첫 번째 worker 모델 사용
        chat_model = DEFAULT_MODEL
        if team_id:
            any_worker = (
                db.query(Worker)
                .filter(Worker.team_id == uuid.UUID(team_id))
                .first()
            )
            if any_worker and any_worker.model:
                chat_model = any_worker.model

        base_url, api_key = await _get_client()
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        recent = get_recent_messages(
            db, room_id, limit=20,
            exclude_id=str(task.message_id) if task.message_id else None,
        )
        recent.reverse()

        # 발신자 이름 맵 구성 (N+1 방지: 일괄 조회)
        user_ids = [m.user_id for m in recent if m.user_id is not None]
        user_name_map: dict[str, str] = {}
        if user_ids:
            from app.models.user import User as _User
            users_in_ctx = db.query(_User).filter(_User.id.in_(user_ids)).all()
            user_name_map = {str(u.id): u.name for u in users_in_ctx}

        if available_mcp_names:
            system_content = _make_chat_with_mcp_prompt(available_mcp_names)
        else:
            system_content = CHAT_ONLY_SYSTEM_PROMPT
        if user_name:
            system_content += (
                f"\n\n지금 이 메시지를 보낸 사용자의 이름은 '{user_name}'입니다. "
                f"사용자가 자신의 이름을 물어보면 '{user_name}'이라고 알려주세요."
            )

        def _clean_ctx(c: str, t: str) -> str:
            if t == "ai_cmd":
                # /ai @멘션 ... 또는 /ai ... 모두 prefix 제거
                return re.sub(r'^/ai\s+(?:@\S+\s*)?', '', c, flags=re.IGNORECASE).strip()
            if t == "ai_res":
                c = re.sub(r'`/ai\s+@[^`]+`', '', c, flags=re.DOTALL)
                c = re.sub(r'^/ai\s+@\S+[^\n]*$', '', c, flags=re.MULTILINE)
                return c.strip()
            return c

        messages = [{"role": "system", "content": system_content}]
        for m in recent:
            messages.append({
                "role": "assistant" if m.type == "ai_res" else "user",
                "content": (
                    f"[{user_name_map.get(str(m.user_id), '팀원')}] {_clean_ctx(m.content, m.type)}"
                    if m.type != "ai_res" and m.user_id
                    else m.content
                ),
            })
        clean_user_content = re.sub(r'^/ai\s+(?:@\S+\s*)?', '', content, flags=re.IGNORECASE).strip()
        messages.append({"role": "user", "content": clean_user_content})

        result_text = ""
        stream = await client.chat.completions.create(
            model=chat_model,
            max_tokens=2048,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                result_text += delta
                await broadcast(chat_connections, room_id, {
                    "type": "message_chunk",
                    "data": {"task_id": task_id, "text": delta},
                })
        if not result_text:
            result_text = "응답을 생성하지 못했습니다. 다시 시도해 주세요."

        # /ai @... 패턴 정제
        result_text = re.sub(r'`/ai\s+@[^`]+`', '', result_text, flags=re.DOTALL)
        result_text = re.sub(r'^/ai\s+@\S+[^\n]*$', '', result_text, flags=re.MULTILINE)
        result_text = result_text.strip() or "완료했습니다."

        now = datetime.now(timezone.utc)
        task.status = "completed"
        task.completed_at = now
        db.commit()

        ai_msg = Message(
            room_id=uuid.UUID(room_id),
            user_id=None,
            content=result_text,
            type="ai_res",
        )
        db.add(ai_msg)
        db.commit()
        db.refresh(ai_msg)

        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": str(ai_msg.id),
                "room_id": room_id,
                "user_id": None,
                "content": result_text,
                "type": "ai_res",
                "created_at": ai_msg.created_at.isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_completed",
            "data": {
                "task_id": task_id,
                "result_diff": None,
                "completed_at": now.isoformat(),
            },
        })

    except asyncio.CancelledError:
        print(f"[_run_chat_only] 사용자 취소: {task_id}")
        if task:
            task.status = "cancelled"
            db.commit()
        await broadcast(task_connections, room_id, {
            "type": "task_cancelled",
            "data": {"task_id": task_id},
        })
        raise
    except Exception as e:
        print(f"[_run_chat_only] 오류: {e}")
        if task:
            task.status = "interrupted"
            task.error = str(e)
            task.interrupted_context = {
                "original_instruction": content,
                "progress_summary": f"채팅 응답 중 오류로 중단: {str(e)[:200]}",
                "mcp_config_id": None,
            }
            db.commit()
        error_msg = _format_error_for_chat(str(e))
        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": f"err-{task_id}",
                "room_id": room_id,
                "user_id": None,
                "content": f"⚠️ {error_msg}",
                "type": "ai_res",
                "created_at": datetime.utcnow().isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_interrupted",
            "data": {"task_id": task_id, "error": str(e)},
        })
    finally:
        _active_tasks.pop(task_id, None)
        db.close()


# ── AI 작업 계획 분석 (동의 요청 전 단계) ────────────────────────────────────

PLAN_SYSTEM_PROMPT = (
    "당신은 팀 협업 AI 어시스턴트입니다. 사용자 요청을 분석하여 어떤 도구가 필요한지 판단하세요.\n\n"
    "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n"
    "{\"needs_mcp\": true/false, \"needs_composio\": true/false, \"composio_app\": \"앱이름 또는 null\", "
    "\"mcp_name\": \"PC이름 또는 null\", \"task_title\": \"동사+목적어 형식 짧은 제목\", "
    "\"confirmation_message\": \"접근 대상 한 줄 설명\", \"task_plan\": \"구체적인 작업 지시 1-3문장\"}\n\n"
    "## needs_mcp = true (로컬 PC 파일 직접 수정/생성/삭제가 필요한 경우)\n"
    "- 파일/폴더 생성, 수정, 삭제, 이동\n"
    "- 코드 버그 수정, 기능 추가, 리팩토링\n"
    "예: '로그인 버그 고쳐줘', 'README 수정해줘', '새 컴포넌트 만들어줘'\n\n"
    "## needs_composio = true (외부 서비스 API 호출이 필요한 경우)\n"
    "- Notion 페이지 생성/수정/검색\n"
    "- Figma 파일 접근\n"
    "- GitHub 이슈/PR 작성\n"
    "- Slack 메시지 전송 등\n"
    "예: 'Notion에 회의록 정리해줘', 'GitHub 이슈 만들어줘', 'Figma 디자인 확인해줘'\n\n"
    "## 둘 다 false (대화/질문인 경우)\n"
    "- 질문, 설명 요청, 조언, 인사, 코드 리뷰(수정 없이)\n\n"
    "주의:\n"
    "- needs_mcp와 needs_composio를 동시에 true로 하지 마세요. 하나만 선택하세요.\n"
    "- composio_app: needs_composio=true일 때 앱 이름 소문자 (연결된 앱 목록에서 선택), 아니면 null\n"
    "- mcp_name: needs_mcp=true일 때만 PC 이름 (목록에서 선택), 아니면 null\n"
    "- task_title: 15자 이내 요약. 예: 'Notion 회의록 작성', 'README.md 수정'\n"
    "- confirmation_message: 접근 대상 명사형 한 문장. 예: 'Notion에 회의록 페이지를 생성하겠습니다.'\n"
    "- task_plan: 실제 수행할 구체적 지시 1-3문장"
)


async def _plan_ai_task(
    content: str,
    context: list[dict],
    available_mcps: list[dict],
    mention_name: str | None,
    model: str = "",
    connected_composio_apps: list[str] | None = None,
) -> dict:
    """
    사용자 요청 + 채팅 맥락 분석 → 작업 계획 반환
    반환: {needs_mcp, needs_composio, composio_app, mcp_name, task_title, confirmation_message, task_plan}
    """
    import json as _json
    from app.agents.supervisor import _get_client, DEFAULT_MODEL
    from openai import AsyncOpenAI

    base_url, api_key = await _get_client()
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    plan_model = model or DEFAULT_MODEL

    mcp_list_str = (
        ", ".join(f"'{m['name']}'" for m in available_mcps)
        if available_mcps else "없음"
    )
    composio_list_str = (
        ", ".join(connected_composio_apps)
        if connected_composio_apps else "없음"
    )

    system = PLAN_SYSTEM_PROMPT
    system += f"\n\n사용 가능한 PC 목록: {mcp_list_str}"
    system += f"\n연결된 외부 앱 목록 (Composio): {composio_list_str}"
    if mention_name:
        system += f"\n사용자가 '@{mention_name}'을 명시적으로 지정했습니다."

    messages = [{"role": "system", "content": system}]
    messages.extend(context[-10:])
    messages.append({"role": "user", "content": content})

    try:
        response = await client.chat.completions.create(
            model=plan_model,
            max_tokens=400,
            messages=messages,
        )
        raw = response.choices[0].message.content or "{}"
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        plan = _json.loads(raw)
        return {
            "needs_mcp": bool(plan.get("needs_mcp", False)),
            "needs_composio": bool(plan.get("needs_composio", False)),
            "composio_app": plan.get("composio_app"),
            "mcp_name": plan.get("mcp_name"),
            "task_title": plan.get("task_title", "").strip(),
            "confirmation_message": plan.get("confirmation_message", "이 작업을 진행할까요?"),
            "task_plan": plan.get("task_plan", ""),
        }
    except Exception as e:
        print(f"[_plan_ai_task] 계획 분석 실패: {e}")
        return {
            "needs_mcp": mention_name is not None,
            "needs_composio": False,
            "composio_app": None,
            "mcp_name": mention_name,
            "task_title": "",
            "confirmation_message": "이 작업을 진행할까요?",
            "task_plan": "",
        }


# ─────────────────────────────────────────────────────────────────────────────
# REST 엔드포인트
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/rooms/{room_id}/messages", response_model=MessagesResponse)
def list_messages(
    room_id: str,
    cursor: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = require_room_access(room_id, current_user, db)
    query = (
        db.query(Message)
        .options(joinedload(Message.user))
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.desc())
    )
    if cursor:
        pivot = db.query(Message).filter(Message.id == cursor).first()
        if pivot:
            query = query.filter(Message.created_at < pivot.created_at)
    messages = query.limit(limit + 1).all()
    next_cursor = str(messages[-1].id) if len(messages) > limit else None
    return {"messages": messages[:limit], "next_cursor": next_cursor}


@router.post("/rooms/{room_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    room_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = require_room_access(room_id, current_user, db)
    actual_room_id = str(room.id)
    msg = Message(room_id=room.id, user_id=current_user.id, content=body.content, type="chat")
    db.add(msg)
    db.commit()
    db.refresh(msg)

    await broadcast(chat_connections, actual_room_id, {
        "type": "message",
        "data": {
            "id": str(msg.id),
            "room_id": str(msg.room_id),
            "user_id": str(msg.user_id),
            "content": msg.content,
            "type": msg.type,
            "created_at": msg.created_at.isoformat() + "Z",
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "email": current_user.email,
            },
        },
    })
    return msg



@router.post("/rooms/{room_id}/ai", response_model=AiCommandResponse, status_code=202)
async def ai_command(
    room_id: str,
    body: AiCommandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = require_room_access(room_id, current_user, db)
    room_uuid = room.id  # slug가 올 수 있으므로 항상 room.id(UUID) 사용

    team_id = str(room.team_id)

    # 1. @멘션 파싱
    mention_name = _parse_mention(body.content)

    # @멘션으로 특정 PC를 지정했는데 해당 MCP가 없는 경우만 에러
    if mention_name:
        mcp_check = _select_mcp_config(db, team_id, mention_name, current_user)
        if not mcp_check:
            # 팀 내 해당 이름 MCP가 존재하지만 비공개인지 구분
            team_uuid_early = uuid.UUID(team_id)
            any_named_early = (
                db.query(McpConfig)
                .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
                .filter(McpConfigTeam.team_id == team_uuid_early, McpConfig.name == mention_name)
                .first()
            )
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{mention_name}' MCP가 공개 설정이 되어 있지 않아요."
                    if any_named_early else
                    f"'{mention_name}' MCP를 찾을 수 없어요."
                ),
            )

    # 2. 사용자 메시지 저장 + Task 생성 (awaiting_confirm 상태)
    msg = Message(room_id=room_uuid, user_id=current_user.id, content=body.content, type="ai_cmd")
    db.add(msg)
    db.flush()

    task = Task(
        room_id=room_uuid,
        worker_id=None,
        message_id=msg.id,
        triggered_by=current_user.id,
        status="awaiting_confirm",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    room_id_str = str(room_uuid)  # broadcast 및 하위 함수에 UUID 문자열 전달
    await broadcast(chat_connections, room_id_str, {
        "type": "message",
        "data": {
            "id": str(msg.id),
            "room_id": str(msg.room_id),
            "user_id": str(msg.user_id),
            "content": msg.content,
            "type": msg.type,
            "created_at": msg.created_at.isoformat() + "Z",
            "user": {
                "id": str(current_user.id),
                "name": current_user.name,
                "email": current_user.email,
            },
        },
    })

    # 3. 백그라운드에서 AI 계획 분석 → ai_plan 메시지 전송
    asyncio.create_task(
        _send_ai_plan(str(task.id), body.content, room_id_str, team_id, mention_name, current_user)
    )

    return JSONResponse({"task_id": str(task.id)})


async def _send_ai_plan(
    task_id: str,
    content: str,
    room_id: str,
    team_id: str,
    mention_name: str | None,
    current_user,
):
    """AI 계획 분석 후 ai_plan 메시지를 채팅에 전송."""
    import json as _json
    from app.services.room_service import get_recent_messages

    db = SessionLocal()
    task = None
    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
        if not task:
            return

        # 채팅 맥락 수집
        recent = get_recent_messages(
            db, room_id, limit=20,
            exclude_id=str(task.message_id) if task.message_id else None,
        )
        recent.reverse()

        user_ids = [m.user_id for m in recent if m.user_id is not None]
        user_name_map: dict[str, str] = {}
        if user_ids:
            from app.models.user import User as _User
            users = db.query(_User).filter(_User.id.in_(user_ids)).all()
            user_name_map = {str(u.id): u.name for u in users}

        context = [
            {
                "role": "assistant" if m.type == "ai_res" else "user",
                "content": (
                    f"[{user_name_map.get(str(m.user_id), '팀원')}] {m.content}"
                    if m.type not in ("ai_res", "ai_plan") and m.user_id
                    else m.content
                ),
            }
            for m in recent
        ]

        available_mcps = _get_public_mcp_list(db, team_id)
        # 팀 공유 없어도 본인 소유 MCP 포함 (오프라인도 포함 — 실행 시점에 온라인 여부 재확인)
        if current_user:
            existing_names = {m["name"] for m in available_mcps}
            owner_mcps = db.query(McpConfig).filter(
                McpConfig.owner_user_id == current_user.id,
            ).all()
            for c in owner_mcps:
                if c.name not in existing_names:
                    available_mcps.append({"name": c.name, "base_dir": c.base_dir or ""})

        # worker 모델 가져오기 (planning에도 동일 모델 사용)
        from app.agents.supervisor import DEFAULT_MODEL as _DEFAULT_MODEL
        worker_model = _DEFAULT_MODEL
        any_worker = (
            db.query(Worker)
            .filter(Worker.team_id == uuid.UUID(team_id))
            .first()
        )
        if any_worker and any_worker.model:
            worker_model = any_worker.model

        # ── interrupted 작업 연관성 체크 ──────────────────────────────────────
        # 같은 room의 최근 interrupted 작업(최대 5개)과 새 지시 비교
        # (마이그레이션 미적용 환경 방어: 컬럼 없으면 스킵)
        try:
            interrupted_tasks_db = (
                db.query(Task)
                .filter(
                    Task.room_id == uuid.UUID(room_id),
                    Task.status == "interrupted",
                    Task.interrupted_context.isnot(None),
                )
                .order_by(Task.created_at.desc())
                .limit(5)
                .all()
            )
        except Exception:
            db.rollback()
            interrupted_tasks_db = []

        merged_instruction = None
        related_task_id = None
        if interrupted_tasks_db:
            from app.agents.supervisor import SupervisorAgent
            supervisor_check = SupervisorAgent()
            interrupted_list = [
                {
                    "index": i,
                    "original_instruction": t.interrupted_context.get("original_instruction", ""),
                    "progress_summary": t.interrupted_context.get("progress_summary", ""),
                }
                for i, t in enumerate(interrupted_tasks_db)
            ]
            check_result = await supervisor_check.check_interrupted(content, interrupted_list)
            idx = check_result["related_index"]
            if idx >= 0 and check_result["merged_instruction"]:
                merged_instruction = check_result["merged_instruction"]
                related_task_id = str(interrupted_tasks_db[idx].id)
                # 연관 중단 작업을 cancelled로 마킹 (통합 재개 처리)
                interrupted_tasks_db[idx].status = "cancelled"
                db.commit()

        # 통합 지시문이 있으면 content 교체
        effective_content = merged_instruction if merged_instruction else content

        # 사용자의 Composio 연결 앱 목록 조회
        from app.services.composio_service import get_connected_app_names as _get_composio_apps
        entity_id = str(current_user.id)
        connected_composio_apps = await _get_composio_apps(entity_id) if settings.COMPOSIO_API_KEY else []

        # MCP도 없고 Composio도 없고 멘션도 없으면 planning 스킵 → 바로 chat-only
        if not available_mcps and not mention_name and not connected_composio_apps:
            task.status = "pending"
            db.commit()
            asyncio.create_task(
                _run_chat_only(task_id, effective_content, room_id, current_user.name, team_id)
            )
            return

        # AI 플래닝
        plan = await _plan_ai_task(
            effective_content, context, available_mcps, mention_name,
            model=worker_model,
            connected_composio_apps=connected_composio_apps,
        )

        # Composio 작업 처리
        if plan.get("needs_composio") and plan.get("composio_app"):
            composio_app = plan["composio_app"]
            if composio_app not in connected_composio_apps:
                # 연결 안 된 앱 요청 → 연결 안내
                err_content = (
                    f"⚠️ **{composio_app.capitalize()}**이 연결되어 있지 않아요. "
                    f"[연동 페이지](/integrations)에서 연결해 주세요."
                )
                task.status = "failed"
                task.error = err_content
                db.commit()
                await broadcast(chat_connections, room_id, {
                    "type": "message",
                    "data": {
                        "id": f"err-{task_id}",
                        "room_id": room_id,
                        "user_id": None,
                        "content": err_content,
                        "type": "ai_res",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    },
                })
                await broadcast(task_connections, room_id, {
                    "type": "task_failed",
                    "data": {"task_id": task_id, "error": err_content},
                })
                return

            # Composio 작업 → 동의 요청 카드 표시
            task.status = "awaiting_confirm"
            db.commit()

            plan_content = _json.dumps({
                "task_id": task_id,
                "needs_mcp": False,
                "needs_composio": True,
                "composio_app": composio_app,
                "mcp_name": None,
                "mcp_config_id": None,
                "task_title": plan.get("task_title", ""),
                "confirmation_message": plan.get("confirmation_message", f"{composio_app.capitalize()}에 접근하겠습니다."),
                "task_plan": plan.get("task_plan", ""),
                "triggered_by": str(task.triggered_by) if task.triggered_by else None,
            }, ensure_ascii=False)

            plan_msg = Message(
                room_id=uuid.UUID(room_id),
                user_id=None,
                content=plan_content,
                type="ai_plan",
            )
            db.add(plan_msg)
            db.commit()
            db.refresh(plan_msg)

            await broadcast(chat_connections, room_id, {
                "type": "message",
                "data": {
                    "id": str(plan_msg.id),
                    "room_id": room_id,
                    "user_id": None,
                    "content": plan_content,
                    "type": "ai_plan",
                    "created_at": plan_msg.created_at.isoformat() + "Z",
                },
            })
            await broadcast(task_connections, room_id, {
                "type": "task_awaiting_confirm",
                "data": {
                    "task_id": task_id,
                    "triggered_by": str(task.triggered_by) if task.triggered_by else None,
                },
            })
            return

        # 순수 대화 요청이면 동의 없이 바로 chat-only 실행
        if not plan["needs_mcp"]:
            task.status = "pending"
            db.commit()
            mcp_name_list = [m["name"] for m in available_mcps] if available_mcps else []
            asyncio.create_task(
                _run_chat_only(task_id, effective_content, room_id, current_user.name, team_id, mcp_name_list)
            )
            return

        effective_mention = plan["mcp_name"] or mention_name

        if effective_mention:
            # @멘션 있음: 해당 MCP 접근 가능 여부 확인 (소유자 or 공개)
            proposed_mcp = _select_mcp_config(db, team_id, effective_mention, current_user)
            if not proposed_mcp:
                # 팀 내 해당 이름 MCP 존재 여부로 비공개 vs 없음 구분
                team_uuid_val = uuid.UUID(team_id)
                any_named = (
                    db.query(McpConfig)
                    .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
                    .filter(McpConfigTeam.team_id == team_uuid_val, McpConfig.name == effective_mention)
                    .first()
                )
                err_content = (
                    f"⚠️ **{effective_mention}** MCP가 공개 설정이 되어 있지 않아요."
                    if any_named else
                    f"⚠️ **{effective_mention}** MCP를 찾을 수 없어요."
                )
                task.status = "failed"
                task.error = err_content
                db.commit()
                await broadcast(chat_connections, room_id, {
                    "type": "message",
                    "data": {
                        "id": f"err-{task_id}",
                        "room_id": room_id,
                        "user_id": None,
                        "content": err_content,
                        "type": "ai_res",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    },
                })
                await broadcast(task_connections, room_id, {
                    "type": "task_failed",
                    "data": {"task_id": task_id, "error": err_content},
                })
                return
        else:
            # @멘션 없음: 본인 MCP 등록 여부 확인
            user_mcp_count = db.query(McpConfig).filter(McpConfig.owner_user_id == current_user.id).count()
            if user_mcp_count == 0:
                task.status = "failed"
                task.error = "MCP 미등록"
                db.commit()
                await broadcast(chat_connections, room_id, {
                    "type": "message",
                    "data": {
                        "id": f"err-{task_id}",
                        "room_id": room_id,
                        "user_id": None,
                        "content": "⚠️ 등록된 PC(MCP)가 없어요. 설정 > 내 MCP에서 PC를 등록하고 설치 명령어를 실행해 주세요.",
                        "type": "ai_res",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    },
                })
                await broadcast(task_connections, room_id, {
                    "type": "task_failed",
                    "data": {"task_id": task_id, "error": "MCP 미등록"},
                })
                return
            proposed_mcp = _select_mcp_config(db, team_id, None, current_user)

        if proposed_mcp:
            task.mcp_config_id = proposed_mcp.id

        # MCP 오프라인 여부를 플래닝 단계에서 미리 확인 → 확인 요청 없이 즉시 에러
        if proposed_mcp:
            from app.core import mcp_broker
            if not mcp_broker.is_online(proposed_mcp.mcp_token or ""):
                task.status = "failed"
                task.error = f"MCP 오프라인: {proposed_mcp.name}"
                db.commit()
                error_msg = f"**{proposed_mcp.name}** PC가 오프라인 상태예요. PC가 켜져 있는지 확인해 주세요."
                await broadcast(chat_connections, room_id, {
                    "type": "message",
                    "data": {
                        "id": f"err-{task_id}",
                        "room_id": room_id,
                        "user_id": None,
                        "content": f"⚠️ {error_msg}",
                        "type": "ai_res",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                    },
                })
                await broadcast(task_connections, room_id, {
                    "type": "task_failed",
                    "data": {
                        "task_id": task_id,
                        "error": f"'{proposed_mcp.name}' MCP 서버가 연결되지 않았습니다.",
                    },
                })
                return

        # auto_approve: 확인 없이 바로 실행
        if proposed_mcp and proposed_mcp.auto_approve:
            task.status = "pending"
            db.commit()
            asyncio.create_task(
                _run_ai_task(task_id, effective_content, str(proposed_mcp.id), room_id, team_id, current_user.name)
            )
            return

        task.status = "awaiting_confirm"
        # 통합 지시문이 있으면 confirm 시 복원할 수 있도록 저장
        if merged_instruction:
            task.interrupted_context = {
                "merged_instruction": merged_instruction,
                "related_task_id": related_task_id,
            }
        db.commit()

        # confirmation_message에 "이전 작업 이어서" 힌트 추가
        confirmation_message = plan["confirmation_message"]
        if merged_instruction:
            confirmation_message = f"[이전 중단 작업 포함] {confirmation_message}"

        plan_content = _json.dumps({
            "task_id": task_id,
            "needs_mcp": plan["needs_mcp"],
            "mcp_name": plan["mcp_name"],
            "mcp_config_id": str(proposed_mcp.id) if proposed_mcp else None,
            "task_title": plan.get("task_title", ""),
            "confirmation_message": confirmation_message,
            "task_plan": plan.get("task_plan", ""),
            "triggered_by": str(task.triggered_by) if task.triggered_by else None,
        }, ensure_ascii=False)

        plan_msg = Message(
            room_id=uuid.UUID(room_id),
            user_id=None,
            content=plan_content,
            type="ai_plan",
        )
        db.add(plan_msg)
        db.commit()
        db.refresh(plan_msg)

        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": str(plan_msg.id),
                "room_id": room_id,
                "user_id": None,
                "content": plan_content,
                "type": "ai_plan",
                "created_at": plan_msg.created_at.isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_awaiting_confirm",
            "data": {
                "task_id": task_id,
                "triggered_by": str(task.triggered_by) if task.triggered_by else None,
            },
        })

    except Exception as e:
        print(f"[_send_ai_plan] 오류: {e}")
        if task:
            task.status = "failed"
            task.error = str(e)
            db.commit()
        error_msg = _format_error_for_chat(str(e))
        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": f"err-{task_id}",
                "room_id": room_id,
                "user_id": None,
                "content": f"⚠️ {error_msg}",
                "type": "ai_res",
                "created_at": datetime.utcnow().isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_failed",
            "data": {"task_id": task_id, "error": str(e)},
        })
    finally:
        db.close()


async def _run_composio_task(
    task_id: str,
    content: str,
    composio_app: str,
    entity_id: str,
    room_id: str,
    user_name: str = "",
):
    """Composio 외부 앱 툴을 사용해 작업 실행 (로컬 MCP 불필요)."""
    from app.services.composio_service import get_tools_for_apps, execute_action, is_composio_tool
    from app.agents.supervisor import SupervisorAgent, DEFAULT_MODEL, _get_client

    db = SessionLocal()
    task = None
    try:
        task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
        if not task:
            return

        task.status = "running"
        db.commit()

        await broadcast(task_connections, room_id, {
            "type": "task_started",
            "data": {"task_id": task_id, "worker_id": None},
        })

        # Composio 툴 정의 가져오기
        composio_tools = await get_tools_for_apps([composio_app])
        if not composio_tools:
            raise Exception(f"{composio_app} 앱의 툴을 불러오지 못했습니다. 연결 상태를 확인해 주세요.")

        # Supervisor로 task_plan 생성
        supervisor = SupervisorAgent()
        task_plan = await supervisor.analyze(content, [], user_name=user_name)

        # WorkerLLM으로 실행 (MCP 없이 Composio 툴만 사용)
        from app.agents.worker_llm import WorkerLLM
        base_url, api_key = await _get_client()

        step_counter = [0]

        async def on_progress(message: str):
            step_counter[0] += 1
            await broadcast(task_connections, room_id, {
                "type": "task_progress",
                "data": {
                    "task_id": task_id,
                    "progress": min(step_counter[0] * 10, 90),
                    "message": message,
                    "step": message,
                },
            })

        async def on_chunk(text: str):
            await broadcast(chat_connections, room_id, {
                "type": "message_chunk",
                "data": {"task_id": task_id, "text": text},
            })

        async def composio_executor(action_name: str, params: dict) -> str:
            return await execute_action(entity_id, action_name, params)

        worker_llm = WorkerLLM(
            worker_agent=None,  # type: ignore — Composio 전용, MCP 불필요
            composio_tools=composio_tools,
            composio_executor=composio_executor,
        )

        result_text = await worker_llm.run(
            task_plan, [],
            on_progress,
            model=DEFAULT_MODEL,
            base_url=base_url,
            api_key=api_key,
            user_name=user_name,
            on_chunk=on_chunk,
        )

        task.status = "completed"
        task.completed_at = datetime.utcnow()
        db.commit()

        ai_msg = Message(
            room_id=uuid.UUID(room_id),
            user_id=None,
            content=result_text,
            type="ai_res",
        )
        db.add(ai_msg)
        db.commit()
        db.refresh(ai_msg)

        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": str(ai_msg.id),
                "room_id": room_id,
                "user_id": None,
                "content": result_text,
                "type": "ai_res",
                "created_at": ai_msg.created_at.isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_completed",
            "data": {"task_id": task_id, "result_diff": None, "completed_at": datetime.utcnow().isoformat()},
        })

    except Exception as e:
        print(f"[_run_composio_task] 오류: {e}")
        if task:
            task.status = "failed"
            task.error = str(e)
            db.commit()
        error_msg = str(e)
        await broadcast(chat_connections, room_id, {
            "type": "message",
            "data": {
                "id": f"err-{task_id}",
                "room_id": room_id,
                "user_id": None,
                "content": f"⚠️ {error_msg}",
                "type": "ai_res",
                "created_at": datetime.utcnow().isoformat() + "Z",
            },
        })
        await broadcast(task_connections, room_id, {
            "type": "task_failed",
            "data": {"task_id": task_id, "error": error_msg},
        })
    finally:
        db.close()


@router.post("/rooms/{room_id}/ai/confirm", status_code=200)
async def ai_confirm(
    room_id: str,
    body: AiConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """사용자가 AI 작업 계획에 동의하거나 거부한다."""
    room = require_room_access(room_id, current_user, db)
    room_id_str = str(room.id)  # slug가 올 수 있으므로 항상 UUID 문자열 사용

    task = db.query(Task).filter(
        Task.id == body.task_id,
        Task.room_id == room.id,
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "awaiting_confirm":
        raise HTTPException(status_code=400, detail=f"Task is not awaiting confirmation (status: {task.status})")

    if not body.confirmed:
        task.status = "cancelled"
        db.commit()
        await broadcast(task_connections, room_id_str, {
            "type": "task_cancelled",
            "data": {"task_id": str(body.task_id)},
        })
        return JSONResponse({"status": "cancelled"})

    # 동의 → 실행 시작
    team_id = str(room.team_id)

    original_msg = db.query(Message).filter(Message.id == task.message_id).first()
    content = original_msg.content if original_msg else ""
    if task.interrupted_context and task.interrupted_context.get("merged_instruction"):
        content = task.interrupted_context["merged_instruction"]

    task.status = "pending"
    db.commit()

    # Composio 작업인 경우 별도 실행
    if body.composio_app:
        entity_id = str(current_user.id)
        asyncio.create_task(
            _run_composio_task(
                str(task.id), content, body.composio_app,
                entity_id, room_id_str, current_user.name,
            )
        )
        return JSONResponse({"status": "started", "type": "composio"})

    mcp_config = None
    if task.mcp_config_id:
        mcp_config = db.query(McpConfig).filter(McpConfig.id == task.mcp_config_id).first()

    if mcp_config:
        idle_exists = (
            db.query(Worker)
            .filter(Worker.team_id == uuid.UUID(team_id), Worker.status == WorkerStatus.idle)
            .first()
        ) is not None

        if idle_exists:
            asyncio.create_task(
                _run_ai_task(str(task.id), content, str(mcp_config.id), room_id_str, team_id, current_user.name)
            )
        else:
            q = _get_queue(team_id)
            await q.put((str(task.id), content, str(mcp_config.id), room_id_str, current_user.name))
            await broadcast(task_connections, room_id_str, {
                "type": "task_queued",
                "data": {
                    "task_id": str(task.id),
                    "message": "Worker가 모두 사용 중입니다. 순서대로 처리됩니다.",
                },
            })
    else:
        asyncio.create_task(
            _run_chat_only(str(task.id), content, room_id_str, current_user.name, team_id)
        )

    return JSONResponse({"status": "confirmed", "task_id": str(task.id)})


# ── AI 작업 취소 ──────────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/cancel", status_code=200)
async def cancel_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """실행 중인 AI 작업을 취소한다."""
    task = db.query(Task).filter(Task.id == uuid.UUID(task_id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    require_room_access(str(task.room_id), current_user, db)
    if task.status not in ("running", "pending"):
        raise HTTPException(status_code=400, detail=f"Task is not running (status: {task.status})")

    # asyncio Task 취소
    active = _active_tasks.get(task_id)
    if active and not active.done():
        active.cancel()
    else:
        # 큐 대기 중 또는 이미 끝난 경우 직접 상태 변경
        task.status = "cancelled"
        db.commit()
        room_id = str(task.room_id)
        await broadcast(task_connections, room_id, {
            "type": "task_cancelled",
            "data": {"task_id": task_id},
        })

    return JSONResponse({"status": "cancelled", "task_id": task_id})
