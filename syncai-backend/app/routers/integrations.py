from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import httpx
from app.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/integrations", tags=["integrations"])

COMPOSIO_BASE = "https://backend.composio.dev/api/v3"


def _headers():
    return {"x-api-key": settings.COMPOSIO_API_KEY, "Content-Type": "application/json"}


# ── 앱(툴킷) 목록 ──────────────────────────────────────────────────────────────

@router.get("/apps")
async def list_apps(search: str = Query("", description="앱 검색어")):
    """Composio v3 /toolkits 에서 앱 목록 조회"""
    params: dict = {"limit": 200}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{COMPOSIO_BASE}/toolkits", headers=_headers(), params=params)
    if resp.status_code != 200:
        raise HTTPException(502, f"Composio API 오류: {resp.status_code}")

    items = resp.json().get("items", [])

    # 프론트가 기대하는 형태로 정규화
    apps = []
    for item in items:
        meta = item.get("meta") or {}
        cats = meta.get("categories") or []
        apps.append({
            "key": item.get("slug", ""),
            "name": item.get("name", ""),
            "displayName": item.get("name", ""),
            "description": meta.get("description", ""),
            "logo": meta.get("logo", ""),
            "categories": [c.get("name", c) if isinstance(c, dict) else c for c in cats],
        })

    if search:
        s = search.lower()
        apps = [
            a for a in apps
            if s in a["name"].lower() or s in a["key"].lower()
            or any(s in str(c).lower() for c in a["categories"])
        ]

    return apps


# ── 연결 목록 ──────────────────────────────────────────────────────────────────

@router.get("/connections")
async def list_connections(current_user: User = Depends(get_current_user)):
    """현재 유저의 연결된 계정 목록"""
    user_id = str(current_user.id)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{COMPOSIO_BASE}/connected_accounts",
            headers=_headers(),
            params={"user_id": user_id, "status": "ACTIVE"},
        )
    if resp.status_code != 200:
        raise HTTPException(502, f"Composio API 오류: {resp.status_code}")

    raw = resp.json().get("items", [])
    # Composio가 user_id/status 필터를 무시하므로 직접 필터링
    return [
        {
            "id": item.get("id", ""),
            "appName": item.get("toolkit", {}).get("slug", ""),
            "clientUniqueUserId": item.get("user_id", ""),
            "status": item.get("status", ""),
            "createdAt": item.get("created_at"),
            "updatedAt": item.get("updated_at"),
        }
        for item in raw
        if item.get("user_id") == user_id and item.get("status") == "ACTIVE"
    ]


# ── 연결 시작 (OAuth redirect) ─────────────────────────────────────────────────

class ConnectRequest(BaseModel):
    app_name: str
    redirect_uri: str | None = None


@router.post("/connect")
async def connect_app(body: ConnectRequest, current_user: User = Depends(get_current_user)):
    """toolkit 연결 시작 — auth_config를 찾거나 생성 후 OAuth link 반환"""
    user_id = str(current_user.id)
    toolkit_slug = body.app_name
    callback_url = body.redirect_uri or f"{settings.FRONTEND_URL}/integrations"

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1) 기존 managed auth_config 조회
        cfg_resp = await client.get(
            f"{COMPOSIO_BASE}/auth_configs",
            headers=_headers(),
            params={"toolkit_slug": toolkit_slug},
        )
        auth_config_id: str | None = None
        if cfg_resp.status_code == 200:
            items = cfg_resp.json().get("items", [])
            managed = [i for i in items if i.get("is_composio_managed")]
            if managed:
                auth_config_id = managed[0]["id"]

        # 2) 없으면 새로 생성
        if not auth_config_id:
            create_resp = await client.post(
                f"{COMPOSIO_BASE}/auth_configs",
                headers=_headers(),
                json={
                    "toolkit": {"slug": toolkit_slug},
                    "auth_config": {
                        "type": "use_composio_managed_auth",
                        "name": f"{toolkit_slug}-managed",
                    },
                },
            )
            if create_resp.status_code not in (200, 201):
                raise HTTPException(502, f"auth_config 생성 실패: {create_resp.text}")
            auth_config_id = create_resp.json().get("auth_config", {}).get("id")

        if not auth_config_id:
            raise HTTPException(502, "auth_config_id를 가져오지 못했습니다")

        # 3) OAuth link 생성
        link_resp = await client.post(
            f"{COMPOSIO_BASE}/connected_accounts/link",
            headers=_headers(),
            json={
                "auth_config_id": auth_config_id,
                "user_id": user_id,
                "callback_url": callback_url,
            },
        )
        if link_resp.status_code not in (200, 201):
            raise HTTPException(502, f"연결 링크 생성 실패: {link_resp.text}")

    data = link_resp.json()
    return {"redirectUrl": data.get("redirect_url"), "connectionId": data.get("connected_account_id")}


# ── 연결 해제 ──────────────────────────────────────────────────────────────────

@router.delete("/connections/{connection_id}")
async def disconnect_app(connection_id: str, current_user: User = Depends(get_current_user)):
    """연결 해제 — 본인 연결인지 확인 후 삭제"""
    user_id = str(current_user.id)
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 소유권 확인
        get_resp = await client.get(
            f"{COMPOSIO_BASE}/connected_accounts/{connection_id}",
            headers=_headers(),
        )
        if get_resp.status_code != 200:
            raise HTTPException(404, "연결을 찾을 수 없습니다")
        conn = get_resp.json()
        if conn.get("user_id") != user_id:
            raise HTTPException(403, "본인의 연결이 아닙니다")

        del_resp = await client.delete(
            f"{COMPOSIO_BASE}/connected_accounts/{connection_id}",
            headers=_headers(),
        )
    if del_resp.status_code not in (200, 204):
        raise HTTPException(502, "연결 해제 실패")
    return {"ok": True}
