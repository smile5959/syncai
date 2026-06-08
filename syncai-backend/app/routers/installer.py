"""
Installer OAuth PKCE flow.

GET /installer-auth           — browser redirect entry (called by installer)
GET /v1/installer/token       — JSON API (called by frontend page after login)
"""
import secrets
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.auth import decode_token
from app.core.deps import get_current_user
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.models.team import TeamMember
from app.models.user import User
from app.config import settings

router = APIRouter(tags=["Installer"])

# 인스톨러 로컬 서버만 허용 — MCP auth token이 외부로 유출되지 않도록 한다
_ALLOWED_REDIRECT_PREFIXES = (
    "http://localhost:",
    "http://127.0.0.1:",
)


def _validate_redirect_url(redirect: str) -> None:
    """redirect 파라미터가 localhost 이외를 가리키면 400 반환."""
    if not any(redirect.startswith(p) for p in _ALLOWED_REDIRECT_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail="redirect URL must point to localhost",
        )


# ─── Browser redirect entry point ────────────────────────────────────────────

@router.get("/installer-auth")
def installer_auth(
    state: str = Query(...),
    redirect: str = Query(...),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    Called by the installer (browser navigation).

    Tries cookie auth first; if the cookie is valid the config is created and
    the browser is sent directly to localhost:54321.  In practice the frontend
    and backend are on different domains, so the cookie is almost never present
    here — in that case we redirect to the frontend installer-auth page, which
    handles login and then calls /v1/installer/token.
    """
    _validate_redirect_url(redirect)

    token = request.cookies.get("access_token") if request else None
    user = _user_from_cookie(token, db)

    if user:
        mcp_token, config_id = _create_config(user, db)
        params = urlencode({"token": mcp_token, "config_id": config_id, "state": state})
        return RedirectResponse(f"{redirect}?{params}", status_code=302)

    # Redirect to frontend installer-auth page
    params = urlencode({"state": state, "redirect": redirect})
    return RedirectResponse(
        f"{settings.FRONTEND_URL}/installer-auth?{params}",
        status_code=302,
    )


# ─── JSON API (called by frontend page) ──────────────────────────────────────

@router.get("/v1/installer/token")
def installer_token(
    state: str = Query(...),
    redirect: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates an MCP config and returns the token so the frontend can redirect to
    the installer's local HTTP server.
    """
    _validate_redirect_url(redirect)

    mcp_token, config_id = _create_config(current_user, db)
    params = urlencode({"token": mcp_token, "config_id": config_id, "state": state})
    return {
        "token": mcp_token,
        "config_id": config_id,
        "redirect_url": f"{redirect}?{params}",
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _user_from_cookie(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    uid = payload.get("sub")
    if not uid:
        return None
    try:
        return db.query(User).filter(User.id == uuid.UUID(uid)).first()
    except (ValueError, AttributeError):
        return None


def _create_config(user: User, db: Session) -> tuple[str, str]:
    """
    Return (mcp_token, config_id).
    Reuses the user's existing offline config if one exists;
    otherwise creates a new one.
    """
    # Prefer existing offline config (is_online=False)
    existing = (
        db.query(McpConfig)
        .filter(McpConfig.owner_user_id == user.id, McpConfig.is_online == False)
        .order_by(McpConfig.created_at.desc())
        .first()
    )
    if existing:
        mcp_token = secrets.token_hex(16)
        existing.mcp_token = mcp_token
        db.commit()
        db.refresh(existing)
        return mcp_token, str(existing.id)

    # No existing config — create new
    mcp_token = secrets.token_hex(16)
    config = McpConfig(
        owner_user_id=user.id,
        name=f"{user.name}의 PC",
        endpoint="",
        base_dir=None,
        mcp_token=mcp_token,
        is_online=False,
    )
    db.add(config)
    db.flush()

    team_ids = [
        row.team_id
        for row in db.query(TeamMember.team_id)
        .filter(TeamMember.user_id == user.id)
        .all()
    ]
    for team_id in team_ids:
        db.add(McpConfigTeam(mcp_config_id=config.id, team_id=team_id, is_public=True))

    db.commit()
    db.refresh(config)
    return mcp_token, str(config.id)
