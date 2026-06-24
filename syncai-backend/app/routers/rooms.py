import re
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.core.deps import get_current_user, require_team_member, require_room_access
from app.models.user import User
from app.models.chat_room import ChatRoom, RoomMember
from app.models.message import Message
from app.models.task import Task
from app.models.file_lock import FileLock
from app.models.worker import Worker
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from sqlalchemy import or_
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate, RoomMemberOut, RoomInitResponse
from app.schemas.message import MessageOut
from app.schemas.task import TaskOut
from app.schemas.worker import WorkerOut
from app.schemas.mcp_config import McpConfigWithTeam

router = APIRouter(tags=["Rooms"])


def _make_base_slug(name: str) -> str:
    slug = re.sub(r'\s+', '-', name.strip())
    slug = re.sub(r'[^\w가-힣ㄱ-ㅎㅏ-ㅣ-]', '', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug or 'room'


def _generate_slug(name: str, db: Session) -> str:
    base = _make_base_slug(name)
    slug = base
    counter = 2
    while db.query(ChatRoom).filter(ChatRoom.slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _get_room(room_id: str, db: Session) -> ChatRoom | None:
    """UUID 또는 slug로 방 조회."""
    try:
        return db.query(ChatRoom).filter(ChatRoom.id == uuid.UUID(room_id)).first()
    except (ValueError, AttributeError):
        return db.query(ChatRoom).filter(ChatRoom.slug == room_id).first()


@router.post("/teams/{team_id}/rooms", response_model=RoomOut, status_code=201)
def create_room(team_id: str, body: RoomCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_team_member(team_id, current_user, db)
    room = ChatRoom(team_id=team_id, name=body.name, slug=_generate_slug(body.name, db))
    db.add(room)
    db.flush()
    db.add(RoomMember(room_id=room.id, user_id=current_user.id))
    db.commit()
    db.refresh(room)
    return room


@router.get("/teams/{team_id}/rooms", response_model=list[RoomOut])
def list_rooms(team_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_team_member(team_id, current_user, db)
    return db.query(ChatRoom).filter(ChatRoom.team_id == team_id).all()


from pydantic import BaseModel as _BaseModel

class TeamInitResponse(_BaseModel):
    """팀 진입 시 필요한 데이터(rooms + workers + mcp_configs)를 한 번에 반환."""
    rooms: list[RoomOut]
    workers: list[WorkerOut]
    mcp_configs: list[McpConfigWithTeam]


@router.get("/teams/{team_id}/init", response_model=TeamInitResponse)
def team_init(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """팀 전환/초기 진입 시 rooms + workers + mcp_configs를 한 번에 반환."""
    require_team_member(team_id, current_user, db)

    rooms = db.query(ChatRoom).filter(ChatRoom.team_id == team_id).all()
    workers = db.query(Worker).filter(Worker.team_id == team_id).all()

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
    from app.core import mcp_broker
    mcp_configs = [
        McpConfigWithTeam(
            id=c.id,
            owner_user_id=c.owner_user_id,
            name=c.name,
            endpoint=c.endpoint,
            base_dir=c.base_dir,
            mcp_token=c.mcp_token,
            created_at=c.created_at,
            is_public=link.is_public,
            is_online=bool(c.mcp_token and mcp_broker.is_online(c.mcp_token)),
        )
        for c, link in rows
    ]

    return TeamInitResponse(
        rooms=[RoomOut.model_validate(r) for r in rooms],
        workers=[WorkerOut.model_validate(w) for w in workers],
        mcp_configs=mcp_configs,
    )


@router.get("/rooms/{room_id}", response_model=RoomOut)
def get_room(room_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = require_room_access(room_id, current_user, db)
    return room


@router.get("/rooms/{room_id}/init", response_model=RoomInitResponse)
def room_init(
    room_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """채팅방 진입에 필요한 데이터(room + messages + tasks)를 한 번에 반환."""
    room = require_room_access(room_id, current_user, db)

    # Messages (joinedload user — N+1 방지)
    msgs_q = (
        db.query(Message)
        .options(joinedload(Message.user))
        .filter(Message.room_id == room.id)
        .order_by(Message.created_at.desc())
    )
    raw_msgs = msgs_q.limit(limit + 1).all()
    next_cursor = str(raw_msgs[-1].id) if len(raw_msgs) > limit else None
    messages = [MessageOut.model_validate(m) for m in raw_msgs[:limit]]

    # Tasks
    raw_tasks = (
        db.query(Task)
        .filter(Task.room_id == room.id)
        .order_by(Task.created_at.desc())
        .all()
    )
    # command 컬럼 bulk fetch — N+1 방지
    msg_ids = [t.message_id for t in raw_tasks if t.message_id]
    msg_map: dict = {}
    if msg_ids:
        rows = db.query(Message.id, Message.content).filter(Message.id.in_(msg_ids)).all()
        msg_map = {str(r.id): r.content for r in rows}
    tasks_out = []
    for t in raw_tasks:
        out = TaskOut.model_validate(t)
        if t.message_id:
            out.command = msg_map.get(str(t.message_id))
        tasks_out.append(out)

    return RoomInitResponse(
        room=RoomOut.model_validate(room),
        messages=messages,
        next_cursor=next_cursor,
        tasks=tasks_out,
    )


@router.patch("/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: str, body: RoomUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if body.name is not None:
        room.name = body.name
    db.commit()
    db.refresh(room)
    return room


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    task_ids = [t.id for t in db.query(Task.id).filter(Task.room_id == room_id).all()]
    if task_ids:
        db.query(FileLock).filter(FileLock.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(Task).filter(Task.room_id == room_id).delete(synchronize_session=False)
    db.query(Message).filter(Message.room_id == room_id).delete(synchronize_session=False)
    db.query(RoomMember).filter(RoomMember.room_id == room_id).delete(synchronize_session=False)
    db.delete(room)
    db.commit()


@router.get("/rooms/{room_id}/members", response_model=list[RoomMemberOut])
def get_room_members(room_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    return db.query(RoomMember).filter(RoomMember.room_id == room.id).all()


@router.post("/rooms/{room_id}/members", response_model=RoomMemberOut, status_code=201)
def add_room_member(room_id: str, user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    member = RoomMember(room_id=room.id, user_id=user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/rooms/{room_id}/members/{user_id}", status_code=204)
def remove_room_member(room_id: str, user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    member = db.query(RoomMember).filter(RoomMember.room_id == room.id, RoomMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
