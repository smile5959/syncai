"""
SyncAI MCP WebSocket 클라이언트
================================
백엔드 역방향 WebSocket 연결 관리.
Cloudflare 터널 없이 아웃바운드 WSS 연결만으로 통신한다.

동작 흐름:
  시작 → wss://BACKEND_URL/ws/mcp-agent?token=xxx 연결
       → 툴 요청 수신 → tools.py dispatch → 결과 전송
       → 이벤트 수신 (new_config / request_folder_pick) → tkinter 팝업 → base_dir 전송
       → 연결 끊기면 지수 백오프 재연결

수신 메시지 종류 (백엔드 → MCP 서버):
  tool_call            : 툴 실행 요청 → tool_response 전송
  new_config           : 새 MCP 등록됨 → 폴더 선택 팝업
  request_folder_pick  : 경로 변경 요청 → 폴더 선택 팝업
  ping                 : keep-alive (무시)

전송 메시지 종류 (MCP 서버 → 백엔드):
  tool_response  : 툴 실행 결과
  base_dir_update: 폴더 선택 완료
  ping           : keep-alive
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

log = logging.getLogger("ws_client")

# 재연결 백오프 (초)
_BACKOFF_INIT = 5
_BACKOFF_MAX  = 60

_ws_task: asyncio.Task | None = None
_current_token: str = ""
_stop_event: asyncio.Event = asyncio.Event()


# ─── .env MCP_BASE_DIR 일회성 삭제 ──────────────────────────────────────────

def _remove_env_base_dir() -> None:
    """
    인스톨러가 .env에 저장한 MCP_BASE_DIR을 WS 첫 연결 후 삭제.
    이후 재시작 시 DB 경로가 유지되도록 .env가 덮어쓰지 않게 한다.
    이미 없으면 무시.
    """
    try:
        import config as _cfg_mod
        env_path = _cfg_mod._APP_DIR / ".env"
        if not env_path.exists():
            return
        lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
        new_lines = [l for l in lines if not l.startswith("MCP_BASE_DIR=")]
        if len(new_lines) != len(lines):
            env_path.write_text("".join(new_lines), encoding="utf-8")
            log.info("[ws] .env MCP_BASE_DIR 항목 삭제 완료 (일회성 사용)")
    except Exception as e:
        log.warning("[ws] .env MCP_BASE_DIR 삭제 실패 (무시): %s", e)


# ─── 폴더 선택 다이얼로그 ────────────────────────────────────────────────────

def _pick_folder_sync(title: str = "접근 허용 폴더 선택") -> str | None:
    """
    OS 네이티브 폴더 선택 다이얼로그 (동기). run_in_executor로 호출해야 함.
    macOS: osascript (백그라운드 서비스에서도 동작)
    Windows: tkinter
    """
    import platform
    system = platform.system()

    if system == "Darwin":
        # macOS: osascript로 Finder 폴더 선택 (launchd 서비스에서도 GUI 가능)
        try:
            import subprocess
            script = (
                'tell application "Finder"\n'
                '  activate\n'
                f'  set theFolder to choose folder with prompt "{title}"\n'
                '  return POSIX path of theFolder\n'
                'end tell'
            )
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=120,
            )
            path = result.stdout.strip()
            return path if path else None
        except Exception as e:
            log.warning("폴더 선택 다이얼로그 오류 (osascript): %s", e)
            return None
    else:
        # Windows/Linux: tkinter
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.wm_attributes("-topmost", True)
            path = filedialog.askdirectory(title=title)
            root.destroy()
            return path or None
        except Exception as e:
            log.warning("폴더 선택 다이얼로그 오류 (tkinter): %s", e)
            return None


async def _pick_folder_async(title: str = "접근 허용 폴더 선택") -> str | None:
    """tkinter 폴더 선택을 스레드 풀에서 실행 (asyncio 블로킹 방지)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _pick_folder_sync, title)


# ─── WebSocket 연결 루프 ─────────────────────────────────────────────────────

async def _ws_loop(backend_url: str, token: str) -> None:
    """
    백엔드 WebSocket에 연결하고 메시지를 처리한다.
    연결이 끊기면 지수 백오프로 재연결.
    """
    import config as _cfg
    import tools as tool_module

    # websockets 패키지 지연 import (requirements에 추가 필요)
    try:
        import websockets
        from websockets.exceptions import ConnectionClosed
    except ImportError:
        log.error("websockets 패키지가 없습니다. pip install websockets 를 실행하세요.")
        return

    ws_url = f"{backend_url.rstrip('/')}/ws/mcp-agent?token={token}"
    # http → ws, https → wss 변환
    ws_url = ws_url.replace("https://", "wss://").replace("http://", "ws://")

    backoff = _BACKOFF_INIT

    while not _stop_event.is_set():
        log.info("[ws] 연결 시도: %s ...%s", backend_url, token[-6:])
        try:
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                log.info("[ws] 연결 완료 (...%s)", token[-6:])
                backoff = _BACKOFF_INIT  # 성공하면 백오프 리셋

                # 연결 시 현재 base_dir 전송 (DB에 없을 경우 초기화)
                current_base_dir = _cfg.get_base_dir(token)
                if current_base_dir:
                    await ws.send(json.dumps({
                        "type": "base_dir_update",
                        "base_dir": str(current_base_dir),
                    }))
                    # .env의 MCP_BASE_DIR은 인스톨러가 일회성으로 저장한 값.
                    # 전송 완료 후 삭제해야 이후 재시작 시 DB 경로를 덮어쓰지 않는다.
                    _remove_env_base_dir()

                async for raw in ws:
                    if _stop_event.is_set():
                        break
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    msg_type = data.get("type", "")

                    # ── 툴 요청 처리 ─────────────────────────────────────
                    if msg_type == "tool_call":
                        req_id   = data.get("id", "")
                        name     = data.get("name", "")
                        arguments = data.get("arguments", {})

                        base_dir = _cfg.get_base_dir(token)
                        if base_dir is None:
                            result   = None
                            err_msg  = "base_dir 미설정 — 폴더를 먼저 지정해주세요"
                        else:
                            try:
                                loop = asyncio.get_event_loop()
                                raw_result = await loop.run_in_executor(
                                    None, tool_module.dispatch, name, arguments, base_dir
                                )
                                # tools.dispatch 는 {"content": [...], "isError": bool} 반환
                                content = raw_result.get("content", [])
                                text = content[0].get("text", "") if content else ""
                                result  = text if text else str(raw_result)
                                err_msg = "툴 오류: " + text if raw_result.get("isError") else None
                            except Exception as e:
                                result  = None
                                err_msg = str(e)

                        await ws.send(json.dumps({
                            "type":   "tool_response",
                            "id":     req_id,
                            "result": result,
                            "error":  err_msg,
                        }))

                    # ── 폴더 선택 이벤트 ─────────────────────────────────
                    elif msg_type in ("new_config", "request_folder_pick"):
                        config_id = data.get("mcp_config_id", "")
                        log.info("[ws] 폴더 선택 요청 (type=%s config=%s)", msg_type, config_id[:8] if config_id else "")
                        path = await _pick_folder_async("AI가 접근할 폴더를 선택하세요")
                        if path:
                            _cfg.register_token(token, path, persist=True)
                            log.info("[ws] 폴더 선택 완료: %s", path)
                            await ws.send(json.dumps({
                                "type":     "base_dir_update",
                                "base_dir": path,
                            }))
                        else:
                            log.info("[ws] 폴더 선택 취소됨")

                    elif msg_type == "base_dir_restore":
                        # 백엔드가 WS 연결 직후 DB의 base_dir를 전달 (PC 재부팅 후 복원용)
                        base_dir = data.get("base_dir", "")
                        if base_dir:
                            _cfg.register_token(token, base_dir, persist=True)
                            log.info("[ws] base_dir 복원 완료: %s", base_dir)

                    elif msg_type == "ping":
                        pass  # keep-alive

                    else:
                        log.debug("[ws] 알 수 없는 메시지: %s", msg_type)

        except ConnectionClosed as e:
            log.warning("[ws] 연결 해제 (code=%s) — %d초 후 재연결...", e.code, backoff)
        except OSError as e:
            log.warning("[ws] 연결 실패 (%s) — %d초 후 재연결...", e, backoff)
        except Exception as e:
            log.warning("[ws] 오류 (%s) — %d초 후 재연결...", e, backoff)

        if _stop_event.is_set():
            break

        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=backoff)
        except asyncio.TimeoutError:
            pass

        backoff = min(backoff * 2, _BACKOFF_MAX)


# ─── 공개 API ────────────────────────────────────────────────────────────────

def start(backend_url: str, token: str) -> None:
    """
    server.py startup 이벤트에서 asyncio.create_task()로 호출.
    백엔드 URL과 MCP 토큰을 받아 WS 루프를 시작한다.
    """
    global _ws_task, _current_token
    if not backend_url:
        log.warning("[ws] SYNCAI_BACKEND_URL 미설정 — WS 연결 건너뜀")
        return
    if not token:
        log.warning("[ws] MCP_AUTH_TOKEN 미설정 — WS 연결 건너뜀")
        return

    _current_token = token
    _ws_task = asyncio.create_task(_ws_loop(backend_url, token))
    log.info("[ws] WS 클라이언트 시작 (token=...%s)", token[-6:])


def ensure_started(backend_url: str, token: str) -> None:
    """
    SSE를 통해 토큰을 받았을 때 호출 — WS 루프가 이미 이 토큰으로 실행 중이면
    무시하고, 아니면 시작(또는 다른 토큰으로 교체)한다.
    """
    global _ws_task, _current_token
    if _ws_task and not _ws_task.done() and _current_token == token:
        return
    if _ws_task and not _ws_task.done():
        log.info("[ws] 토큰 변경 — 기존 WS task 취소 (...%s → ...%s)", _current_token[-6:], token[-6:])
        _ws_task.cancel()
    start(backend_url, token)


def stop() -> None:
    """서버 종료 시 WS 루프 중단."""
    _stop_event.set()
    if _ws_task and not _ws_task.done():
        _ws_task.cancel()
