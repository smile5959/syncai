import uuid
from datetime import datetime, timezone, timedelta
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.auth import decode_token
from app.models.user import User

# 플랜별 월간 AI 호출 한도 (-1 = 무제한)
PLAN_LIMITS: dict[str, int] = {
    "free": 30,
    "starter": 200,
    "pro": -1,
}


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    쿠키(access_token) 우선 → Authorization: Bearer 헤더 fallback.
    MCP 서버 등 Bearer 클라이언트와 하위 호환 유지.
    """
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token)
    user_id = payload.get("sub") if payload else None
    if not user_id or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def _parse_uuid(value: str, field_name: str = "id") -> uuid.UUID:
    """문자열 → UUID 변환. 잘못된 형식이면 400."""
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name} format",
        )


def require_team_member(team_id: str, current_user: User, db: Session) -> None:
    """
    현재 사용자가 해당 팀의 멤버인지 확인. 아니면 403.
    team_members 레코드 우선 확인, 없으면 owner 여부 fallback 확인.
    """
    from app.models.team import Team, TeamMember
    team_uuid = _parse_uuid(team_id, "team_id")

    member = db.query(TeamMember).filter(
        TeamMember.team_id == team_uuid,
        TeamMember.user_id == current_user.id,
    ).first()
    if member:
        return

    # Fallback: team_members 레코드 없이 owner만 존재하는 레거시 데이터 대비
    team = db.query(Team).filter(
        Team.id == team_uuid,
        Team.owner_id == current_user.id,
    ).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a team member")


def require_team_owner(team_id: str, current_user: User, db: Session) -> None:
    """현재 사용자가 해당 팀의 owner인지 확인. 아니면 403."""
    from app.models.team import Team
    team_uuid = _parse_uuid(team_id, "team_id")
    team = db.query(Team).filter(Team.id == team_uuid).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if team.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team owner can perform this action")


def require_room_access(room_id: str, current_user: User, db: Session):
    """
    현재 사용자가 해당 룸에 접근 권한이 있는지 확인.
    룸 멤버이거나, 해당 룸이 속한 팀의 멤버이면 허용.
    UUID 또는 slug 모두 허용. room 객체를 반환.
    """
    from app.models.chat_room import ChatRoom, RoomMember
    from app.models.team import TeamMember

    # UUID 또는 slug로 방 조회
    try:
        room = db.query(ChatRoom).filter(ChatRoom.id == uuid.UUID(room_id)).first()
    except (ValueError, AttributeError):
        room = db.query(ChatRoom).filter(ChatRoom.slug == room_id).first()

    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    # 룸 직접 멤버이거나, 팀 멤버이면 허용
    is_room_member = db.query(RoomMember).filter(
        RoomMember.room_id == room.id,
        RoomMember.user_id == current_user.id,
    ).first()
    is_team_member = db.query(TeamMember).filter(
        TeamMember.team_id == room.team_id,
        TeamMember.user_id == current_user.id,
    ).first()

    if not is_room_member and not is_team_member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this room")

    return room


def require_ai_quota(current_user: User, db: Session) -> None:
    """
    AI 호출 전 월간 할당량을 확인하고 사용량을 1 증가.
    30일이 지나면 카운터를 리셋한다.
    """
    now = datetime.now(timezone.utc)
    reset_at = current_user.ai_calls_reset_at

    if reset_at is None or (now - reset_at.replace(tzinfo=timezone.utc) if reset_at.tzinfo is None else now - reset_at) > timedelta(days=30):
        current_user.ai_calls_month = 0
        current_user.ai_calls_reset_at = now
        db.commit()

    plan = current_user.plan or "free"
    limit = PLAN_LIMITS.get(plan, 30)

    if limit != -1 and current_user.ai_calls_month >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"월간 AI 사용 한도({limit}회)에 도달했습니다. 플랜을 업그레이드해주세요.",
        )

    current_user.ai_calls_month += 1
    db.commit()


def decrement_ai_quota(user_id: uuid.UUID | str, db: Session) -> None:
    """AI 호출 실패 시 카운터 1 차감 (실패한 호출은 소비 안 함)."""
    try:
        uid = uuid.UUID(str(user_id))
        user = db.query(User).filter(User.id == uid).first()
        if user and user.ai_calls_month > 0:
            user.ai_calls_month -= 1
            db.commit()
    except Exception:
        pass
