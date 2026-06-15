"""
MCP Config 라우터
- 사용자별 PC 접근 설정 (endpoint / base_dir / mcp_token)
- 팀별 공개/비공개 설정
- MCP 서버 heartbeat 수신
"""
import asyncio
import json
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_
import httpx
import redis as sync_redis

from app.database import get_db
from app.core.deps import get_current_user, require_team_member
from app.models.user import User
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.models.team import Team, TeamMember
from app.schemas.mcp_config import (
    McpConfigCreate, McpConfigUpdate, McpConfigOut,
    McpConfigWithTeam, McpHeartbeatRequest, McpHeartbeatResponse,
    McpAutoRegisterRequest, McpAutoRegisterResponse,
    McpRenameRequest,
)
from app.agents.mcp_client import MCPClient, MCPError

log = logging.getLogger(__name__)

# 재연결 대기 중인 MCP 서버 캐시 (user_id -> {"endpoint": str, "token": str})
_pending_endpoints: dict[str, dict] = {}

# ── SSE 연결 관리 ──────────────────────────────────────────────────────────────
# email -> asyncio.Queue (연결된 Worker PC 당 하나)
_sse_queues: dict[str, asyncio.Queue] = {}


async def _push_sse_event(email: str, event: dict) -> None:
    """연결된 Worker PC에 SSE 이벤트 push. 연결 없으면 무시."""
    q = _sse_queues.get(email)
    if q:
        await q.put(event)


router = APIRouter(tags=["MCP Configs"])


# ─────────────────────────────────────────────────────────────────────────────
# 자동 업데이트 버전 엔드포인트
# ─────────────────────────────────────────────────────────────────────────────

import os as _os

@router.get("/mcp-version")
def get_mcp_version():
    """MCP 코드 최신 버전 반환 (bootstrap.py 자동 업데이트용, 인증 불필요)."""
    version      = _os.environ.get("MCP_CODE_VERSION", "0.0.0")
    github_repo  = _os.environ.get("MCP_GITHUB_REPO", "").strip()
    data: dict   = {"version": version}
    if github_repo and version != "0.0.0":
        base = f"https://github.com/{github_repo}/releases/download/mcp/v{version}"
        data["download_url"]     = f"{base}/code.zip"
        data["install_sh_url"]   = f"{base}/install.sh"    # macOS 설치 스크립트
        data["install_ps1_url"]  = f"{base}/install.ps1"   # Windows 설치 스크립트
    return data


# ─────────────────────────────────────────────────────────────────────────────
# 내 MCP 목록 / 생성 / 수정 / 삭제
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/mcp-configs", status_code=201)
async def create_mcp_config(
    body: McpConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    내 MCP 등록. mcp_token 미입력 시 자동 생성. 소속 팀에 자동 공개.

    응답:
      - mcp_config: McpConfigOut
      - token: 발급된 MCP 토큰
      - online: True = 이미 WS 연결된 MCP 서버 있음 → 폴더 선택 팝업 자동 실행
                False = 설치파일 다운로드 필요
    """
    from app.core import mcp_broker

    token = body.mcp_token or secrets.token_hex(16)
    now = datetime.now(timezone.utc)
    config = McpConfig(
        owner_user_id=current_user.id,
        name=body.name,
        endpoint="",
        base_dir=body.base_dir,
        mcp_token=token,
        is_online=False,
        token_issued_at=now,
    )
    db.add(config)
    db.flush()

    team_ids = [
        row.team_id
        for row in db.query(TeamMember.team_id)
        .filter(TeamMember.user_id == current_user.id)
        .all()
    ]
    for team_id in team_ids:
        db.add(McpConfigTeam(
            mcp_config_id=config.id,
            team_id=team_id,
            is_public=True,
        ))

    db.commit()
    db.refresh(config)

    # 이미 WS로 연결된 MCP 서버가 있는지 확인 (같은 사용자의 다른 토큰)
    user_online_token = _find_online_token(str(current_user.id), db)
    if user_online_token:
        # MCP 서버에 new_config 이벤트 전송 → tkinter 폴더 선택 팝업 자동 실행
        await mcp_broker.send_event(user_online_token, {
            "type": "new_config",
            "mcp_config_id": str(config.id),
            "mcp_token": token,  # 새 토큰 전달 (MCP 서버가 이 토큰도 등록)
        })
        log.info("[create] 온라인 MCP 서버에 new_config 이벤트 전송 (config=%s)", config.id)
        online_flag = True
    else:
        online_flag = False

    # McpConfigOut 직렬화
    config_out = {
        "id": str(config.id),
        "owner_user_id": str(config.owner_user_id),
        "name": config.name,
        "endpoint": config.endpoint,
        "base_dir": config.base_dir,
        "mcp_token": config.mcp_token,
        "is_online": config.is_online,
        "created_at": config.created_at.isoformat(),
    }

    return {
        "mcp_config": config_out,
        "token": token,
        "online": online_flag,
    }


def _find_online_token(user_id: str, db: Session) -> str | None:
    """
    해당 사용자의 MCP 서버 중 WS로 현재 연결된 토큰을 반환.
    DB의 is_online보다 브로커의 실제 연결 상태를 우선한다.
    """
    from app.core import mcp_broker
    configs = db.query(McpConfig).filter(
        McpConfig.owner_user_id == user_id
    ).all()
    for cfg in configs:
        if cfg.mcp_token and mcp_broker.is_online(cfg.mcp_token):
            return cfg.mcp_token
    return None


@router.get("/mcp-configs", response_model=list[McpConfigOut])
def list_my_mcp_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 MCP 목록."""
    return db.query(McpConfig).filter(McpConfig.owner_user_id == current_user.id).all()


@router.get("/mcp-configs/download")
def download_installer(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    MCP 인스톨러 다운로드 URL 반환.
    MCP_INSTALLER_URL fly secret으로 GitHub Releases URL 주입.
    """
    from app.config import settings

    # 토큰이 현재 사용자 소유인지 확인
    config = db.query(McpConfig).filter(
        McpConfig.mcp_token == token,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="해당 토큰의 MCP Config를 찾을 수 없습니다.")

    if not settings.MCP_INSTALLER_URL:
        raise HTTPException(status_code=503, detail="인스톨러 URL이 설정되지 않았습니다. 관리자에게 문의하세요.")
    download_url = settings.MCP_INSTALLER_URL

    # macOS 설치 스크립트 URL (GitHub Releases에서 동적 생성)
    version     = _os.environ.get("MCP_CODE_VERSION", "0.0.0")
    github_repo = _os.environ.get("MCP_GITHUB_REPO", "").strip()
    install_sh_url  = None
    install_ps1_url = None
    if github_repo and version != "0.0.0":
        base = f"https://github.com/{github_repo}/releases/download/mcp/v{version}"
        install_sh_url  = f"{base}/install.sh"
        install_ps1_url = f"{base}/install.ps1"

    return {
        "download_url":    download_url,
        "install_sh_url":  install_sh_url,
        "install_ps1_url": install_ps1_url,
        "token":           token,
        "config_id":       str(config.id),
        "name":            config.name,
    }


@router.get("/mcp-configs/install-command")
def download_install_command(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    macOS용 .command 파일 반환.
    더블클릭하면 Terminal이 열리며 MCP 서버를 자동 설치/실행.
    """
    config = db.query(McpConfig).filter(
        McpConfig.mcp_token == token,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="해당 토큰의 MCP Config를 찾을 수 없습니다.")

    version     = _os.environ.get("MCP_CODE_VERSION", "0.0.0")
    github_repo = _os.environ.get("MCP_GITHUB_REPO", "").strip()

    if not github_repo or version == "0.0.0":
        raise HTTPException(status_code=503, detail="설치 스크립트 URL이 준비되지 않았습니다.")

    base = f"https://github.com/{github_repo}/releases/download/mcp/v{version}"
    install_sh_url = f"{base}/install.sh"

    # .command 파일 내용 (더블클릭 시 Terminal에서 실행됨)
    script = f"""#!/bin/bash
# SyncAI MCP 설치 스크립트
# 이 파일을 더블클릭하면 자동으로 설치됩니다.

echo ""
echo "SyncAI MCP 설치를 시작합니다..."
echo ""

curl -fsSL "{install_sh_url}" | bash -s -- --token={token}

echo ""
echo "창을 닫아도 됩니다."
read -p "아무 키나 누르면 창이 닫힙니다..." -n1
"""

    return Response(
        content=script,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="syncai-mcp-install.command"',
        },
    )


@router.put("/mcp-configs/{config_id}", response_model=McpConfigOut)
def update_mcp_config(
    config_id: str,
    body: McpConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")
    if body.name is not None:
        config.name = body.name
    if body.base_dir is not None:
        config.base_dir = body.base_dir
    db.commit()
    db.refresh(config)
    return config


@router.patch("/mcp-configs/{config_id}/name", response_model=McpConfigOut)
def rename_mcp_config(
    config_id: str,
    body: McpRenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    MCP 이름만 변경. MCP 서버 관여 없음 (토큰으로 연결하므로 이름 무관).
    """
    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")

    config.name = body.name.strip()
    db.commit()
    db.refresh(config)
    log.info("[rename] config=%s 이름 변경: %s", config_id[:8], config.name)
    return config


@router.patch("/mcp-configs/{config_id}/auto-approve")
def set_auto_approve(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """MCP 자동 승인 토글 (소유자만)."""
    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")
    config.auto_approve = not config.auto_approve
    db.commit()
    return {"auto_approve": config.auto_approve}


@router.post("/mcp-configs/{config_id}/request-folder-pick")
async def request_folder_pick(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    경로 변경 — WS 연결된 MCP 서버에 request_folder_pick 이벤트 전송.
    MCP 서버: tkinter 폴더 선택 → base_dir_update 전송 → DB 자동 업데이트.
    MCP 서버 오프라인 시 409 반환 (프론트에서 텍스트 직접 입력 fallback).
    """
    from app.core import mcp_broker

    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")

    if not config.mcp_token or not mcp_broker.is_online(config.mcp_token):
        raise HTTPException(
            status_code=409,
            detail="MCP 서버가 오프라인입니다. 경로를 직접 입력해 주세요.",
        )

    sent = await mcp_broker.send_event(config.mcp_token, {
        "type": "request_folder_pick",
        "mcp_config_id": str(config.id),
    })
    if not sent:
        raise HTTPException(status_code=502, detail="이벤트 전송 실패")

    return {"ok": True, "message": "PC에서 폴더 선택 팝업이 열립니다."}


@router.delete("/mcp-configs/{config_id}", status_code=204)
def delete_mcp_config(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")

    # 삭제 전에 endpoint/token 저장
    endpoint = config.endpoint
    mcp_token = config.mcp_token

    db.delete(config)
    db.commit()

    # 이슈 2: 즉각 폐기 — MCP 서버에 revoke 신호 (꺼져있어도 heartbeat 감지로 보조)
    if endpoint:
        try:
            httpx.post(
                f"{endpoint}/revoke-token",
                json={"token": mcp_token},
                timeout=4,
            )
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# 팀별 공개/비공개 설정
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/mcp-configs/{config_id}/teams/{team_id}", response_model=dict)
def set_team_visibility(
    config_id: str,
    team_id: str,
    is_public: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """해당 팀에서 이 MCP를 공개/비공개 설정."""
    config = db.query(McpConfig).filter(
        McpConfig.id == config_id,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")
    require_team_member(team_id, current_user, db)

    link = db.query(McpConfigTeam).filter(
        McpConfigTeam.mcp_config_id == config_id,
        McpConfigTeam.team_id == team_id,
    ).first()
    if link:
        link.is_public = is_public
    else:
        link = McpConfigTeam(mcp_config_id=config.id, team_id=team_id, is_public=is_public)
        db.add(link)
    db.commit()
    return {"ok": True, "is_public": is_public}


# ─────────────────────────────────────────────────────────────────────────────
# 팀 내 접근 가능한 MCP 목록
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/teams/{team_id}/mcp-configs", response_model=list[McpConfigWithTeam])
def list_team_mcp_configs(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    팀 내 현재 사용자가 접근 가능한 MCP 목록.
    - 본인 소유 MCP (is_public 무관)
    - 팀 내 공개 MCP (is_public=true)
    """
    require_team_member(team_id, current_user, db)
    rows = (
        db.query(McpConfig, McpConfigTeam)
        .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
        .filter(
            McpConfigTeam.team_id == team_id,
            or_(
                McpConfig.owner_user_id == current_user.id,
                McpConfigTeam.is_public.is_(True),
            ),
        )
        .all()
    )
    result = []
    for config, link in rows:
        out = McpConfigWithTeam(
            id=config.id,
            owner_user_id=config.owner_user_id,
            name=config.name,
            endpoint=config.endpoint,
            base_dir=config.base_dir,
            mcp_token=config.mcp_token,
            created_at=config.created_at,
            is_public=link.is_public,
        )
        result.append(out)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# MCP 서버 자동 등록
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/mcp-configs/auto-register", response_model=McpAutoRegisterResponse)
def auto_register_mcp(
    body: McpAutoRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    MCP 서버 자동 등록 — JWT Bearer 인증 필요.
    신규 config를 절대 생성하지 않는다. 사용자가 UI에서 직접 만든 config에만 연결.
    1) 이 token으로 등록된 config가 있으면 그대로 반환.
    2) 없지만 이 유저의 미연결 config(endpoint="")가 있으면 → token 교체 후 반환.
    3) 아무것도 없으면 → ok=False 반환 (사용자가 UI에서 먼저 config를 만들어야 함).
    """
    # endpoint + token 캐시 — pick-folder 및 reconnect 신호에 사용
    if body.endpoint:
        _pending_endpoints[str(current_user.id)] = {"endpoint": body.endpoint, "token": body.mcp_token}

    # 1) 동일 token 이미 존재
    existing = db.query(McpConfig).filter(
        McpConfig.mcp_token == body.mcp_token,
        McpConfig.owner_user_id == current_user.id,
    ).first()
    if existing:
        _ensure_team_links(existing, current_user, db)
        db.commit()
        return McpAutoRegisterResponse(ok=True, mcp_config_id=str(existing.id), created=False)

    # 2) 미연결 config(endpoint="")에 token 교체 — 사용자가 UI에서 만든 것
    unclaimed = db.query(McpConfig).filter(
        McpConfig.owner_user_id == current_user.id,
        McpConfig.endpoint == "",
    ).first()
    if unclaimed:
        log.info("[auto-register] token 교체: config=%s ...%s→...%s",
                 unclaimed.id, str(unclaimed.mcp_token or "")[-6:], body.mcp_token[-6:])
        unclaimed.mcp_token = body.mcp_token
        unclaimed.token_issued_at = datetime.now(timezone.utc)
        _ensure_team_links(unclaimed, current_user, db)
        db.commit()
        db.refresh(unclaimed)
        return McpAutoRegisterResponse(ok=True, mcp_config_id=str(unclaimed.id), created=False)

    # 3) 기존 config가 하나도 없으면 최초 설치로 간주 — 자동 생성
    existing_count = db.query(McpConfig).filter(
        McpConfig.owner_user_id == current_user.id
    ).count()
    if existing_count == 0:
        import socket as _socket
        pc_name = body.name or "내 PC"
        new_config = McpConfig(
            owner_user_id=current_user.id,
            name=pc_name,
            endpoint="",
            base_dir=None,
            mcp_token=body.mcp_token,
            token_issued_at=datetime.now(timezone.utc),
        )
        db.add(new_config)
        db.flush()
        _ensure_team_links(new_config, current_user, db)
        db.commit()
        db.refresh(new_config)
        log.info("[auto-register] 최초 설치 — config 자동 생성: %s", new_config.id)
        return McpAutoRegisterResponse(ok=True, mcp_config_id=str(new_config.id), created=True)

    # 4) config는 있지만 연결 불가 — UI에서 새 config 생성하면 자동 연결됨
    log.info("[auto-register] 연결 가능한 config 없음 (user=%s) — UI에서 MCP 등록 필요", current_user.id)
    return McpAutoRegisterResponse(ok=False, mcp_config_id="", created=False)


# ─────────────────────────────────────────────────────────────────────────────
# MCP 서버 heartbeat / lookup
# ─────────────────────────────────────────────────────────────────────────────

def _rate_limit_lookup_by_email(request: Request) -> None:
    """
    IP당 10요청/분 제한 — lookup-by-email 무차별 이메일 열거 방지.
    Redis 장애 시 요청 통과 (가용성 우선).
    """
    client_ip = request.client.host if request.client else "unknown"
    try:
        from app.config import settings
        r = sync_redis.from_url(settings.REDIS_URL, socket_timeout=1)
        key = f"ratelimit:lookup_by_email:{client_ip}"
        count = r.incr(key)
        if count == 1:
            r.expire(key, 60)  # 60초 TTL
        r.close()
        if count > 10:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again in a minute.",
            )
    except HTTPException:
        raise
    except Exception as e:
        log.warning("[rate-limit] Redis 오류 (무시): %s", e)


@router.get("/mcp-configs/lookup-by-email")
def lookup_by_email(
    email: str,
    endpoint: str = "",
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    MCP 서버 자동 연결용 — 이메일로 이 사용자의 config 조회.
    인증 불필요 (이메일 자체가 식별자, 내부 팀 툴 전제).
    endpoint 전달 시: _pending_endpoints 캐시 저장 → config 생성 시 즉시 reconnect 신호 전송.
    IP당 10요청/분 rate limiting 적용.
    """
    if request:
        _rate_limit_lookup_by_email(request)

    if not email:
        raise HTTPException(status_code=400, detail="email required")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # endpoint 캐시 — config가 없어도 저장 (생성 시 reconnect 신호 전송용)
    if endpoint:
        _pending_endpoints[str(user.id)] = {"endpoint": endpoint, "token": ""}

    # 미연결(endpoint="") config 우선, 없으면 최신 것
    config = (
        db.query(McpConfig)
        .filter(McpConfig.owner_user_id == user.id, McpConfig.endpoint == "")
        .order_by(McpConfig.created_at.desc())
        .first()
    )
    if not config:
        config = (
            db.query(McpConfig)
            .filter(McpConfig.owner_user_id == user.id)
            .order_by(McpConfig.created_at.desc())
            .first()
        )

    if not config:
        raise HTTPException(status_code=404, detail="No MCP config found. Please register MCP in the frontend.")

    # token까지 포함해서 캐시 갱신
    if endpoint and config.mcp_token:
        _pending_endpoints[str(user.id)] = {"endpoint": endpoint, "token": config.mcp_token}

    # mcp_token은 응답에서 제외 — 이메일만 알면 누구나 타인의 MCP 토큰을 획득할 수 있으므로
    return {
        "mcp_config_id": str(config.id),
        "base_dir": config.base_dir,
        "name": config.name,
    }


@router.get("/mcp-configs/lookup")
def lookup_mcp_config(mcp_token: str, db: Session = Depends(get_db)):
    """
    MCP 서버 시작 시 자신의 config_id 자동 조회 (인증 불필요 — token 자체가 식별자).
    """
    if not mcp_token:
        raise HTTPException(status_code=400, detail="mcp_token required")
    config = db.query(McpConfig).filter(McpConfig.mcp_token == mcp_token).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")
    return {
        "mcp_config_id": str(config.id),
        "name": config.name,
        "base_dir": config.base_dir,
    }


@router.get("/mcp-configs/sse")
async def mcp_sse(email: str, endpoint: str = "", db: Session = Depends(get_db)):
    """
    Worker PC → 백엔드 SSE 연결.
    heartbeat 폴링 대신 이 연결을 유지하며 이벤트를 수신한다.

    이벤트 종류:
      - connected: 연결 확인 + 현재 토큰/base_dir 전달
      - token_assigned: 사용자가 UI에서 슬롯 생성 → 토큰 push
      - base_dir_updated: base_dir 변경 시 push
      - ping: 30초마다 연결 유지
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 현재 config 조회
    config = (
        db.query(McpConfig)
        .filter(McpConfig.owner_user_id == user.id, McpConfig.endpoint == "")
        .order_by(McpConfig.created_at.desc())
        .first()
    ) or (
        db.query(McpConfig)
        .filter(McpConfig.owner_user_id == user.id)
        .order_by(McpConfig.created_at.desc())
        .first()
    )

    # endpoint 캐시 저장 (연결 즉시 갱신)
    if endpoint:
        _pending_endpoints[str(user.id)] = {"endpoint": endpoint, "token": config.mcp_token if config else ""}

    q: asyncio.Queue = asyncio.Queue()
    _sse_queues[email] = q

    async def event_stream():
        try:
            # 첫 이벤트: 연결 확인 + base_dir 전달
            # mcp_token은 포함하지 않음 — 이메일만 알면 누구나 SSE에 연결해 토큰을 획득할 수 있으므로.
            # 기존 토큰 보유 PC는 .env에서 직접 읽고, 신규 설치는 token_assigned 이벤트로 수신한다.
            initial = {
                "type": "connected",
                "mcp_config_id": str(config.id) if config else None,
                "base_dir": config.base_dir if config else None,
            }
            yield f"data: {json.dumps(initial, ensure_ascii=False)}\n\n"

            while True:
                try:
                    # 30초마다 ping (연결 유지)
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield "data: {\"type\": \"ping\"}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _sse_queues.pop(email, None)
            log.info("[SSE] Worker PC 연결 해제: %s", email)

    log.info("[SSE] Worker PC 연결: %s (endpoint=%s)", email, endpoint or "없음")
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


TOKEN_MAX_AGE_DAYS: int = int(os.getenv("MCP_TOKEN_MAX_AGE_DAYS", "90"))


@router.post("/mcp-configs/heartbeat", response_model=McpHeartbeatResponse)
def mcp_heartbeat(body: McpHeartbeatRequest, db: Session = Depends(get_db)):
    """
    MCP 서버 → 백엔드 heartbeat.
    mcp_token으로 자신의 McpConfig를 찾아 endpoint를 갱신한다.
    응답에 mcp_config_id + base_dir 포함 (MCP 서버가 BASE_DIR 동적 갱신에 사용).
    token_expired=True면 MCP 서버가 토큰을 폐기하고 SSE 재연결로 새 토큰을 받는다.
    """
    config = db.query(McpConfig).filter(McpConfig.mcp_token == body.mcp_token).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")

    now = datetime.now(timezone.utc)

    # 이슈 1: heartbeat에서도 캐시 갱신 (백엔드 재시작 후 pick-folder-detect 동작)
    if body.endpoint:
        _pending_endpoints[str(config.owner_user_id)] = {"endpoint": body.endpoint, "token": body.mcp_token}

    endpoint_changed = bool(body.endpoint and body.endpoint != config.endpoint)
    if endpoint_changed:
        log.info("[MCP HB] endpoint 갱신: %s → %s", config.endpoint, body.endpoint)
        config.endpoint = body.endpoint

    # base_dir: DB가 null이고 MCP 서버가 env 경로를 보내왔으면 업데이트
    if body.base_dir and not config.base_dir:
        log.info("[MCP HB] base_dir 최초 설정: %s", body.base_dir)
        config.base_dir = body.base_dir

    # token_issued_at 미설정 레거시 레코드 보정
    if not config.token_issued_at:
        config.token_issued_at = config.created_at or now

    config.last_heartbeat_at = now
    db.commit()
    db.refresh(config)

    # 새 팀에 McpConfigTeam 자동 생성 (팀 가입 후 MCP가 재연결 없이 heartbeat만 보내는 경우 대응)
    owner = db.query(User).filter(User.id == config.owner_user_id).first()
    if owner:
        _ensure_team_links(config, owner, db)
        db.commit()

    # 이슈 3: 신규 연결 시 WebSocket으로 실시간 알림
    if endpoint_changed:
        _notify_mcp_connected(str(config.owner_user_id), str(config.id))

    # 토큰 만료 체크
    issued = config.token_issued_at.replace(tzinfo=timezone.utc) if config.token_issued_at.tzinfo is None else config.token_issued_at
    token_age_days = (now - issued).days
    if token_age_days >= TOKEN_MAX_AGE_DAYS:
        log.info("[MCP HB] 토큰 만료 (...%s, %d일) — 재발급 신호", body.mcp_token[-6:], token_age_days)
        # 토큰 재발급: 새 토큰으로 교체
        new_token = secrets.token_hex(16)
        config.mcp_token = new_token
        config.token_issued_at = now
        db.commit()
        return McpHeartbeatResponse(
            ok=True,
            mcp_config_id=str(config.id),
            base_dir=config.base_dir,
            token_expired=True,
        )

    return McpHeartbeatResponse(
        ok=True,
        mcp_config_id=str(config.id),
        base_dir=config.base_dir,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 파일시스템 프록시 (MCP 서버 → 프론트 폴더 탐색 UI용)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/mcp-configs/{config_id}/fs/browse")
async def browse_filesystem(
    config_id: str,
    path: str = ".",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = _get_accessible_config(config_id, current_user, db)
    try:
        mcp = MCPClient(config.endpoint, token=config.mcp_token or "")
        result = await mcp.call_tool("list_directory", {"path": path})
        return {"items": result if isinstance(result, list) else [], "base_dir": config.base_dir}
    except MCPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/mcp-configs/{config_id}/fs/pick-folder")
async def pick_folder(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = _get_accessible_config(config_id, current_user, db)
    try:
        headers = {"Authorization": f"Bearer {config.mcp_token}"} if config.mcp_token else {}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{config.endpoint}/pick-folder", headers=headers)
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))



@router.get("/mcp-configs/pick-folder-detect")
async def pick_folder_detect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    config 없이도 폴더 선택 다이얼로그 호출.
    _pending_endpoints 캐시(auto-register에서 저장) 또는
    사용자 소유 config 중 endpoint 있는 것 사용.
    """
    # 1) pending 캐시 우선 (endpoint + token 함께 저장)
    _pending = _pending_endpoints.get(str(current_user.id))
    endpoint = ""
    token = ""
    if isinstance(_pending, dict):
        endpoint = _pending.get("endpoint", "")
        token = _pending.get("token", "")
    elif isinstance(_pending, str):  # 하위 호환
        endpoint = _pending

    # 2) DB에서 endpoint 있는 config 탐색
    if not endpoint:
        config = db.query(McpConfig).filter(
            McpConfig.owner_user_id == current_user.id,
            McpConfig.endpoint != "",
        ).first()
        if config:
            endpoint = config.endpoint
            token = config.mcp_token or ""

    if not endpoint:
        raise HTTPException(status_code=404, detail="연결된 MCP 서버가 없습니다. start.bat을 먼저 실행해주세요.")

    # DB에 config 있으면 토큰 우선 사용 (pending 캐시보다 정확)
    if not token:
        config_row = db.query(McpConfig).filter(
            McpConfig.owner_user_id == current_user.id,
            McpConfig.endpoint == endpoint,
        ).first()
        if config_row:
            token = config_row.mcp_token or ""

    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{endpoint}/pick-folder", headers=headers)
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def _ensure_team_links(config: McpConfig, current_user: User, db: Session) -> None:
    """
    이 config에 대해 사용자가 속한 모든 팀의 McpConfigTeam이 없으면 자동 생성.
    auto-register 시 팀 연결이 누락된 경우를 복구한다.
    """
    team_ids = [
        row.team_id
        for row in db.query(TeamMember.team_id)
        .filter(TeamMember.user_id == current_user.id)
        .all()
    ]
    for team_id in team_ids:
        exists = db.query(McpConfigTeam).filter(
            McpConfigTeam.mcp_config_id == config.id,
            McpConfigTeam.team_id == team_id,
        ).first()
        if not exists:
            log.info("[auto-register] McpConfigTeam 생성: config=%s team=%s", config.id, team_id)
            db.add(McpConfigTeam(mcp_config_id=config.id, team_id=team_id, is_public=True))


def _notify_mcp_connected(user_id: str, config_id: str) -> None:
    """MCP 연결 이벤트를 Redis pub/sub으로 알림 (WebSocket 실시간 전파용)."""
    try:
        from app.core.redis_client import publish
        publish(
            f"syncai:mcp:{user_id}",
            json.dumps({"type": "mcp_connected", "config_id": config_id}),
        )
    except Exception as e:
        log.warning("[MCP HB] Redis publish 실패: %s", e)


def _get_accessible_config(config_id: str, current_user: User, db: Session) -> McpConfig:
    """현재 사용자가 접근 가능한 McpConfig 반환 (소유자 또는 팀 내 public)."""
    config = db.query(McpConfig).filter(McpConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="MCP Config not found")
    # 소유자거나 팀 내 공개 MCP면 허용
    if config.owner_user_id == current_user.id:
        return config
    public_link = db.query(McpConfigTeam).filter(
        McpConfigTeam.mcp_config_id == config_id,
        McpConfigTeam.is_public.is_(True),
    ).first()
    if public_link:
        return config
    raise HTTPException(status_code=403, detail="Access denied")
