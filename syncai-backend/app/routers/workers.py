from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user, require_team_member
from app.models.user import User
from app.models.worker import Worker
from app.schemas.worker import WorkerCreate, WorkerOut, WorkerModelUpdate

router = APIRouter(tags=["Workers"])


@router.post("/teams/{team_id}/workers", response_model=WorkerOut, status_code=201)
def create_worker_slot(
    team_id: str,
    body: WorkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """팀에 AI Worker 슬롯 추가 (팀 플랜 기반으로 개수 제한)."""
    require_team_member(team_id, current_user, db)
    worker = Worker(team_id=team_id, name=body.name)
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@router.get("/teams/{team_id}/workers", response_model=list[WorkerOut])
def list_worker_slots(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """팀의 Worker 슬롯 목록 (idle/busy 현황)."""
    require_team_member(team_id, current_user, db)
    return db.query(Worker).filter(Worker.team_id == team_id).all()


@router.delete("/teams/{team_id}/workers/{worker_id}", status_code=204)
def delete_worker_slot(
    team_id: str,
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Worker 슬롯 삭제."""
    require_team_member(team_id, current_user, db)
    from app.models.file_lock import FileLock
    from app.models.task import Task

    worker = db.query(Worker).filter(Worker.id == worker_id, Worker.team_id == team_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # file_locks → tasks 순서로 삭제
    task_ids = [t.id for t in db.query(Task.id).filter(Task.worker_id == worker_id).all()]
    if task_ids:
        db.query(FileLock).filter(FileLock.task_id.in_(task_ids)).delete(synchronize_session=False)
    db.query(FileLock).filter(FileLock.worker_id == worker_id).delete(synchronize_session=False)
    db.query(Task).filter(Task.worker_id == worker_id).delete(synchronize_session=False)
    db.delete(worker)
    db.commit()


@router.patch("/teams/{team_id}/workers/{worker_id}/model", response_model=WorkerOut)
def update_worker_model(
    team_id: str,
    worker_id: str,
    body: WorkerModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Worker 슬롯의 AI 모델 변경."""
    require_team_member(team_id, current_user, db)
    worker = db.query(Worker).filter(Worker.id == worker_id, Worker.team_id == team_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.model = body.model
    db.commit()
    db.refresh(worker)
    return worker
