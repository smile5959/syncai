import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class FileLock(Base):
    __tablename__ = "file_locks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    locked_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    # relationships
    task = relationship("Task", back_populates="file_locks")
    worker = relationship("Worker", back_populates="file_locks")
