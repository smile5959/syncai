"""
태스크 서비스 유틸리티
- AI 태스크 실행은 messages.py::_run_ai_task (인-프로세스 asyncio)로 처리됨
- 이 파일은 Redis pub/sub 유틸만 보관 (필요 시 활용)
"""
import json
import redis.asyncio as aioredis
from app.config import settings


async def redis_publish(channel: str, data: dict):
    """Redis pub/sub 채널에 이벤트 발행 (멀티 프로세스 환경에서 WS 브로드캐스트용)."""
    r = aioredis.from_url(settings.REDIS_URL)
    await r.publish(channel, json.dumps(data))
    await r.aclose()
