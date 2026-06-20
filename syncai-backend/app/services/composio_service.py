"""Composio v3 REST API 래퍼 — 외부 앱(Notion, Figma 등) 툴 조회 및 실행."""
import json
import re
import httpx
from app.config import settings

COMPOSIO_BASE = "https://backend.composio.dev/api/v3"

_MCP_TOOL_NAMES = {
    "read_file", "write_file", "list_directory", "create_file", "delete_file",
    "create_directory", "move_file", "copy_file", "delete_directory",
    "search_files", "get_file_info",
}


def _headers() -> dict:
    return {"x-api-key": settings.COMPOSIO_API_KEY, "Content-Type": "application/json"}


_VALID_PROP_KEY = re.compile(r'^[a-zA-Z0-9_.\-]{1,64}$')


def _sanitize_key(key: str) -> str | None:
    """프로퍼티 키를 LLM 호환 패턴으로 변환. 불가 시 None."""
    if key.startswith("$"):  # $schema, $defs 등 제거
        return None
    cleaned = re.sub(r"[^a-zA-Z0-9_.\-]", "_", key)[:64]
    return cleaned if _VALID_PROP_KEY.match(cleaned) else None


def _sanitize_property(prop: dict) -> dict:
    """단일 프로퍼티 스키마를 Gemini/OpenAI 호환 형식으로 정리."""
    if not isinstance(prop, dict):
        return {"type": "string"}
    result: dict = {}
    t = prop.get("type")
    # nullable / anyOf(null) → 단순 타입으로 축소
    if isinstance(t, list):
        non_null = [x for x in t if x != "null"]
        t = non_null[0] if non_null else "string"
    if t:
        result["type"] = t
    if "description" in prop:
        result["description"] = str(prop["description"])[:500]
    if "enum" in prop and isinstance(prop["enum"], list):
        result["enum"] = prop["enum"]
    if t == "array" and isinstance(prop.get("items"), dict):
        result["items"] = _sanitize_property(prop["items"])
    if t == "object":
        if isinstance(prop.get("properties"), dict):
            safe_props = {}
            for k, v in prop["properties"].items():
                safe_k = _sanitize_key(k)
                if safe_k and isinstance(v, dict):
                    safe_props[safe_k] = _sanitize_property(v)
            result["properties"] = safe_props
        if isinstance(prop.get("required"), list):
            # required 목록도 sanitize된 키만 포함
            result["required"] = [
                sk for x in prop["required"]
                if isinstance(x, str) and (sk := _sanitize_key(x))
            ]
        if "properties" not in result:
            result["properties"] = {}
    if "type" not in result:
        result["type"] = "string"
    return result


def _sanitize_schema(schema: dict) -> dict:
    """Composio input_parameters를 Gemini/OpenAI 호환 JSON Schema로 정리.

    Gemini는 $schema/$defs/$ref/additionalProperties/nullable 등을 지원하지 않아
    OpenRouter를 통해 Provider returned error를 반환한다.
    """
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}}
    result: dict = {"type": "object"}
    if isinstance(schema.get("properties"), dict):
        safe_props = {}
        for k, v in schema["properties"].items():
            safe_k = _sanitize_key(k)
            if safe_k and isinstance(v, dict):
                safe_props[safe_k] = _sanitize_property(v)
        result["properties"] = safe_props
    else:
        result["properties"] = {}
    if isinstance(schema.get("required"), list):
        result["required"] = [
            sk for x in schema["required"]
            if isinstance(x, str) and (sk := _sanitize_key(x))
        ]
    if "description" in schema:
        result["description"] = str(schema["description"])[:500]
    return result


async def get_connected_app_names(user_id: str) -> list[str]:
    """사용자의 활성 연결 앱 슬러그 목록 반환."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{COMPOSIO_BASE}/connected_accounts",
                headers=_headers(),
                params={"user_id": user_id, "status": "ACTIVE"},
            )
        if resp.status_code != 200:
            return []
        # Composio가 user_id/status 필터를 무시하므로 직접 필터링
        return [
            item.get("toolkit", {}).get("slug", "").lower()
            for item in resp.json().get("items", [])
            if item.get("user_id") == user_id and item.get("status") == "ACTIVE"
        ]
    except Exception:
        return []


async def get_tools_for_apps(app_slugs: list[str]) -> list[dict]:
    """앱들의 OpenAI 호환 툴 정의 목록 반환 (중요 액션만, 최대 20개)."""
    if not app_slugs:
        return []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{COMPOSIO_BASE}/tools",
                headers=_headers(),
                params={
                    "toolkit_slugs": ",".join(app_slugs),
                    "important": "true",
                    "limit": 20,
                },
            )
        if resp.status_code != 200:
            return []
        tools = []
        for tool in resp.json().get("items", []):
            raw_params = tool.get("input_parameters") or {}
            params = _sanitize_schema(raw_params if isinstance(raw_params, dict) else {})
            tools.append({
                "type": "function",
                "function": {
                    "name": tool["slug"],
                    "description": (tool.get("description", tool["slug"]) or tool["slug"])[:1000],
                    "parameters": params,
                },
            })
        return tools
    except Exception:
        return []


async def execute_action(user_id: str, tool_slug: str, params: dict) -> str:
    """Composio v3 툴을 실행하고 결과를 문자열로 반환."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{COMPOSIO_BASE}/tools/execute/{tool_slug}",
                headers=_headers(),
                json={"user_id": user_id, "arguments": params},
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
