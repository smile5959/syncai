"""
SyncAI MCP heartbeat (SSE 방식)
================================
동작 방식:
  [이메일 있는 경우] GET /mcp-configs/sse?email=... SSE 연결 유지
                    → token_assigned 이벤트 수신 → .env 저장 → heartbeat 루프 시작
                    → connected 이벤트: 이미 토큰이 있으면 바로 루프 시작
  [토큰만 있는 경우] 기존처럼 heartbeat 루프 바로 시작

  heartbeat 루프: 30초마다 POST /mcp-configs/heartbeat → endpoint 갱신
  SSE 연결 끊기면 자동 재연결 (지수 백오프)
"""
import asyncio
import logging
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL = os.getenv("SYNCAI_BACKEND_URL", "").rstrip("/")
INTERVAL    = int(os.getenv("SYNCAI_HEARTBEAT_INTERVAL", "30"))

log = logging.getLogger("heartbeat")

# 토큰별 asyncio Task 관리 (token → Task)
_tasks: dict[str, asyncio.Task] = {}
_sse_task: asyncio.Task | None = None


# ─── .env 저장 ───────────────────────────────────────────────────────────────

def _save_token_to_env(token: str) -> None:
    """받은 토큰을 .env 파일의 MCP_AUTH_TOKEN에 자동 저장."""
    import config as _cfg
    env_path = _cfg._APP_DIR / ".env"
    try:
        content = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
        if re.search(r"^MCP_AUTH_TOKEN=", content, re.MULTILINE):
            content = re.sub(
                r"^MCP_AUTH_TOKEN=.*$", f"MCP_AUTH_TOKEN={token}",
                content, flags=re.MULTILINE,
            )
        else:
            content += f"\nMCP_AUTH_TOKEN={token}"
        env_path.write_text(content, encoding="utf-8")
        log.info("[SSE] MCP_AUTH_TOKEN .env 저장 완료 (...%s)", token[-6:])
    except Exception as e:
        log.warning("[SSE] .env 저장 실패 (무시): %s", e)


# ─── SSE 연결 ────────────────────────────────────────────────────────────────

async def _sse_connect(email: str) -> None:
    """
    백엔드 SSE 엔드포인트에 연결.
    연결 즉시 현재 상태(connected 이벤트) 수신 + 이후 push 이벤트 처리.
    연결 끊기면 지수 백오프로 재연결.
    """
    import config as _cfg
    import json as _json

    # TUNNEL_URL 대기 (최대 35초)
    for _ in range(35):
        if _cfg.TUNNEL_URL:
            break
        await asyncio.sleep(1)

    endpoint = _cfg.TUNNEL_URL or f"http://localhost:{_cfg.PORT}"
    backoff = 5  # 재연결 대기 시간(초), 최대 60초

    while True:
        url = f"{BACKEND_URL}/v1/mcp-configs/sse"
        params = {"email": email, "endpoint": endpoint}
        log.info("[SSE] 연결 시도: %s (endpoint=%s)", email, endpoint)

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, params=params) as resp:
                    if resp.status_code == 404:
                        log.warning("[SSE] 사용자 없음 (404) — 재시도 중단")
                        return
                    if resp.status_code != 200:
                        log.warning("[SSE] 연결 실패 (%d) — %ds 후 재연결", resp.status_code, backoff)
                        await asyncio.sleep(backoff)
                        backoff = min(backoff * 2, 60)
                        continue

                    log.info("[SSE] 연결 성공 (%s)", email)
                    backoff = 5  # 성공 시 리셋

                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw:
                            continue

                        try:
                            event = _json.loads(raw)
                        except Exception:
                            continue

                        etype = event.get("type")

                        if etype == "ping":
                            # endpoint 갱신 (Cloudflare URL 바뀔 수 있음)
                            endpoint = _cfg.TUNNEL_URL or f"http://localhost:{_cfg.PORT}"
                            continue

                        elif etype == "connected":
                            token = event.get("mcp_token")
                            base_dir = event.get("base_dir")
                            if token:
                                env_base_dir = os.getenv("MCP_BASE_DIR", "").strip() or None
                                effective_base_dir = base_dir or env_base_dir
                                _save_token_to_env(token)
                                _cfg.register_token(token, effective_base_dir, persist=True)
                                log.info("[SSE] 기존 토큰 확인 (...%s) base_dir=%s", token[-6:], effective_base_dir or "(미설정)")
                                _start_loop(token)
                            else:
                                log.info("[SSE] 연결됨 — 토큰 없음, 슬롯 생성 대기 중")

                        elif etype == "token_assigned":
                            token = event.get("mcp_token")
                            base_dir = event.get("base_dir")
                            if token:
                                env_base_dir = os.getenv("MCP_BASE_DIR", "").strip() or None
                                effective_base_dir = base_dir or env_base_dir
                                _save_token_to_env(token)
                                _cfg.register_token(token, effective_base_dir, persist=True)
                                log.info("[SSE] 새 토큰 수신 (...%s) base_dir=%s", token[-6:], effective_base_dir or "(미설정)")
                                _start_loop(token)

                        elif etype == "base_dir_updated":
                            token = event.get("mcp_token")
                            new_dir = event.get("base_dir")
                            if token and new_dir:
                                _cfg.update_base_dir(token, new_dir)
                                log.info("[SSE] base_dir 갱신: %s", new_dir)

        except httpx.RemoteProtocolError:
            log.warning("[SSE] 연결 끊김 — %ds 후 재연결", backoff)
        except Exception as e:
            log.warning("[SSE] 오류: %s — %ds 후 재연결", e, backoff)

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)
        # 재연결 시 endpoint 최신화
        endpoint = _cfg.TUNNEL_URL or f"http://localhost:{_cfg.PORT}"


# ─── heartbeat (endpoint 갱신용) ─────────────────────────────────────────────

async def _send_heartbeat(token: str) -> tuple[str, str]:
    """
    heartbeat 전송. 반환값:
      ("ok",  base_dir)  — 정상
      ("404", "")        — Config 없음
      ("err", "")        — 기타 오류
    """
    import config as _cfg
    url      = f"{BACKEND_URL}/v1/mcp-configs/heartbeat"
    endpoint = _cfg.TUNNEL_URL or f"http://localhost:{_cfg.PORT}"
    payload: dict = {"mcp_token": token, "endpoint": endpoint}

    env_base_dir = os.getenv("MCP_BASE_DIR", "").strip()
    if env_base_dir:
        payload["base_dir"] = env_base_dir

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data     = resp.json()
                base_dir = data.get("base_dir") or ""
                if base_dir:
                    _cfg.update_base_dir(token, base_dir)
                return "ok", base_dir
            elif resp.status_code == 404:
                log.warning("[...%s] heartbeat 404", token[-6:])
                return "404", ""
            else:
                log.warning("[...%s] heartbeat %d", token[-6:], resp.status_code)
                return "err", ""
    except Exception as e:
        log.warning("[...%s] heartbeat 오류: %s", token[-6:], e)
        return "err", ""


async def _token_loop(token: str) -> None:
    """단일 토큰에 대한 heartbeat 루프 (endpoint 갱신)."""
    if not BACKEND_URL:
        return

    import config as _cfg

    # TUNNEL_URL 대기
    for _ in range(35):
        if _cfg.TUNNEL_URL:
            break
        await asyncio.sleep(1)

    log.info("[...%s] heartbeat 루프 시작 (간격: %ds)", token[-6:], INTERVAL)

    fail_count = 0
    while True:
        result, _ = await _send_heartbeat(token)

        if result == "ok":
            fail_count = 0
        elif result in ("404", "err"):
            fail_count += 1
            if fail_count >= 3:
                log.warning("[...%s] heartbeat 3회 연속 실패 — 루프 종료", token[-6:])
                # SSE가 재연결 및 토큰 재발급을 처리하므로 여기선 종료
                return

        await asyncio.sleep(INTERVAL)


# ─── 공개 API ────────────────────────────────────────────────────────────────

def start_heartbeat() -> None:
    """
    서버 startup 시 호출.
    - SYNCAI_EMAIL 있으면 → SSE 연결 (토큰 자동 수신 + endpoint 갱신)
    - MCP_AUTH_TOKEN만 있으면 → heartbeat 루프 바로 시작
    - 둘 다 없으면 → 비활성화
    """
    global _sse_task
    import config as _cfg

    email = os.getenv("SYNCAI_EMAIL", "").strip()
    if email and BACKEND_URL:
        log.info("[SSE] 이메일 부트스트랩 시작 (%s)", email)
        _sse_task = asyncio.create_task(_sse_connect(email))
        return

    tokens = _cfg.all_tokens()
    if tokens:
        for token in tokens:
            _start_loop(token)
        log.info("heartbeat 시작: %d개 토큰 (SSE 없이)", len(tokens))
        return

    log.info("heartbeat 비활성화 — .env에 SYNCAI_EMAIL 또는 MCP_AUTH_TOKEN 설정 필요")


def signal_reconnect() -> None:
    """레거시 호환 — /reconnect 엔드포인트에서 호출. SSE 방식에선 불필요."""
    pass  # SSE가 자동 재연결 처리


async def add_token(token: str) -> None:
    """Runtime에 새 토큰 추가."""
    if token in _tasks and not _tasks[token].done():
        return
    _start_loop(token)


async def restart_with_new_token(new_token: str) -> None:
    """하위 호환 — 새 토큰 루프 추가."""
    await add_token(new_token)


def _start_loop(token: str) -> None:
    """토큰별 asyncio Task 생성 및 _tasks에 등록."""
    if token in _tasks and not _tasks[token].done():
        return  # 이미 실행 중
    task = asyncio.create_task(_token_loop(token))
    _tasks[token] = task
