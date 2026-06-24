import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.database import get_db
from app.core.deps import get_current_user, require_room_access, _parse_uuid
from app.models.user import User
from app.models.task import Task
from app.models.message import Message
from app.schemas.task import TaskOut, TasksResponse, RevertResponse

router = APIRouter(tags=["Tasks"])


@router.get("/rooms/{room_id}/tasks", response_model=TasksResponse)
def list_tasks(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = require_room_access(room_id, current_user, db)
    tasks = db.query(Task).filter(Task.room_id == room.id).order_by(Task.created_at.desc()).all()

    msg_ids = [t.message_id for t in tasks if t.message_id]
    msg_map: dict = {}
    if msg_ids:
        rows = db.query(Message.id, Message.content).filter(Message.id.in_(msg_ids)).all()
        msg_map = {str(r.id): r.content for r in rows}

    result = []
    for task in tasks:
        out = TaskOut.model_validate(task)
        if task.message_id:
            out.command = msg_map.get(str(task.message_id))
        result.append(out)
    return {"tasks": result}


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task_uuid = _parse_uuid(task_id, "task_id")
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    require_room_access(str(task.room_id), current_user, db)
    return task


@router.post("/tasks/{task_id}/revert", response_model=RevertResponse)
async def revert_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI 작업 결과를 원래 파일 상태로 복원한다.

    보안:
    - 해당 task room에 대한 접근 권한 검증
    - SELECT FOR UPDATE로 동시 revert 경쟁 조건 방지
    - 상태를 reverted로 선점한 후 MCP 호출 -> 이중 revert 원천 차단

    부분 실패:
    - 파일별로 MCP write_file/delete_file 호출, 실패한 파일 목록 수집
    - 일부 실패 시 task.error에 기록 후 500 반환 (성공한 파일은 이미 복원됨)
    """
    from app.models.mcp_config import McpConfig
    from app.agents.mcp_client import MCPClient, MCPError

    task_uuid = _parse_uuid(task_id, "task_id")

    # 1. 존재 확인 + 인가
    task = db.query(Task).filter(Task.id == task_uuid).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    require_room_access(str(task.room_id), current_user, db)

    # 2. 상태 선검증 (빠른 실패)
    if task.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Only completed tasks can be reverted (current: {task.status})",
        )
    if not task.backup_snapshot:
        raise HTTPException(
            status_code=422,
            detail="No backup snapshot available for this task",
        )
    if not task.mcp_config_id:
        raise HTTPException(
            status_code=422,
            detail="MCP configuration reference not found for this task",
        )

    # 3. MCP Config 유효성 확인
    mcp_config = db.query(McpConfig).filter(McpConfig.id == task.mcp_config_id).first()
    if not mcp_config:
        raise HTTPException(
            status_code=422,
            detail="The MCP configuration used for this task no longer exists",
        )

    # 4. 원자적 상태 선점 (SELECT FOR UPDATE)
    # row-level lock 획득 후 재검증 -> 동시 요청이 들어와도 한 번만 revert
    task = db.query(Task).with_for_update().filter(Task.id == task_uuid).first()
    if task.status != "completed":
        raise HTTPException(
            status_code=409,
            detail="Task status changed concurrently",
        )

    task.status = "reverted"
    now = datetime.now(timezone.utc)
    task.completed_at = now
    db.commit()

    # 5. MCP를 통한 파일 복원
    mcp_client = MCPClient(mcp_config.endpoint, token=mcp_config.mcp_token or "")
    failed_files: list = []

    for path, original_content in task.backup_snapshot.items():
        try:
            if original_content is None:
                # AI가 새로 생성한 파일 -> 삭제하여 원상복구
                await mcp_client.call_tool("delete_file", {"path": path})
            else:
                # 기존 파일 수정 or 삭제된 파일 -> 원본 내용으로 복원
                await mcp_client.call_tool("write_file", {"path": path, "content": original_content})
        except MCPError as e:
            print(f"[revert] 파일 복원 실패: {path} - {e}")
            failed_files.append(path)

    # 6. 부분 실패 처리
    if failed_files:
        task.error = "Partial revert: failed to restore " + ", ".join(failed_files)
        db.commit()
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Partial revert - some files could not be restored",
                "failed_files": failed_files,
            },
        )

    return {"ok": True, "reverted_at": now}
