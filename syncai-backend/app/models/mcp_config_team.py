import uuid
from sqlalchemy import ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class McpConfigTeam(Base):
    __tablename__ = "mcp_config_teams"

    mcp_config_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("mcp_configs.id"), primary_key=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), primary_key=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # relationships
    mcp_config = relationship("McpConfig", back_populates="team_links")
    team = relationship("Team")
