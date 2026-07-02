import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # 구독 플랜: free / starter / pro
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free", server_default="free")
    # 이번 달 AI 호출 횟수 + 마지막 리셋 시각
    ai_calls_month: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ai_calls_reset_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    team_memberships = relationship("TeamMember", back_populates="user")
    room_memberships = relationship("RoomMember", back_populates="user")
    messages = relationship("Message", back_populates="user")
    mcp_configs = relationship("McpConfig", back_populates="owner")
