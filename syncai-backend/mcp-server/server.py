"""
SyncAI MCP 서버 — 멀티 토큰 지원
JSON-RPC 2.0 over HTTP — Worker 로컬 PC에서 실행

Bearer 토큰으로 요청한 MCP Config를 식별하고,
해당 Config의 base_dir 안에서만 파일 작업을 수행한다.
등록된 토큰이 없으면 403 반환.
"""
import asyncio
import logging
import os
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import tools as tool_module
import ws_client as ws_client_module

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("mcp-server")

app = FastAPI(title="SyncAI MCP Server", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 인증 헬퍼 ───────────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str:
    """Authorization: Bearer <token> 헤더에서 토큰 추출. 없으면 빈 문자열."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip()
    return ""


def _authenticate_token(request: Request) -> str:
    """토큰 등록 여부만 확인 (base_dir 불필요). pick-folder 등에 사용."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authorization 헤더 필요")
    if not config.has_token(token):
        raise HTTPException(status_code=403, detail="등록되지 않은 토큰")
    return token


def _resolve_base_dir(request: Request) -> Path:
    """
    요청 토큰으로 base_dir를 결정.
    - 토큰 없음 -> 401
    - 미등록 토큰 -> 403
    - 등록은 됐지만 base_dir 미설정 -> 403 (MCP 설정에서 폴더 지정 필요)
    - 정상 -> base_dir Path 반환
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authorization 헤더 필요")

    if not config.has_token(token):
        raise HTTPException(status_code=403, detail="등록되지 않은 토큰")

    base_dir = config.get_base_dir(token)
    if base_dir is None:
        raise HTTPException(
            status_code=403,
            detail="base_dir 미설정 — MCP 설정에서 접근 허용 폴더를 지정해주세요",
        )

    return base_dir


# ─── JSON-RPC 유틸 ───────────────────────────────────────────────────────────

def _ok(id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": id, "result": result}

def _err(id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────

@app.post("/")
async def handle_jsonrpc(request: Request) -> JSONResponse:
    base_dir = _resolve_base_dir(request)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse(_err(None, -32700, "JSON 파싱 실패"))

    req_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    log.info("<- %s  id=%s  base_dir=%s", method, req_id, str(base_dir)[:40])

    if method == "tools/list":
        return JSONResponse(_ok(req_id, {"tools": tool_module.TOOL_DEFINITIONS}))

    if method == "tools/call":
        name      = params.get("name", "")
        arguments = params.get("arguments", {})
        log.info("   tool=%s args=%s", name, list(arguments.keys()))
        # I/O 집약 도구(search_files 등)가 asyncio 이벤트 루프를 블로킹하지 않도록
        # 모든 tool dispatch를 스레드 풀에서 실행.
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, tool_module.dispatch, name, arguments, base_dir
        )
        if result.get("isError"):
            log.warning("   오류: %s", result["content"][0]["text"])
        else:
            log.info("   성공: %s", result["content"][0]["text"][:80])
        return JSONResponse(_ok(req_id, result))

    return JSONResponse(_err(req_id, -32601, f"지원하지 않는 메서드: {method}"))


@app.post("/set-token")
async def set_token(request: Request) -> JSONResponse:
    """
    토큰 등록/갱신 — heartbeat.py가 auto-register 후 자동 호출.
    localhost 요청만 허용. 인증 불필요.

    body: { "token": "...", "base_dir": "C:/..." }
    base_dir 미전달 시 기존 값 유지. 기존 값도 없으면 None(미설정) — 파일 접근 차단.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="localhost에서만 접근 가능합니다.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON 파싱 실패")

    token = body.get("token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token 필드가 필요합니다.")

    # base_dir: 전달값 우선 -> 기존 등록값 -> None(미설정, 파일 접근 차단)
    raw_base_dir = body.get("base_dir", "").strip()
    existing = config.get_base_dir(token)
    if raw_base_dir:
        base_dir: str | None = raw_base_dir
    elif existing:
        base_dir = str(existing)
    else:
        base_dir = None  # base_dir 미설정 — 파일 접근 차단

    # persist=False — /set-token으로 추가된 임시 토큰은 파일에 저장하지 않음.
    # 재시작 시 .env의 MCP_AUTH_TOKEN만 로드되어 stale 토큰 누적 방지.
    config.register_token(token, base_dir, persist=False)
    log.info("토큰 등록 완료 (...%s) base_dir=%s", token[-6:], base_dir or "(미설정)")

    # ws_client는 단일 토큰 연결이므로 /set-token은 로컬 레지스트리만 갱신
    # (기존 heartbeat 연동 제거)

    return JSONResponse({"ok": True, "base_dir": base_dir or ""})


@app.get("/pick-folder")
async def pick_folder(request: Request) -> JSONResponse:
    """
    OS 네이티브 폴더 선택 다이얼로그.
    localhost 요청만 허용 — 외부에서 반복 호출로 팝업 DoS 방지.
    토큰 인증 확인 (base_dir 불필요).
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="localhost에서만 접근 가능합니다.")
    _authenticate_token(request)
    loop = asyncio.get_running_loop()

    def _open_dialog() -> str | None:
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.wm_attributes("-topmost", True)
            path = filedialog.askdirectory(title="접근 허용 폴더 선택")
            root.destroy()
            return path or None
        except Exception as e:
            log.warning("폴더 선택 다이얼로그 오류: %s", e)
            return None

    path = await loop.run_in_executor(None, _open_dialog)
    return JSONResponse({"path": path})


@app.post("/revoke-token")
async def revoke_token(request: Request) -> JSONResponse:
    """
    토큰 폐기 — 백엔드가 MCP config 삭제 시 즉각 파일 접근 차단.
    localhost 요청만 허용.
    base_dir을 None으로 설정해 파일 접근 차단하되 루프는 유지
    (remove_token 쓰면 안 됨 — 루프가 토큰을 잃어 재연결 시 복구 불가).

    body: { "token": "..." }
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="localhost에서만 접근 가능합니다.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON 파싱 실패")

    token = body.get("token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token 필드가 필요합니다.")

    # base_dir=None: has_token() True 유지(루프 살아있음) + 파일 접근 차단
    config.register_token(token, None, persist=False)
    log.info("토큰 폐기 (...%s) — base_dir=None (파일 접근 차단)", token[-6:])

    return JSONResponse({"ok": True})


@app.post("/reconnect")
async def reconnect(request: Request) -> JSONResponse:
    """
    백엔드가 새 MCP config 생성 시 호출 -- heartbeat 루프 즉시 재시도 트리거.
    localhost 요청만 허용.
    """
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="localhost에서만 접근 가능합니다.")
    # WS 클라이언트는 연결 끊기면 자동 재연결하므로 별도 신호 불필요
    log.info("reconnect 수신 (WS 방식에서는 자동 재연결)")
    return JSONResponse({"ok": True})


@app.get("/health")
async def health(request: Request) -> JSONResponse:
    """
    서버 상태 확인. localhost 요청만 전체 정보 반환.
    외부(Cloudflare Tunnel 경유)에서는 최소 정보만 반환 — 토큰/경로 노출 방지.
    """
    client_host = request.client.host if request.client else ""
    is_local = client_host in ("127.0.0.1", "::1", "localhost")

    if is_local:
        return JSONResponse({
            "status": "ok",
            "port": config.PORT,
            "configs": config.snapshot(),   # 토큰 tail + base_dir 목록
            "tools": [t["name"] for t in tool_module.TOOL_DEFINITIONS],
        })
    else:
        # 외부 요청: 최소 정보만 — 토큰·경로 노출 차단
        return JSONResponse({
            "status": "ok",
            "config_count": len(config.snapshot()),
        })


@app.on_event("startup")
async def startup() -> None:
    import heartbeat as heartbeat_module
    import tunnel as tunnel_module

    backend_url = os.getenv("SYNCAI_BACKEND_URL", "https://syncai-backend.fly.dev").rstrip("/")
    mcp_token   = os.getenv("MCP_AUTH_TOKEN", "").strip()

    ws_client_module.start(backend_url, mcp_token)
    asyncio.create_task(tunnel_module.start_and_detect(config.PORT))
    heartbeat_module.start_heartbeat()


@app.on_event("shutdown")
async def shutdown() -> None:
    ws_client_module.stop()



if __name__ == "__main__":
    import sys as _sys

    # Custom URL scheme handler: server.exe "syncai://auth?token=...&state=..."
    # Triggered by Windows when the browser navigates to syncai:// after login.
    # Writes token to C:\ProgramData\SyncAI\pending_token.txt (user-writable),
    # because C:\Program Files\ requires admin and the URL handler runs as normal user.
    if len(_sys.argv) > 1 and _sys.argv[1].startswith("syncai://"):
        import os as _os
        from urllib.parse import urlparse as _urlparse, parse_qs as _parse_qs
        _parsed = _urlparse(_sys.argv[1])
        _qs = _parse_qs(_parsed.query)
        _token = _qs.get("token", [""])[0].strip()
        if _token:
            _pending_dir = Path(_os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "SyncAI"
            _pending_dir.mkdir(parents=True, exist_ok=True)
            _pending_path = _pending_dir / "pending_token.txt"
            _pending_path.write_text(_token, encoding="utf-8")
            log.info("[url-handler] Token staged → %s", _pending_path)
        else:
            log.error("[url-handler] No token in URL: %s", _sys.argv[1])
            _sys.exit(1)
        _sys.exit(0)

    configs = config.snapshot()
    cfg_lines = "\n".join(
        f"  [{i+1}] ...{c['token_tail']}  ->  {c['base_dir'] or '(미설정)'}"
        for i, c in enumerate(configs)
    ) or "  (등록된 MCP Config 없음)"

    print(f"""
+==========================================+
|       SyncAI MCP Server 시작             |
+==========================================+
|  PORT    : {config.PORT:<30}|
|  등록 MCP Config:
{cfg_lines}
+==========================================+
""")
    uvicorn.run(app, host="0.0.0.0", port=config.PORT, log_level="warning")
