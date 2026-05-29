"""
ARQ Worker 진입점
실행: python run_worker.py
현재 역할: heartbeat 크론잡 (Workers는 AI 슬롯으로 재정의됨 — 별도 heartbeat 불필요)
AI 태스크는 FastAPI 인-프로세스로 처리 (messages.py::_run_ai_task)
"""
from arq.connections import RedisSettings
from app.config import settings


class WorkerSettings:
    functions = []
    cron_jobs = []
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
