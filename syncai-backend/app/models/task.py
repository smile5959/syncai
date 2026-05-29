import uuid
from datetime import datetime, timezone
from sqlalchemy import Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum


class TaskStatusType(str, enum.Enum):
    pending = "pending"
    awaiting_confirm = "awaiting_confirm"  # AI 계획 제안 후 사용자 동의 대기
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"  # 사용자가 동의 거부
    reverted = "reverted"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_rooms.id"), nullable=False)
    worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workers.id"), nullable=True)
    message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[TaskStatusType] = mapped_column(Enum(TaskStatusType), default=TaskStatusType.pending)
    result_diff: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # revert용 파일 원본 스냅샷: {경로: 원본내용(str) | null(신규파일)}
    backup_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 이 task를 실행한 MCP Config ID (revert 시 동일 MCP로 파일 복원)
    # MCP Config 삭제 시 SET NULL (task 히스토리 보존, revert만 불가)
    mcp_config_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("mcp_configs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # relationships
    room = relationship("ChatRoom", back_populates="tasks")
    worker = relationship("Worker", back_populates="tasks")
    file_locks = relationship("FileLock", back_populates="task")
