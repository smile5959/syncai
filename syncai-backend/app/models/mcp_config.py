import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class McpConfig(Base):
    __tablename__ = "mcp_configs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    endpoint: Mapped[str | None] = mapped_column(String(500), nullable=True, default="")  # deprecated: WS 전환 후 불필요
    base_dir: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    mcp_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    auto_approve: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    owner = relationship("User", back_populates="mcp_configs")
    team_links = relationship("McpConfigTeam", back_populates="mcp_config", cascade="all, delete-orphan")
