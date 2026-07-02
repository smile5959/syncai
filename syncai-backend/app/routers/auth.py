import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.core.limiter import limiter
from app.database import get_db
from app.schemas.auth import (
    SignupRequest, LoginRequest, RefreshRequest,
    LoginResponse, CookieSignupResponse,
    # 하위 호환 (MCP 서버 등 Bearer 클라이언트용)
    TokenResponse,
)
from app.models.user import User
from app.models.team import Team, TeamMember
from app.core.auth import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])

# 쿠키 공통 설정
_SECURE = settings.APP_ENV == "production"
_SAMESITE = "none" if settings.APP_ENV == "production" else "lax"
ACCESS_MAX_AGE  = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
REFRESH_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_SECURE,
        samesite=_SAMESITE,
        max_age=ACCESS_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_SECURE,
        samesite=_SAMESITE,
        max_age=REFRESH_MAX_AGE,
        path="/",  # /v1/auth/refresh 로 좁히면 좋지만 프록시 경로 차이로 Lax
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/", secure=_SECURE, samesite=_SAMESITE)
    response.delete_cookie("refresh_token", path="/", secure=_SECURE, samesite=_SAMESITE)


def _get_user_teams(user_id, db: Session) -> list:
    owned = db.query(Team).filter(Team.owner_id == user_id).all()
    member_ids = [r[0] for r in db.query(TeamMember.team_id).filter(TeamMember.user_id == user_id).all()]
    member_teams = db.query(Team).filter(Team.id.in_(member_ids)).all() if member_ids else []
    return list({str(t.id): t for t in owned + member_teams}.values())


@router.post("/signup", response_model=CookieSignupResponse, status_code=201)
@limiter.limit("5/minute")
def signup(request: Request, body: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=body.email, name=body.name, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    _set_auth_cookies(response, access_token, refresh_token)
    teams = _get_user_teams(user.id, db)
    return {"user": user, "token": access_token, "refresh_token": refresh_token, "teams": teams}


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    _set_auth_cookies(response, access_token, refresh_token)
    teams = _get_user_teams(user.id, db)
    return {"user": user, "token": access_token, "refresh_token": refresh_token, "teams": teams}


@router.post("/logout")
def logout(response: Response):
    _clear_auth_cookies(response)
    return {"ok": True}


@router.post("/refresh", response_model=LoginResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db),
            body: RefreshRequest | None = None):
    """
    쿠키의 refresh_token 우선 사용. 없으면 body의 refresh_token 사용 (하위 호환).
    사용된 refresh token은 Redis 블랙리스트에 등록해 재사용을 차단한다 (토큰 로테이션).
    """
    token = request.cookies.get("refresh_token")
    if not token and body:
        token = body.refresh_token
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # jti 블랙리스트 체크 — 이미 사용된 토큰은 거부
    jti = payload.get("jti")
    if jti:
        try:
            from app.core.redis_client import get_sync_redis
            r = get_sync_redis()
            if r.exists(f"rt_blacklist:{jti}"):
                raise HTTPException(status_code=401, detail="Refresh token already used")
        except HTTPException:
            raise
        except Exception:
            pass  # Redis 장애 시 검증 스킵 (가용성 우선)

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    try:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    _set_auth_cookies(response, access_token, refresh_token)

    # 사용된 jti를 블랙리스트에 등록 (남은 만료 시간 동안 유효)
    if jti:
        try:
            from app.core.redis_client import get_sync_redis
            import time as _time
            exp = payload.get("exp", 0)
            remaining = max(int(exp - _time.time()), 1)
            get_sync_redis().setex(f"rt_blacklist:{jti}", remaining, "1")
        except Exception:
            pass

    return {"user": user, "token": access_token, "refresh_token": refresh_token}
