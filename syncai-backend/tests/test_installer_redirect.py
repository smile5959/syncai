# 인스톨러 redirect 검증 — MCP 토큰이 붙어 나가는 주소라 localhost 밖으로 새면 안 된다
# 실행: pytest tests/test_installer_redirect.py -v -p no:cacheprovider
import pytest

from app.routers.installer import _is_allowed_redirect


@pytest.mark.parametrize("url", [
    "http://localhost:5555/callback",
    "http://127.0.0.1:61234/cb?x=1",
    "syncai://auth",
])
def test_allowed(url):
    assert _is_allowed_redirect(url)


@pytest.mark.parametrize("url", [
    # 접두사는 "http://localhost:"지만 실제 호스트는 evil.example (userinfo 우회)
    "http://localhost:@evil.example/cb",
    "http://127.0.0.1:x@evil.example/",
    "http://localhost:5555@evil.example/",
    "http://localhost:5555\\@evil.example/",
    "https://evil.example/",
    "http://localhost.evil.example:5555/",
    "http://localhost/cb",          # 포트 없음 — 인스톨러 로컬 서버는 항상 포트가 있다
    "http://localhost:99999/",      # 잘못된 포트
    "javascript:alert(1)",
    "",
])
def test_rejected(url):
    assert not _is_allowed_redirect(url)
