import asyncio
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routers import auth, teams, workers, rooms, messages, tasks, ws, users, invitations, mcp_configs, installer
from app.config import settings

app = FastAPI(title="SyncAI API", version="0.1.0")

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ws.redis_subscriber())

# CORS — 허용 출처는 환경변수 CORS_ORIGINS 로 관리
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
