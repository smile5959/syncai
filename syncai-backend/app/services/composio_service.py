"""Composio REST API 래퍼 — 외부 앱(Notion, Figma 등) 툴 조회 및 실행."""
import json
import httpx
from app.config import settings

COMPOSIO_BASE = "https://backend.composio.dev/api/v1"

_MCP_TOOL_NAMES = {
    "read_file", "write_file", "list_directory", "create_file", "delete_file",
    "create_directory", "move_file", "copy_file", "delete_directory",
    "search_files", "get_file_info",
}


def _headers() -> dict:
    return {"x-api-key": settings.COMPOSIO_API_KEY, "Content-Type": "application/json"}


async def get_connected_app_names(entity_id: str) -> list[str]:
    """사용자의 활성 연결 앱 이름 목록 반환."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{COMPOSIO_BASE}/connectedAccounts",
                headers=_headers(),
                params={"entityId": entity_id},
            )
        if resp.status_code != 200:
            return []
        return [
            item["appName"].lower()
            for item in resp.json().get("items", [])
            if item.get("status") == "ACTIVE"
        ]
    except Exception:
        return []


async def get_tools_for_apps(app_names: list[str]) -> list[dict]:
    """앱들의 OpenAI 호환 툴 정의 목록 반환 (중요 액션만)."""
    if not app_names:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{COMPOSIO_BASE}/actions",
                headers=_headers(),
                params={
                    "apps": ",".join(app_names),
                    "filterImportantActions": "true",
                    "limit": 20,
                },
            )
        if resp.status_code != 200:
            return []
        tools = []
        for action in resp.json().get("items", []):
            params = action.get("parameters", {})
            if not isinstance(params, dict):
                params = {"type": "object", "properties": {}}
            tools.append({
                "type": "function",
                "function": {
                    "name": action["name"],
                    "description": action.get("description", action["name"]),
                    "parameters": params,
                },
            })
        return tools
    except Exception:
        return []


async def execute_action(entity_id: str, action_name: str, params: dict) -> str:
    """Composio 액션을 실행하고 결과를 문자열로 반환."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{COMPOSIO_BASE}/actions/{action_name}/execute",
                headers=_headers(),
                json={"entityId": entity_id, "input": params},
            )
        if resp.status_code not in (200, 201):
            return f"오류 {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        result = data.get("response", {}).get("data", data)
        if isinstance(result, (dict, list)):
            return json.dumps(result, ensure_ascii=False, indent=2)[:2000]
        return str(result)[:2000]
    except Exception as e:
        return f"실행 오류: {e}"


def is_composio_tool(tool_name: str) -> bool:
    """MCP 툴이 아닌 경우 Composio 액션으로 판단."""
    return tool_name not in _MCP_TOOL_NAMES
