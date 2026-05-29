"""
MCP JSON-RPC 2.0 클라이언트
=================================
툴 호출 우선순위:
  1. WS 브로커 (mcp_broker): token이 있고 WS 연결이 활성화된 경우
  2. HTTP fallback: endpoint가 있는 경우 (레거시 Cloudflare 터널)

WS 브로커 방식:
  백엔드가 브로커 역할 — MCP 서버가 역방향 WS로 연결,
  툴 요청을 WS 메시지로 전송하고 응답을 Future로 대기한다.
"""
import httpx
import logging
from typing import Any

log = logging.getLogger("mcp_client")


class MCPError(Exception):
    pass


class MCPFatalError(MCPError):
    """재시도해서는 안 되는 치명적 오류 (403 권한 없음, 401 인증 실패 등)."""
    pass


class MCPClient:
    def __init__(self, endpoint: str, token: str = "", timeout: int = 30):
        self.endpoint = endpoint.rstrip("/") if endpoint else ""
        self.token = token
        self.timeout = timeout
        self._id = 0

    def _headers(self) -> dict:
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    async def call_tool(self, name: str, arguments: dict) -> Any:
        """
        MCP tools/call 요청.
        WS 연결이 활성화된 경우 브로커 경유, 없으면 HTTP fallback.
        """
        # ── WS 브로커 경로 ──────────────────────────────────────────
        if self.token:
            from app.core.mcp_broker import is_online, call_tool as broker_call, MCPBrokerError
            if is_online(self.token):
                try:
                    return await broker_call(self.token, name, arguments, timeout=self.timeout)
                except MCPBrokerError as e:
                    raise MCPFatalError(str(e))

        # ── HTTP fallback (Cloudflare 터널, 레거시) ──────────────────
        if not self.endpoint:
            raise MCPFatalError(
                "MCP 서버가 오프라인입니다. PC가 켜져 있는지 확인해 주세요."
            )

        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
            "id": self._next_id(),
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(self.endpoint, json=payload, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
            except httpx.RequestError as e:
                raise MCPFatalError(f"MCP 서버에 연결할 수 없습니다: {e}")
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                try:
                    detail = e.response.json().get("detail", "")
                except Exception:
                    detail = e.response.text or ""
                msg = detail if detail else f"HTTP {status}"
                if status in (401, 403):
                    raise MCPFatalError(msg)
                raise MCPError(f"MCP HTTP 오류 {status}: {msg}")

        return self._parse_jsonrpc_result(data)

    def _parse_jsonrpc_result(self, data: dict) -> Any:
        """JSON-RPC 응답에서 결과값 추출."""
        if "error" in data:
            raise MCPError(f"MCP 툴 오류: {data['error']}")

        result = data.get("result", {})
        if isinstance(result, dict):
            content = result.get("content", [])
            text = content[0].get("text", "") if (content and isinstance(content[0], dict)) else ""

            # MCP 레벨 오류 (isError: true) — ToolError, PermissionError 등
            if result.get("isError"):
                raise MCPError(text or "MCP 툴 실행 실패")

            return text if text else result
        return result

    async def list_tools(self) -> list[dict]:
        """사용 가능한 툴 목록 조회 (HTTP only — WS 연결 확인용 불필요)"""
        if not self.endpoint:
            return []
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "params": {},
            "id": self._next_id(),
        }
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.post(self.endpoint, json=payload, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                raise MCPError(f"tools/list 실패: {e}")

        return data.get("result", {}).get("tools", [])

    async def ping(self) -> bool:
        """Worker 연결 상태 확인 — WS 연결이 있으면 즉시 True."""
        if self.token:
            from app.core.mcp_broker import is_online
            if is_online(self.token):
                return True
        try:
            await self.list_tools()
            return True
        except MCPError:
            return False
