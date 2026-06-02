from pydantic import BaseModel, ConfigDict
from datetime import datetime
import uuid
from app.models.worker import WorkerStatus


class WorkerCreate(BaseModel):
    name: str


class WorkerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
    status: WorkerStatus
    current_task_id: uuid.UUID | None = None
    model: str = "google/gemini-2.5-flash:free"
    created_at: datetime


class WorkerModelUpdate(BaseModel):
    model: str
