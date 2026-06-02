"""
Worker LLM 에이전트
슬롯별 모델(worker.model)로 tool-calling 루프 실행.
Supervisor.analyze()가 반환한 task_plan을 받아 MCP 툴을 호출하며 작업을 완료한다.
"""
import json
import asyncio
from typing import Callable, Awaitable
from openai import AsyncOpenAI
from app.agents.mcp_client import MCPFatalError
from app.agents.worker import WorkerAgent

MCP_TOOLS = [
    {"type": "function", "function": {"name": "read_file", "description": "파일 내용을 읽는다.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "읽을 파일 경로"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "write_file", "description": "파일에 내용을 쓴다. 없으면 생성, 있으면 덮어쓴다.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}}},
    {"type": "function", "function": {"name": "list_directory", "description": "디렉토리 내 파일/폴더 목록을 반환한다.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "조회할 경로 (기본값: .)"}}, "required": []}}},
    {"type": "function", "function": {"name": "create_file", "description": "새 파일을 생성한다.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "delete_file", "description": "파일을 삭제한다. 디렉토리는 삭제 불가.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "create_directory", "description": "새 폴더를 생성한다. 중간 경로도 자동으로 만든다.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "move_file", "description": "파일 또는 폴더를 이동하거나 이름을 변경한다.", "parameters": {"type": "object", "properties": {"src": {"type": "string"}, "dest": {"type": "string"}}, "required": ["src", "dest"]}}},
    {"type": "function", "function": {"name": "copy_file", "description": "파일을 복사한다.", "parameters": {"type": "object", "properties": {"src": {"type": "string"}, "dest": {"type": "string"}}, "required": ["src", "dest"]}}},
    {"type": "function", "function": {"name": "delete_directory", "description": "폴더와 하위 내용 전체를 삭제한다.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "search_files", "description": "파일명 패턴 또는 내용 키워드로 파일을 검색한다.", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}, "keyword": {"type": "string"}, "path": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_file_info", "description": "파일 또는 폴더의 크기, 수정일, 생성일 등 메타데이터를 조회한다.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
]

WORKER_SYSTEM_PROMPT = (
    "당신은 SyncAI입니다. 개발 팀의 AI 코딩 어시스턴트로, 팀원들과 채팅하며 실제 코드 작업을 수행합니다.\n\n"
    "## 대화 연속성\n"
    "- 인사말, 자기소개 금지. 이미 대화 중입니다.\n"
    "- 재확인 질문 금지. 맥락이 있으면 바로 실행하세요.\n"
    "- 짧고 자연스럽게 답하세요.\n\n"
    "## 파일시스템 접근\n"
    "MCP 서버를 통해 사용자의 로컬 PC에 이미 연결되어 있습니다.\n"
    "사용 가능한 툴: list_directory, read_file, write_file, create_file, delete_file, "
    "create_directory, move_file, copy_file, delete_directory, search_files, get_file_info\n\n"
    "절대 하지 말 것: '접근할 수 없어요', '권한이 없어요' — 툴로 접근하세요.\n\n"
    "## 행동 원칙\n"
    "- 경로를 알면 바로 툴 호출\n"
    "- 경로 불확실하면 list_directory로 탐색 후 실행\n"
    "- 파일 수정 시 read_file 먼저, write_file로 수정\n"
    "- 항상 한국어, 완료 후 한 줄 요약만\n"
)

MAX_ITERATIONS = 20


def _describe_tool(name: str, args: dict) -> str:
    if name == "read_file":
        return f"파일 읽는 중: {args.get('path', '')}"
    elif name in ("write_file", "create_file"):
        return f"파일 수정 중: {args.get('path', '')}"
    elif name == "list_directory":
        return f"디렉토리 조회 중: {args.get('path', '.')}"
    elif name == "delete_file":
        return f"파일 삭제 중: {args.get('path', '')}"
    elif name == "create_directory":
        return f"폴더 생성 중: {args.get('path', '')}"
    elif name == "move_file":
        return f"이동 중: {args.get('src', '')} -> {args.get('dest', '')}"
    elif name == "copy_file":
        return f"복사 중: {args.get('src', '')} -> {args.get('dest', '')}"
    elif name == "delete_directory":
        return f"폴더 삭제 중: {args.get('path', '')}"
    elif name == "search_files":
        return f"파일 검색 중: {args.get('pattern', '') or args.get('keyword', '')}"
    elif name == "get_file_info":
        return f"파일 정보 조회 중: {args.get('path', '')}"
    return f"툴 실행 중: {name}"


class WorkerLLM:
    def __init__(
        self,
        worker_agent: WorkerAgent,
        mcp_base_dir: str = "",
        available_mcps: list[dict] | None = None,
        selected_mcp_name: str = "",
    ):
        self.worker = worker_agent
        self.mcp_base_dir = mcp_base_dir
        self.available_mcps = available_mcps or []
        self.selected_mcp_name = selected_mcp_name

    async def run(
        self,
        task_plan: str,
        context_messages: list[dict],
        on_progress: Callable[[str], Awaitable[None]],
        model: str,
        base_url: str,
        api_key: str,
        user_name: str = "",
        on_chunk: Callable[[str], Awaitable[None]] | None = None,
        on_tool_call: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> str:
        """
        task_plan을 받아 tool-calling 루프로 실행하고 최종 응답 문자열을 반환한다.
        model: worker 슬롯에 설정된 모델 사용.
        """
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        # 시스템 프롬프트 구성
        if self.mcp_base_dir:
            base_dir_note = (
                "\n\n## 파일시스템 루트 (필독)\n"
                f"현재 사용 중인 MCP: **{self.selected_mcp_name}**\n"
                f"허용된 루트 경로: {self.mcp_base_dir}\n"
                "이 경로와 하위 디렉토리 전체에 자유롭게 접근할 수 있습니다.\n"
                "경로를 모르면 list_directory 로 탐색하세요."
            )
        else:
            base_dir_note = (
                "\n\n## 파일시스템 루트 (필독)\n"
                f"현재 사용 중인 MCP: **{self.selected_mcp_name}**\n"
                "허용 경로가 아직 설정되지 않았습니다. "
                "먼저 list_directory('.') 를 호출해서 접근 가능한 최상위 폴더를 확인한 뒤 작업하세요."
            )

        if self.available_mcps:
            mcp_list = "\n".join(
                f"  - {m['name']} (base_dir: {m['base_dir'] or '미설정'})"
                for m in self.available_mcps
            )
            mcp_note = (
                "\n\n## 팀 내 공개 MCP 목록\n"
                f"현재 팀에서 공개된 MCP 서버 목록입니다 (현재 작업에는 {self.selected_mcp_name} 사용):\n"
                f"{mcp_list}"
            )
        else:
            mcp_note = ""

        user_note = (
            f"\n\n지금 이 메시지를 보낸 사용자의 이름은 '{user_name}'입니다. "
            f"사용자가 자신의 이름을 물어보면 '{user_name}'이라고 알려주세요."
        ) if user_name else ""

        system_prompt = WORKER_SYSTEM_PROMPT + base_dir_note + mcp_note + user_note

        messages = [{"role": "system", "content": system_prompt}]
        for msg in context_messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": task_plan})

        for iteration in range(MAX_ITERATIONS):
            await on_progress(f"작업 중... ({iteration + 1}단계)")

            response = await client.chat.completions.create(
                model=model,
                max_tokens=4096,
                tools=MCP_TOOLS,
                messages=messages,
            )

            choice = response.choices[0]
            finish_reason = choice.finish_reason
            message = choice.message

            if finish_reason == "stop":
                content = message.content or "응답을 생성하지 못했습니다. 다시 시도해 주세요."
                if on_chunk:
                    for i in range(0, len(content), 6):
                        await on_chunk(content[i:i+6])
                        await asyncio.sleep(0.02)
                return content

            if finish_reason == "tool_calls":
                messages.append(message)

                for tool_call in (message.tool_calls or []):
                    tool_name = tool_call.function.name
                    try:
                        tool_args = json.loads(tool_call.function.arguments)
                    except Exception:
                        tool_args = {}

                    desc = _describe_tool(tool_name, tool_args)
                    await on_progress(desc)
                    if on_tool_call:
                        await on_tool_call(tool_name, desc)

                    try:
                        result = await self.worker.execute_tool(tool_name, tool_args)
                    except MCPFatalError as e:
                        return f"[MCP 오류] {e}"

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result,
                    })

                continue

            if message.content:
                content = message.content
                if on_chunk:
                    for i in range(0, len(content), 6):
                        await on_chunk(content[i:i+6])
                        await asyncio.sleep(0.02)
                return content
            break

        return "작업을 완료하지 못했습니다. 다시 시도해 주세요."
