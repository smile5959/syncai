"""
Supervisor 에이전트
DEFAULT_MODEL(gemma:free) 고정.
역할:
  1. analyze()  — 작업 계획 생성 (Worker에게 전달할 지시)
  2. validate() — Worker 결과 검증 + 재시도 판단
멀티 워커 확장 시 validate()의 file_changes를 list[dict]로 변경.
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

VALIDATE_SYSTEM_PROMPT = (
    "당신은 SyncAI의 작업 검증기입니다. Worker가 수행한 결과를 검토해 "
    "작업이 성공적으로 완료됐는지 판단하세요.\n\n"
    "반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이):\n"
    "{\"success\": true/false, \"retry_plan\": \"재시도 지시 또는 null\"}\n\n"
    "판단 기준:\n"
    "- 파일 변경이 필요한 작업인데 실제 변경 내역이 없으면 false\n"
    "- Worker 응답에 오류/실패 언급이 있으면 false\n"
    "- 요청한 작업이 실제로 수행됐으면 true\n"
    "- retry_plan: success=false일 때 Worker에게 줄 구체적 보완 지시 (한국어), success=true면 null"
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
        컨텍스트는 최근 5개만 사용 (토큰 절약).
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
        # F: 최근 5개만 (Supervisor는 판단만 하므로 전체 맥락 불필요)
        for msg in context_messages[-5:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": command})

        try:
            response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                max_tokens=450,
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

    async def validate(
        self,
        task_plan: str,
        worker_result: str,
        file_changes: dict,
    ) -> dict:
        """
        Worker 실행 결과를 검증하고 재시도 여부를 결정한다.

        멀티 워커 확장 시 변경 방향:
          - file_changes: dict → results: list[dict] (각 Worker의 결과 + file_changes)
          - validate()가 여러 Worker 결과를 취합해 최종 판단

        반환: {"success": bool, "retry_plan": str | None}
        실패 시 success=True로 간주 (재시도 루프 무한 방지).
        """
        base_url, api_key = await _get_client()
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        # 파일 변경 요약 생성
        if file_changes:
            changes_summary = "\n".join(
                f"- {path}: {'신규 생성' if v.get('before') is None else '삭제' if v.get('after') is None else '수정'}"
                for path, v in file_changes.items()
            )
        else:
            changes_summary = "없음"

        user_content = (
            f"[작업 지시]\n{task_plan}\n\n"
            f"[Worker 응답]\n{worker_result[:400]}\n\n"
            f"[실제 파일 변경 내역]\n{changes_summary}"
        )

        try:
            response = await client.chat.completions.create(
                model=DEFAULT_MODEL,
                max_tokens=256,
                messages=[
                    {"role": "system", "content": VALIDATE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            )
            raw = (response.choices[0].message.content or "{}").strip()
            raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(raw)
            return {
                "success": bool(data.get("success", True)),
                "retry_plan": data.get("retry_plan") or None,
            }
        except Exception as e:
            print(f"[SupervisorAgent.validate] 검증 실패: {e}")
            return {"success": True, "retry_plan": None}
