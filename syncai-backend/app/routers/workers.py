import json
import asyncio
import uuid as _uuid_mod
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import redis.asyncio as aioredis
from app.database import get_db, SessionLocal
from app.core.deps import get_current_user, require_team_member
from app.core.auth import decode_token
from app.config import settings
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


async def _worker_sse_generator(team_id: str, initial_json: str, request: Request):
    """초기 스냅샷 전송 후 Redis 채널 구독으로 실시간 업데이트 스트림."""
    yield f"event: init\ndata: {initial_json}\n\n"

    r = aioredis.from_url(settings.REDIS_URL, health_check_interval=30, socket_keepalive=True)
    pubsub = r.pubsub()
    channel = f"syncai:workers:{team_id}"
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if await request.is_disconnected():
                break
            if message["type"] == "message":
                raw = message["data"]
                if isinstance(raw, bytes):
                    raw = raw.decode()
                yield f"event: update\ndata: {raw}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await r.aclose()
        except Exception:
            pass


@router.get("/teams/{team_id}/workers/stream")
async def worker_events_stream(
    team_id: str,
    request: Request,
    token: str | None = Query(default=None),
):
    """Worker 상태 실시간 SSE (쿠키 → Bearer → ?token= 순서로 인증)."""
    # 인증: 쿠키 → Bearer 헤더 → ?token= 파라미터
    raw_token = request.cookies.get("access_token")
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]
    if not raw_token and token:
        raw_token = token

    if not raw_token:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(raw_token)
    user_id = payload.get("sub") if payload else None
    if not user_id or payload.get("type") != "access":
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid token")

    # DB 쿼리는 짧게 — SSE 연결 동안 DB 커넥션을 점유하지 않음
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == _uuid_mod.UUID(user_id)).first()
        if not user:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="User not found")
        require_team_member(team_id, user, db)
        workers = db.query(Worker).filter(Worker.team_id == team_id).all()
        initial_json = json.dumps(
            [WorkerOut.model_validate(w).model_dump(mode="json") for w in workers],
            default=str,
        )
    finally:
        db.close()

    return StreamingResponse(
        _worker_sse_generator(team_id, initial_json, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
