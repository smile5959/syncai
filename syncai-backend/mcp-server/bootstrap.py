"""
SyncAI MCP 자동 업데이트 부트스트래퍼
======================================
동작 방식:
  1. 백엔드 GET /v1/mcp-version 으로 최신 버전 확인
  2. %APPDATA%\\SyncAI\\code\\version.txt 의 로컬 버전과 비교
  3. 버전 다르면 code.zip 다운로드 → 압축 해제 → version.txt 업데이트
  4. server.py 를 서브프로세스로 실행, heartbeat.py 를 현재 프로세스에서 실행

실행 모드:
  (기본)           — 업데이트 체크 후 server + heartbeat 실행
  --mode=server    — CODE_DIR/server.py 직접 실행 (bootstrap이 내부적으로 사용)
  --setup-mode ... — 업데이트 체크 후 CODE_DIR/server.py를 setup-mode 로 실행
"""
import logging
import os
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bootstrap")

# ── 경로 상수 ──────────────────────────────────────────────────────────────────

BACKEND_URL  = os.getenv("SYNCAI_BACKEND_URL", "https://syncai-backend.fly.dev").rstrip("/")
CODE_DIR     = Path(os.environ.get("APPDATA", "")) / "SyncAI" / "code"
VERSION_FILE = CODE_DIR / "version.txt"

# ── 버전 확인 ─────────────────────────────────────────────────────────────────

def _local_version() -> str | None:
    if VERSION_FILE.exists():
        v = VERSION_FILE.read_text(encoding="utf-8").strip()
        return v or None
    return None


def _remote_info() -> tuple[str | None, str | None]:
    """백엔드에서 (version, download_url) 반환. 실패 시 (None, None)."""
    try:
        resp = httpx.get(f"{BACKEND_URL}/v1/mcp-version", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        version      = data.get("version")
        download_url = data.get("download_url")
        return version, download_url
    except Exception as e:
        log.warning("[bootstrap] 버전 확인 실패 (무시): %s", e)
        return None, None


# ── 업데이트 ──────────────────────────────────────────────────────────────────

def _build_download_url(version: str) -> str | None:
    """download_url 을 백엔드가 안 줬을 때 env var로 직접 조립."""
    repo = os.getenv("SYNCAI_GITHUB_REPO", "").strip()
    if not repo:
        return None
    return f"https://github.com/{repo}/releases/download/mcp/v{version}/code.zip"


def _update(version: str, download_url: str) -> bool:
    """
    code.zip 다운로드 후 CODE_DIR 에 파일 교체.
    실패 시 False 반환 — 기존 코드로 계속 실행.
    """
    tmp_zip = None
    tmp_dir = None
    try:
        CODE_DIR.mkdir(parents=True, exist_ok=True)

        # ① 임시 파일에 다운로드
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as f:
            tmp_zip = f.name

        log.info("[bootstrap] 다운로드 시작: %s", download_url)
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            resp = client.get(download_url)
            resp.raise_for_status()
            Path(tmp_zip).write_bytes(resp.content)

        # ② 임시 디렉터리에 압축 해제
        tmp_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(tmp_zip) as zf:
            zf.extractall(tmp_dir)

        # ③ CODE_DIR로 파일 이동 (덮어쓰기)
        for src in Path(tmp_dir).rglob("*"):
            if src.is_file():
                rel = src.relative_to(tmp_dir)
                dst = CODE_DIR / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)

        VERSION_FILE.write_text(version, encoding="utf-8")
        log.info("[bootstrap] 업데이트 완료: %s", version)
        return True

    except Exception as e:
        log.warning("[bootstrap] 업데이트 실패 (기존 코드로 계속 실행): %s", e)
        return False

    finally:
        if tmp_zip:
            try:
                Path(tmp_zip).unlink(missing_ok=True)
            except Exception:
                pass
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


# ── 코드 실행 헬퍼 ────────────────────────────────────────────────────────────

def _inject_code_dir() -> None:
    """CODE_DIR를 sys.path 최상위에 추가해 로컬 모듈 우선 로드."""
    code_dir_str = str(CODE_DIR)
    if code_dir_str not in sys.path:
        sys.path.insert(0, code_dir_str)


def _run_server_py() -> None:
    _inject_code_dir()
    runpy.run_path(str(CODE_DIR / "server.py"), run_name="__main__")


def _run_heartbeat_py() -> None:
    _inject_code_dir()
    runpy.run_path(str(CODE_DIR / "heartbeat.py"), run_name="__main__")


# ── 업데이트 체크 공통 로직 ───────────────────────────────────────────────────

def _ensure_code_up_to_date() -> None:
    """버전 비교 후 필요 시 업데이트. 실패해도 진행."""
    CODE_DIR.mkdir(parents=True, exist_ok=True)

    local                    = _local_version()
    remote_ver, download_url = _remote_info()

    needs_update = remote_ver and remote_ver != local
    needs_init   = not (CODE_DIR / "server.py").exists()

    if needs_update or needs_init:
        if not download_url and remote_ver:
            download_url = _build_download_url(remote_ver)
        if download_url:
            label = f"{local or '없음'} → {remote_ver}" if needs_update else f"초기 설치 {remote_ver}"
            log.info("[bootstrap] 코드 업데이트: %s", label)
            _update(remote_ver, download_url)
        else:
            log.warning("[bootstrap] download_url 없음 — 업데이트 생략")
    else:
        log.info("[bootstrap] 최신 버전 (%s)", local)


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    # ── 모드 파싱 ──────────────────────────────────────────────────────────────
    mode       = None
    setup_mode = False
    passthrough: list[str] = []

    for arg in sys.argv[1:]:
        if arg.startswith("--mode="):
            mode = arg[7:]
        elif arg == "--setup-mode":
            setup_mode = True
            passthrough.append(arg)
        else:
            passthrough.append(arg)

    # ── --mode=server: 내부 위임 경로 (업데이트 없이 바로 실행) ──────────────
    if mode == "server":
        sys.argv = [sys.argv[0]] + passthrough
        _run_server_py()
        return

    # ── 모든 경로에서 먼저 코드 최신화 ────────────────────────────────────────
    _ensure_code_up_to_date()

    if not (CODE_DIR / "server.py").exists():
        log.error("[bootstrap] %s/server.py 없음 — 초기 설치 필요", CODE_DIR)
        sys.exit(1)

    # ── --setup-mode: OAuth 콜백 서버만 실행 (heartbeat 불필요) ──────────────
    if setup_mode:
        sys.argv = [sys.argv[0]] + passthrough
        _run_server_py()
        return

    # ── 일반 서비스 모드: server 서브프로세스 실행 후 종료 대기 ────────────────
    # heartbeat/ws_client는 server.py의 uvicorn startup 이벤트 내부에서 실행됨.
    server_proc = subprocess.Popen(
        [sys.executable, "--mode=server"],
        env=os.environ.copy(),
    )
    log.info("[bootstrap] server.py 서브프로세스 시작 (PID %d)", server_proc.pid)
    server_proc.wait()
    log.info("[bootstrap] server.py 서브프로세스 종료 (종료 코드: %d)", server_proc.returncode)


if __name__ == "__main__":
    main()
