"""
채팅방 비즈니스 로직 (향후 복잡한 로직은 여기로 이동)
"""
import uuid
from sqlalchemy.orm import Session
from app.models.chat_room import ChatRoom
from app.models.message import Message


def get_recent_messages(
    db: Session,
    room_id: str,
    limit: int = 20,
    exclude_id: str | None = None,
) -> list[Message]:
    """슬라이딩 윈도우 — /ai 커맨드 시 컨텍스트로 넘길 최근 N개 메시지
    chat / ai_cmd / ai_res 전부 포함. exclude_id는 현재 명령 중복 방지용."""
    query = db.query(Message).filter(Message.room_id == uuid.UUID(room_id))
    if exclude_id:
        query = query.filter(Message.id != uuid.UUID(exclude_id))
    return query.order_by(Message.created_at.desc()).limit(limit).all()
