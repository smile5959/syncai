import logging
import redis as sync_redis
from app.config import settings

log = logging.getLogger(__name__)

_pool: sync_redis.Redis | None = None


def get_sync_redis() -> sync_redis.Redis:
    global _pool
    if _pool is None:
        _pool = sync_redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            health_check_interval=30,
            socket_keepalive=True,
        )
    return _pool


def publish(channel: str, message: str) -> None:
    global _pool
    try:
        get_sync_redis().publish(channel, message)
    except Exception as e:
        log.warning("[redis] publish 실패: %s", e)
        _pool = None  # 다음 호출에서 재연결
        raise
