import re
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user, require_team_member, require_room_access
from app.models.user import User
from app.models.chat_room import ChatRoom, RoomMember
from app.models.message import Message
from app.models.task import Task
from app.models.file_lock import FileLock
from app.schemas.room import RoomCreate, RoomOut, RoomUpdate, RoomMemberOut

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


@router.get("/rooms/{room_id}", response_model=RoomOut)
def get_room(room_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_room_access(room_id, current_user, db)
    room = _get_room(room_id, db)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


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
