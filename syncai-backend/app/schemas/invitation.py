from pydantic import BaseModel, ConfigDict
from datetime import datetime
import uuid


class InvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    inviter_id: uuid.UUID
    invitee_email: str
    status: str
    created_at: datetime
    team_name: str | None = None
    inviter_name: str | None = None
