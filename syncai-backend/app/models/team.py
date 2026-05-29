import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class PlanType(str, enum.Enum):
    free = "free"
    pro = "pro"
    biz = "biz"


class RoleType(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    member = "member"


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    plan: Mapped[PlanType] = mapped_column(Enum(PlanType), default=PlanType.free)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    members = relationship("TeamMember", back_populates="team")
    workers = relationship("Worker", back_populates="team")
    chat_rooms = relationship("ChatRoom", back_populates="team")


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[RoleType] = mapped_column(Enum(RoleType), default=RoleType.member)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    team = relationship("Team", back_populates="members")
    user = relationship("User", back_populates="team_memberships")
