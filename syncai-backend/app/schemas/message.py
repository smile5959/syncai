from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
import uuid


class MessageCreate(BaseModel):
    content: str = Field(max_length=10000)


class AiCommandRequest(BaseModel):
    content: str
    message_id: uuid.UUID | None = None


class UserInMessage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    user_id: uuid.UUID | None
    content: str
    type: str
    created_at: datetime
    user: UserInMessage | None = None


class MessagesResponse(BaseModel):
    messages: list[MessageOut]
    next_cursor: str | None


class AiCommandResponse(BaseModel):
    task_id: uuid.UUID


class AiConfirmRequest(BaseModel):
    task_id: uuid.UUID
    confirmed: bool  # True: 동의 → 실행, False: 거부 → cancelled
    composio_app: str | None = None  # Composio 앱 태스크인 경우 앱 이름
