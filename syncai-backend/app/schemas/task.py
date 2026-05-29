from pydantic import BaseModel, ConfigDict, computed_field
from datetime import datetime
from typing import Any
import uuid


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    worker_id: uuid.UUID | None
    status: str
    result_diff: str | None
    error: str | None = None
    # backup_snapshot 원본은 직접 노출하지 않고, 존재 여부만 프론트에 전달
    # (파일 원본 내용이 대용량일 수 있으며, 프론트에 불필요한 데이터 노출 최소화)
    backup_snapshot: Any = None
    created_at: datetime
    completed_at: datetime | None
    command: str | None = None  # 트리거한 ai_cmd 메시지 내용

    @computed_field  # type: ignore[misc]
    @property
    def has_snapshot(self) -> bool:
        """되돌리기 버튼 활성화 여부 (snapshot 존재 + completed 상태)"""
        return bool(self.backup_snapshot) and self.status == "completed"


class TasksResponse(BaseModel):
    tasks: list[TaskOut]


class RevertResponse(BaseModel):
    ok: bool
    reverted_at: datetime
