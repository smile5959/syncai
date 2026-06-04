"""
Worker 에이전트
Supervisor로부터 받은 tool_use 요청을 실제 MCP 호출로 변환.
"""
import difflib
import json
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.agents.mcp_client import MCPClient, MCPError, MCPFatalError
from app.models.file_lock import FileLock

STALE_LOCK_THRESHOLD_MINUTES = 5

SUPPORTED_TOOLS = {
    "read_file", "write_file", "list_directory", "create_file", "delete_file",
    "create_directory", "move_file", "copy_file", "delete_directory",
    "search_files", "get_file_info",
}


class WorkerAgent:
    def __init__(
        self,
        mcp_client: MCPClient,
        db: Session,
        task_id: str,
        worker_id: str,
    ):
        self.mcp = mcp_client
        self.db = db
        self.task_id = task_id
        self.worker_id = worker_id
        self.file_changes: dict = {}

    async def execute_tool(self, tool_name: str, args: dict) -> str:
        if tool_name not in SUPPORTED_TOOLS:
            return f"[오류] 지원하지 않는 툴: {tool_name}"

        try:
            if tool_name == "read_file":
                return await self._read_file(args["path"])
            elif tool_name == "write_file":
                return await self._write_file(args["path"], args["content"])
            elif tool_name == "create_file":
                return await self._write_file(args["path"], args.get("content", ""))
            elif tool_name == "list_directory":
                return await self._list_directory(args.get("path", "."))
            elif tool_name == "delete_file":
                return await self._delete_file(args["path"])
            elif tool_name == "create_directory":
                return await self._simple_tool("create_directory", {"path": args["path"]})
            elif tool_name == "move_file":
                return await self._simple_tool("move_file", {"src": args["src"], "dest": args["dest"]})
            elif tool_name == "copy_file":
                return await self._simple_tool("copy_file", {"src": args["src"], "dest": args["dest"]})
            elif tool_name == "delete_directory":
                return await self._simple_tool("delete_directory", {"path": args["path"]})
            elif tool_name == "search_files":
                return await self._simple_tool("search_files", {
                    "pattern": args.get("pattern", ""),
                    "keyword": args.get("keyword", ""),
                    "path": args.get("path", "."),
                })
            elif tool_name == "get_file_info":
                return await self._simple_tool("get_file_info", {"path": args["path"]})
        except MCPFatalError:
            raise  # 재시도 불가 에러는 supervisor까지 전파
        except MCPError as e:
            return f"[MCP 오류] {e}"
        except KeyError as e:
            return f"[인자 오류] 필수 인자 누락: {e}"

        return "[오류] 알 수 없는 툴"

    async def _simple_tool(self, tool_name: str, args: dict) -> str:
        result = await self.mcp.call_tool(tool_name, args)
        if isinstance(result, (list, dict)):
            return json.dumps(result, ensure_ascii=False)
        return str(result) if result is not None else "완료"

    async def _read_file(self, path: str) -> str:
        result = await self.mcp.call_tool("read_file", {"path": path})
        return str(result) if result is not None else ""

    async def _write_file(self, path: str, content: str) -> str:
        try:
            before = await self._read_file(path)
        except Exception:
            before = None

        stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_LOCK_THRESHOLD_MINUTES)
        self.db.query(FileLock).filter(
            FileLock.file_path == path,
            FileLock.locked_at < stale_cutoff,
        ).delete(synchronize_session=False)
        self.db.commit()

        existing_lock = self.db.query(FileLock).filter(FileLock.file_path == path).first()
        if existing_lock and str(existing_lock.task_id) != str(self.task_id):
            return f"[충돌] '{path}' 파일이 다른 작업(task_id={existing_lock.task_id})에 의해 잠겨 있습니다."

        lock = FileLock(
            id=uuid.uuid4(),
            task_id=uuid.UUID(str(self.task_id)),
            worker_id=uuid.UUID(str(self.worker_id)),
            file_path=path,
            locked_at=datetime.now(timezone.utc),
        )
        self.db.add(lock)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return f"[충돌] '{path}' 파일 락 획득 실패 — 동시에 다른 작업이 해당 파일을 수정 중입니다."

        try:
            await self.mcp.call_tool("write_file", {"path": path, "content": content})
            self.file_changes[path] = {"before": before, "after": content}
            return f"파일 저장 완료: {path}"
        finally:
            try:
                self.db.delete(lock)
                self.db.commit()
            except Exception:
                self.db.rollback()

    async def _delete_file(self, path: str) -> str:
        try:
            before = await self._read_file(path)
        except Exception:
            before = None

        result = await self.mcp.call_tool("delete_file", {"path": path})
        self.file_changes[path] = {"before": before, "after": None}
        return str(result) if result is not None else f"삭제 완료: {path}"

    async def _list_directory(self, path: str) -> str:
        result = await self.mcp.call_tool("list_directory", {"path": path})
        if isinstance(result, list):
            return "\n".join(str(item) for item in result)
        return str(result)

    def generate_diff(self) -> str:
        if not self.file_changes:
            return ""

        parts = []
        for path, change in self.file_changes.items():
            is_new_file = change["before"] is None
            before_lines = (change["before"] or "").splitlines(keepends=True)
            after_lines = (change["after"] or "").splitlines(keepends=True)
            diff_lines = difflib.unified_diff(
                before_lines,
                after_lines,
                fromfile="/dev/null" if is_new_file else f"a/{path}",
                tofile=f"b/{path}",
            )
            diff_text = "".join(diff_lines)
            if diff_text:
                parts.append(diff_text)
            elif is_new_file:
                # 빈 파일 신규 생성 — unified_diff가 빈 문자열 반환하므로 명시적으로 표시
                parts.append(f"--- /dev/null\n+++ b/{path}\n(새 파일 생성, 내용 없음)\n")

        return "\n".join(parts)

    def build_backup_snapshot(self) -> dict:
        return {path: change["before"] for path, change in self.file_changes.items()}
