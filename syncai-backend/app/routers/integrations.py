from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import httpx
from app.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/integrations", tags=["integrations"])

COMPOSIO_BASE = "https://backend.composio.dev/api/v1"


def _headers():
    return {"x-api-key": settings.COMPOSIO_API_KEY, "Content-Type": "application/json"}


@router.get("/apps")
async def list_apps(search: str = Query("", description="앱 검색어")):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{COMPOSIO_BASE}/apps", headers=_headers())
    if resp.status_code != 200:
        raise HTTPException(502, "Composio API 오류")
    apps = resp.json().get("items", [])
    if search:
        s = search.lower()
        apps = [
            a for a in apps
            if s in a.get("name", "").lower() or s in a.get("key", "").lower()
        ]
    return apps


@router.get("/connections")
async def list_connections(current_user: User = Depends(get_current_user)):
    entity_id = str(current_user.id)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{COMPOSIO_BASE}/connectedAccounts",
            headers=_headers(),
            params={"entityId": entity_id},
        )
    if resp.status_code != 200:
        raise HTTPException(502, "Composio API 오류")
    return resp.json().get("items", [])


class ConnectRequest(BaseModel):
    app_name: str
    redirect_uri: str | None = None


@router.post("/connect")
async def connect_app(body: ConnectRequest, current_user: User = Depends(get_current_user)):
    entity_id = str(current_user.id)
    redirect_uri = body.redirect_uri or f"{settings.FRONTEND_URL}/integrations"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{COMPOSIO_BASE}/connectedAccounts",
            headers=_headers(),
            json={
                "appName": body.app_name,
                "entityId": entity_id,
                "redirectUri": redirect_uri,
            },
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, detail=f"Composio 연결 실패: {resp.text}")
    return resp.json()


@router.delete("/connections/{connection_id}")
async def disconnect_app(connection_id: str, current_user: User = Depends(get_current_user)):
    entity_id = str(current_user.id)
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 소유권 확인
        get_resp = await client.get(
            f"{COMPOSIO_BASE}/connectedAccounts/{connection_id}",
            headers=_headers(),
        )
        if get_resp.status_code != 200:
            raise HTTPException(404, "연결을 찾을 수 없습니다")
        conn = get_resp.json()
        if conn.get("clientUniqueUserId") != entity_id:
            raise HTTPException(403, "본인의 연결이 아닙니다")

        del_resp = await client.delete(
            f"{COMPOSIO_BASE}/connectedAccounts/{connection_id}",
            headers=_headers(),
        )
    if del_resp.status_code not in (200, 204):
        raise HTTPException(502, "연결 해제 실패")
    return {"ok": True}
