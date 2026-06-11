"""
SyncAI MCP — Cloudflare Tunnel 자동화
======================================
서버 시작 시 cloudflared를 백그라운드로 실행하고
stdout/stderr에서 공개 URL(trycloudflare.com)을 감지해
config.TUNNEL_URL에 저장한다.

공개 API:
  start_and_detect(port)  — server.py startup 이벤트에서 create_task로 호출

동작 흐름:
  1. MCP_TUNNEL_URL 환경변수가 이미 설정돼 있으면 → cloudflared 실행 건너뜀
  2. mcp-server/ 폴더에 cloudflared.exe가 있으면 우선 사용
     없으면 시스템 PATH의 cloudflared 사용
  3. FileNotFoundError → 경고 출력 후 localhost fallback
  4. stdout/stderr를 동시에 스캔, 정규식으로 trycloudflare.com URL 파싱
  5. 감지 성공 → config.TUNNEL_URL 갱신 (heartbeat 다음 주기에 자동 반영)
  6. 30초 초과 → 경고 후 localhost fallback (서버 정상 작동 유지)

cloudflared 설치 방법 (로컬 exe 방식, 권장):
  https://github.com/cloudflare/cloudflared/releases 에서
  cloudflared-windows-amd64.exe 를 받아서
  mcp-server/cloudflared.exe 로 이름 바꿔서 이 폴더에 넣으면 됩니다.
"""
import asyncio
import logging
import re
import sys
from pathlib import Path

log = logging.getLogger("tunnel")

# trycloudflare.com 공개 URL 패턴
_URL_RE = re.compile(r'https://[a-z0-9\-]+\.trycloudflare\.com')

# cloudflared 프로세스 (cleanup용)
_proc: asyncio.subprocess.Process | None = None

# URL 감지 대기 시간 (초)
_DETECT_TIMEOUT = 30


async def start_and_detect(port: int) -> None:
    """
    cloudflared tunnel 을 백그라운드로 시작하고 URL을 비동기 감지한다.
    server.py startup 이벤트에서 asyncio.create_task()로 호출할 것.
    이 함수 자체는 블로킹되지 않음 — URL 감지는 별도 task에서 진행.
    """
    import config  # 지연 import — 순환참조 방지

    # 환경변수로 수동 지정된 경우 cloudflared 실행 불필요
    if config.TUNNEL_URL:
        log.info(
            "MCP_TUNNEL_URL 환경변수 설정됨 — cloudflared 자동 시작 건너뜀: %s",
            config.TUNNEL_URL,
        )
        return

    # 1. 로컬 cloudflared 바이너리 우선 탐색, 없으면 시스템 PATH 사용
    # PyInstaller 번들 시 _APP_DIR = 설치 디렉토리 (server.exe와 같은 위치)
    import config as _cfg
    _cf_name = "cloudflared.exe" if sys.platform == "win32" else "cloudflared"
    local_exe = _cfg._APP_DIR / _cf_name
    if local_exe.exists():
        cmd_exe = str(local_exe)
        log.info("로컬 cloudflared 사용: %s", cmd_exe)
    else:
        cmd_exe = "cloudflared"

    cmd = [cmd_exe, "tunnel", "--url", f"http://localhost:{port}"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        _print_install_guide()
        return
    except Exception as exc:
        log.warning("cloudflared 시작 실패: %s — localhost fallback으로 동작합니다.", exc)
        return

    global _proc
    _proc = proc
    log.info("cloudflared 시작 (PID=%d) — 공개 URL 감지 대기 중... (최대 %ds)", proc.pid, _DETECT_TIMEOUT)

    # URL 감지를 별도 task로 분리 (start_and_detect는 즉시 반환)
    asyncio.create_task(_detect_url(proc))


async def _detect_url(proc: asyncio.subprocess.Process) -> None:
    """
    cloudflared stdout/stderr를 동시에 스캔하여 trycloudflare.com URL을 파싱.
    감지 성공 시 config.TUNNEL_URL 갱신.
    _DETECT_TIMEOUT 초 초과 시 localhost fallback 경고 출력.
    """
    import config  # 지연 import

    found = asyncio.Event()

    async def _scan(stream: asyncio.StreamReader | None, stream_name: str) -> None:
        if stream is None:
            return
        try:
            async for raw_line in stream:
                if found.is_set():
                    return
                line = raw_line.decode(errors="replace").strip()
                if line:
                    log.debug("[cloudflared/%s] %s", stream_name, line)
                m = _URL_RE.search(line)
                if m:
                    url = m.group(0)
                    config.TUNNEL_URL = url
                    log.info("✅ Cloudflare Tunnel URL 감지 완료: %s", url)
                    log.info("   → heartbeat 다음 주기부터 이 URL로 endpoint를 전송합니다.")
                    found.set()
                    return
        except Exception as exc:
            log.debug("[cloudflared/%s] 읽기 오류: %s", stream_name, exc)

    # stdout / stderr 동시 스캔
    scan_tasks = [
        asyncio.create_task(_scan(proc.stdout, "stdout")),
        asyncio.create_task(_scan(proc.stderr, "stderr")),
    ]

    try:
        await asyncio.wait_for(
            asyncio.gather(*scan_tasks, return_exceptions=True),
            timeout=float(_DETECT_TIMEOUT),
        )
    except asyncio.TimeoutError:
        for t in scan_tasks:
            t.cancel()

    if not config.TUNNEL_URL:
        log.warning(
            "⚠️  Cloudflare Tunnel URL 감지 실패 (%ds 초과) — localhost fallback으로 동작합니다.",
            _DETECT_TIMEOUT,
        )
        log.warning(
            "   원인: cloudflared 출력에서 URL을 찾지 못했습니다. "
            "cloudflared 로그를 직접 확인하거나 MCP_TUNNEL_URL을 수동으로 설정하세요."
        )


def _print_install_guide() -> None:
    """cloudflared 미설치 시 설치 안내 출력."""
    guide = """
┌─────────────────────────────────────────────────────────────┐
│  [!] cloudflared 미설치 — localhost fallback으로 동작합니다  │
│                                                             │
│  외부 배포를 위해 cloudflared 설치를 권장합니다:            │
│                                                             │
│  Windows  : winget install Cloudflare.cloudflared          │
│  macOS    : brew install cloudflared                        │
│  Linux    : https://pkg.cloudflare.com/                    │
│                                                             │
│  설치 후 서버를 재시작하면 자동으로 터널이 생성됩니다.      │
│  또는 MCP_TUNNEL_URL 환경변수로 URL을 수동 지정할 수 있습니다│
└─────────────────────────────────────────────────────────────┘
"""
    # logging보다 print 사용 — 포맷 없이 그대로 출력
    print(guide, file=sys.stderr)
    log.warning("cloudflared 미설치 — localhost fallback 활성화")
