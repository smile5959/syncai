import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class MessageType(str, enum.Enum):
    chat = "chat"
    ai_cmd = "ai_cmd"
    ai_res = "ai_res"
    ai_plan = "ai_plan"   # AI가 작업 계획 제안 (사용자 동의 대기 중)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_rooms.id"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[MessageType] = mapped_column(Enum(MessageType), default=MessageType.chat)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    room = relationship("ChatRoom", back_populates="messages")
    user = relationship("User", back_populates="messages")
