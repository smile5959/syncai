import asyncio
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter
from app.routers import auth, teams, workers, rooms, messages, tasks, ws, users, invitations, mcp_configs, installer, integrations
from app.config import settings

app = FastAPI(title="SyncAI API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    from app.database import SessionLocal
    from app.models.mcp_config import McpConfig
    from app.models.task import Task
    db = SessionLocal()
    try:
        updated = db.query(McpConfig).filter(McpConfig.is_online == True).update({"is_online": False})
        db.commit()
        print(f"[startup] is_online 리셋: {updated}개")

        # 서버 재시작 시 진행 중이던 태스크를 failed로 마킹 (영구 고착 방지)
        stuck = db.query(Task).filter(Task.status.in_(["running", "pending"])).update(
            {"status": "failed", "error": "서버 재시작으로 인해 작업이 중단되었습니다."},
            synchronize_session=False,
        )
        db.commit()
        if stuck:
            print(f"[startup] 중단된 태스크 failed 처리: {stuck}개")
    finally:
        db.close()
    asyncio.create_task(ws.redis_subscriber())

# CORS — 허용 출처는 환경변수 CORS_ORIGINS 로 관리
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# 라우터 등록
app.include_router(auth.router, prefix="/v1")
app.include_router(teams.router, prefix="/v1")
app.include_router(workers.router, prefix="/v1")
app.include_router(rooms.router, prefix="/v1")
app.include_router(messages.router, prefix="/v1")
app.include_router(tasks.router, prefix="/v1")
app.include_router(mcp_configs.router, prefix="/v1")
app.include_router(users.router)
app.include_router(ws.router)
app.include_router(invitations.router)
app.include_router(installer.router)  # /installer-auth + /v1/installer/token (no prefix — paths are explicit)
app.include_router(integrations.router, prefix="/v1")

# 공통 에러 핸들러 — 내부 예외 메시지를 외부에 노출하지 않음
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger(__name__).exception("Unhandled exception: %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "An internal server error occurred."}},
    )


@app.get("/health")
def health():
    return {"status": "ok"}
