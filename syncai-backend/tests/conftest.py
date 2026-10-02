# pytest 설정
# 실행: pytest tests/ -v -p no:cacheprovider
# 환경변수는 .env.test 또는 직접 설정 필요
import pytest

from app.core.limiter import limiter


@pytest.fixture(autouse=True)
def _disable_rate_limit():
    """signup 5/min 등 slowapi 제한 해제 — 테스트가 같은 IP로 연달아 호출해 429가 난다."""
    limiter.enabled = False
    yield
    limiter.enabled = True
