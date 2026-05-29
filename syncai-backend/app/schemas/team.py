from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
import uuid


class TeamCreate(BaseModel):
    name: str
    color: str | None = None
    icon: str | None = None


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    plan: str
    owner_id: uuid.UUID
    color: str | None = None
    icon: str | None = None
    created_at: datetime


class TeamUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = "member"


class UserBasic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    role: str
    joined_at: datetime
    user: UserBasic | None = None


class MemberRoleUpdate(BaseModel):
    role: str
