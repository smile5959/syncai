import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class WorkerStatus(str, enum.Enum):
    idle = "idle"
    busy = "busy"


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[WorkerStatus] = mapped_column(
        Enum(WorkerStatus), default=WorkerStatus.idle
    )
    # 현재 처리 중인 task ID (FK 없는 단순 UUID — 순환 참조 방지)
    current_task_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="google/gemini-2.5-flash:free")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    team = relationship("Team", back_populates="workers")
    tasks = relationship("Task", back_populates="worker")
    file_locks = relationship("FileLock", back_populates="worker")
