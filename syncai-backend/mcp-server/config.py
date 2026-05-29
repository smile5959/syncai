"""
MCP 서버 설정 — 멀티 토큰 지원
====================================
여러 MCP Config(토큰 + base_dir)를 동시에 관리한다.

레지스트리 우선순위:
  1. token_registry.json  — 이전에 등록한 토큰 영구 저장
  2. .env MCP_AUTH_TOKEN + MCP_BASE_DIR — 하위 호환 (항상 로드)

외부에서 사용하는 API:
  register_token(token, base_dir, *, persist)  — 토큰 추가/갱신
  get_base_dir(token)                          — 토큰→base_dir 조회
  has_token(token)                             — 토큰 등록 여부 확인
  update_base_dir(token, new_base_dir)         — heartbeat 응답으로 갱신
  remove_token(token)                          — 토큰 제거
  all_tokens()                                 — 등록된 토큰 목록
"""
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# PyInstaller 번들 실행 시: sys.executable = dist/server/server.exe → 설치 디렉토리
# 일반 Python 실행 시: __file__ 기준 디렉토리 (mcp-server/)
# .env / token_registry.json / cloudflared.exe 등 모두 이 경로 기준으로 탐색.
if getattr(sys, "frozen", False):
    _APP_DIR = Path(sys.executable).parent
else:
    _APP_DIR = Path(__file__).parent

# .env 로드 (설치 디렉토리 기준)
load_dotenv(_APP_DIR / ".env")

log = logging.getLogger("config")

# ─── 서버 공통 설정 ──────────────────────────────────────────────────────────

PORT: int = int(os.getenv("MCP_PORT", "7860"))

# Cloudflare Tunnel 공개 URL
# - tunnel.py가 cloudflared에서 자동 감지하면 여기에 저장됨
# - MCP_TUNNEL_URL 환경변수로 수동 지정 시 자동 감지 생략
TUNNEL_URL: str = os.getenv("MCP_TUNNEL_URL", "")

MAX_FILE_SIZE: int = int(os.getenv("MCP_MAX_FILE_SIZE", str(5 * 1024 * 1024)))

BLOCKED_PATTERNS: list[str] = [
    ".git",
    ".env",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
]

# ─── 토큰 레지스트리 ─────────────────────────────────────────────────────────

_REGISTRY: dict[str, Path | None] = {}   # token -> resolved base_dir (None = 미설정)

REGISTRY_FILE = _APP_DIR / "token_registry.json"


def _load() -> None:
    """서버 시작 시 한 번 호출 — 파일 + .env 모두 로드."""
    # 1) .env 기존 단일 토큰 (하위 호환)
    legacy_token    = os.getenv("MCP_AUTH_TOKEN", "").strip()
    legacy_base_dir = os.getenv("MCP_BASE_DIR", "").strip()
    if legacy_token:
        if legacy_base_dir:
            base: Path | None = Path(legacy_base_dir).resolve()
            log.debug("레거시 토큰 로드: %s -> %s", legacy_token[:8] + "...", base)
        else:
            base = None  # base_dir 미설정 — 파일 접근 차단
            log.debug("레거시 토큰 로드 (base_dir 미설정): %s", legacy_token[:8] + "...")
        _REGISTRY[legacy_token] = base

    # 2) token_registry.json
    # base_dir은 로드하지 않음 — 백엔드 heartbeat 검증 후 update_base_dir()로만 복구.
    # stale 토큰이 서버 재시작 직후 파일 접근을 허용하는 보안 구멍 방지.
    if REGISTRY_FILE.exists():
        try:
            entries = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
            for entry in entries:
                tok = entry.get("token", "").strip()
                if tok:
                    _REGISTRY[tok] = None  # base_dir 미설정 — 백엔드 검증 대기
            log.debug("registry.json에서 %d개 토큰 로드 (base_dir 검증 대기)", len(entries))
        except Exception as exc:
            log.warning("token_registry.json 로드 실패 (무시): %s", exc)


def _save() -> None:
    """현재 _REGISTRY를 token_registry.json에 영구 저장."""
    entries = [
        {"token": tok, "base_dir": str(bd) if bd else ""}
        for tok, bd in _REGISTRY.items()
    ]
    try:
        REGISTRY_FILE.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        log.warning("token_registry.json 저장 실패: %s", exc)


# ─── 공개 API ────────────────────────────────────────────────────────────────

def register_token(token: str, base_dir: str | Path | None = None, *, persist: bool = True) -> None:
    """
    토큰 + base_dir를 레지스트리에 등록 (이미 있으면 base_dir 갱신).
    base_dir가 None이거나 빈 문자열이면 미설정 상태로 등록 -> 파일 접근 차단.
    persist=True면 token_registry.json에도 저장.
    """
    if base_dir and str(base_dir).strip():
        _REGISTRY[token] = Path(str(base_dir)).resolve()
        log.info("토큰 등록: ...%s -> %s", token[-6:], _REGISTRY[token])
    else:
        _REGISTRY[token] = None
        log.info("토큰 등록 (base_dir 미설정): ...%s", token[-6:])
    if persist:
        _save()


def has_token(token: str) -> bool:
    """토큰이 레지스트리에 등록되어 있으면 True (base_dir 미설정이어도 True)."""
    return token in _REGISTRY


def get_base_dir(token: str) -> Path | None:
    """토큰의 base_dir 반환. 미등록이거나 base_dir 미설정이면 None."""
    return _REGISTRY.get(token)


def update_base_dir(token: str, new_base_dir: str) -> None:
    """heartbeat 응답에서 서버가 base_dir를 갱신할 때 사용."""
    if token not in _REGISTRY:
        return
    resolved = Path(new_base_dir).resolve()
    if _REGISTRY[token] != resolved:
        log.info("base_dir 갱신 (...%s): %s -> %s", token[-6:], _REGISTRY[token], resolved)
        _REGISTRY[token] = resolved
        _save()


def remove_token(token: str) -> bool:
    """토큰 제거. 성공 여부 반환."""
    if token in _REGISTRY:
        del _REGISTRY[token]
        _save()
        return True
    return False


def all_tokens() -> list[str]:
    """현재 등록된 모든 토큰 목록."""
    return list(_REGISTRY.keys())


def snapshot() -> list[dict]:
    """디버그/health 응답용 — 토큰(일부 마스킹) + base_dir 목록."""
    return [
        {"token_tail": tok[-6:], "base_dir": str(bd) if bd else ""}
        for tok, bd in _REGISTRY.items()
    ]


# ─── 초기 로드 ───────────────────────────────────────────────────────────────

_load()
