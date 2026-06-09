from pydantic import BaseModel, ConfigDict
from datetime import datetime
import uuid


class RoomCreate(BaseModel):
    name: str


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str | None
    team_id: uuid.UUID
    created_at: datetime


class RoomUpdate(BaseModel):
    name: str | None = None


class RoomMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    joined_at: datetime
