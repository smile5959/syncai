"""
Supervisor 에이전트
DEFAULT_MODEL(gemma:free) 고정.
작업 분석/계획만 담당 — tool-calling 루프 없음.
"""
import json
from openai import AsyncOpenAI
from app.config import settings

DEFAULT_MODEL = "google/gemma-4-31b-it:free"
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


async def _get_client() -> tuple[str, str]:
    return _OPENROUTER_BASE_URL, settings.OPENROUTER_API_KEY


ANALYZE_SYSTEM_PROMPT = (
    "당신은 SyncAI의 작업 분석기입니다. 채팅 맥락과 사용자 요청을 분석해 "
    "실행 AI(Worker)에게 전달할 구체적인 작업 지시를 생성하세요.\n\n"
    "반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이):\n"
    "{\"task_plan\": \"Worker에게 전달할 구체적인 작업 지시 (한국어)\"}\n\n"
    "- 사용자 요청을 구체화하세요 (파일 경로, 수정 내용 등 맥락에서 추론 가능한 것 포함)\n"
    "- 맥락에서 관련 정보를 추출해 지시에 포함하세요\n"
    "- 간결하고 명확하게 작성하세요"
)


class SupervisorAgent:
    def __init__(
        self,
        mcp_base_dir: str = "",
        available_mcps: list[dict] | None = None,
        selected_mcp_name: str = "",
    ):
        self.mcp_base_dir = mcp_base_dir
        self.available_mcps = available_mcps or []
        self.selected_mcp_name = selected_mcp_name

    async def analyze(
        self,
        command: str,
        context_messages: list[dict],
        user_name: str = "",
    ) -> str:
        """
        사용자 명령과 채팅 맥락을 분석해 Worker LLM에 전달할 작업 계획 문자열을 반환한다.
        DEFAULT_MODEL(gemma:free) 고정.
        실패 시 원본 command를 그대로 반환 (Worker가 직접 처리).
        """
        base_url, api_key = await _get_client()
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        system = ANALYZE_SYSTEM_PROMPT
        if self.mcp_base_dir:
            system += (
                f"\n\nMCP: {self.selected_mcp_name}, "
                f"허용 경로: {self.mcp_base_dir}"
            )
        if user_name:
            system += f"\n요청자: {user_name}"

        messages = [{"role": "system", "content": system}]
        for msg in context_messages[-10:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": command})

        try:
            response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                max_tokens=512,
                messages=messages,
            )
            raw = (response.choices[0].message.content or "{}").strip()
            raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(raw)
            plan = data.get("task_plan", "").strip()
            return plan if plan else command
        except Exception as e:
            print(f"[SupervisorAgent.analyze] 분석 실패: {e}")
            return command
