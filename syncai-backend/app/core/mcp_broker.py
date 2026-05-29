"""
MCP WebSocket 브로커
====================
MCP 서버(Worker PC)와 백엔드 간 역방향 WebSocket 연결을 관리한다.

- agent_connections: token → WebSocket (MCP 서버가 연결 유지)
- call_tool(): 해당 토큰의 WS로 툴 요청 전송 → 응답 대기 → 결과 반환
- send_event(): MCP 서버로 이벤트(new_config, request_folder_pick 등) 전송
- resolve_response(): WS 수신 루프에서 응답 도착 시 Future 완료 처리
"""
import asyncio
import uuid
import logging
from fastapi import WebSocket

log = logging.getLogger("mcp_broker")

# token → WebSocket (MCP 서버 연결)
agent_connections: dict[str, WebSocket] = {}

# request_id → asyncio.Future (툴 호출 응답 대기)
_pending: dict[str, asyncio.Future] = {}


class MCPBrokerError(Exception):
    """WS 브로커 경유 툴 호출 오류."""
    pass


def is_online(token: str) -> bool:
    """해당 토큰의 MCP 서버가 현재 연결되어 있는지 확인."""
    return token in agent_connections


async def call_tool(token: str, name: str, arguments: dict, timeout: int = 30):
    """
    MCP 서버에 툴 호출 요청을 보내고 결과를 기다린다.
    WS 연결이 없으면 MCPBrokerError 발생.
    """
    ws = agent_connections.get(token)
    if not ws:
        raise MCPBrokerError("MCP 서버가 오프라인입니다. PC가 켜져 있는지 확인해 주세요.")

    request_id = str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[request_id] = fut

    try:
        await ws.send_json({
            "type": "tool_call",
            "id": request_id,
            "name": name,
            "arguments": arguments,
        })
        result = await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        raise MCPBrokerError(f"MCP 서버 응답 시간 초과 ({timeout}초)")
    finally:
        _pending.pop(request_id, None)


async def send_event(token: str, event: dict) -> bool:
    """
    MCP 서버에 이벤트를 전송한다.
    연결 없으면 False 반환.
    """
    ws = agent_connections.get(token)
    if not ws:
        return False
    try:
        await ws.send_json(event)
        return True
    except Exception as e:
        log.warning("[broker] 이벤트 전송 실패 (%s): %s", token[-6:], e)
        return False


def resolve_response(request_id: str, result=None, error: str | None = None) -> None:
    """
    WS 수신 루프에서 MCP 서버 응답이 도착하면 호출.
    해당 Future를 완료 처리한다.
    """
    fut = _pending.get(request_id)
    if not fut or fut.done():
        return
    if error:
        fut.set_exception(MCPBrokerError(f"MCP 툴 오류: {error}"))
    else:
        fut.set_result(result)
