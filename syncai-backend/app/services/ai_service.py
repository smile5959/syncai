"""
Claude API + MCP 연동 서비스
- execute_ai_task: /ai 커맨드 실행 (최근 채팅 컨텍스트 포함)
- MCP 실제 파일 수정은 2단계에서 구현
"""
import anthropic
from sqlalchemy.orm import Session
from app.config import settings
from app.services.room_service import get_recent_messages

# 슬라이딩 윈도우: 최근 몇 개 채팅을 컨텍스트로 넘길지 (미결 → 일단 20으로 설정)
CONTEXT_WINDOW = 20


async def execute_ai_task(content: str, worker_id: str, task_id: str, room_id: str, db: Session) -> str:
    """
    Claude API 호출 — 최근 채팅 N개를 컨텍스트로 포함

    TODO (2단계):
    - worker의 MCP endpoint로 연결
    - Claude에게 MCP tool_use (파일 읽기/쓰기) 권한 부여
    - 실제 파일 diff 반환
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # 최근 채팅 컨텍스트 조회 (슬라이딩 윈도우)
    recent_messages = get_recent_messages(db, room_id, limit=CONTEXT_WINDOW)
    recent_messages.reverse()  # 오래된 순서로 정렬

    # 시스템 프롬프트
    system_prompt = (
        "You are SyncAI, an AI assistant that helps development teams. "
        "You have access to the team's local codebase via MCP tools. "
        "When asked to modify files, explain what changes you would make. "
        "(MCP file modification will be enabled in a future update.)"
    )

    # 최근 채팅을 대화 히스토리로 구성
    messages = []
    for m in recent_messages:
        role = "assistant" if m.type == "ai_res" else "user"
        messages.append({"role": role, "content": m.content})

    # 현재 /ai 커맨드를 마지막 메시지로 추가
    messages.append({"role": "user", "content": content})

    response = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
    )

    return response.content[0].text
