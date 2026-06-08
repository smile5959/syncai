"""
SyncAI URL Scheme Handler
Registered in Windows Registry as handler for syncai:// URLs.
Called by Windows when the browser navigates to syncai://auth?token=...

Usage: url_handler.exe "syncai://auth?token=...&state=..."
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PENDING_DIR = Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "SyncAI"
LOG_PATH = PENDING_DIR / "url-handler.log"


def main():
    if len(sys.argv) < 2:
        _log("ERROR: no URL argument")
        sys.exit(1)

    url = sys.argv[1]
    _log(f"Received URL: {url}")

    if not url.startswith("syncai://"):
        _log(f"ERROR: unexpected URL scheme: {url}")
        sys.exit(1)

    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    token = qs.get("token", [""])[0].strip()

    if not token:
        _log(f"ERROR: no token in URL: {url}")
        sys.exit(1)

    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    pending_path = PENDING_DIR / "pending_token.txt"
    pending_path.write_text(token, encoding="utf-8")
    _restrict_file_acl(pending_path)
    _log(f"OK: token staged → {pending_path}")


def _restrict_file_acl(path: Path) -> None:
    """현재 사용자 + SYSTEM 만 읽을 수 있도록 Windows ACL 설정."""
    try:
        username = os.environ.get("USERNAME", "")
        cmd = ["icacls", str(path), "/inheritance:r"]
        if username:
            cmd += ["/grant:r", f"{username}:(F)"]
        cmd += ["/grant:r", "SYSTEM:(F)"]
        subprocess.run(cmd, check=False, capture_output=True)
    except Exception:
        pass  # icacls 실패해도 계속 진행


def _log(msg: str):
    try:
        PENDING_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass
    print(msg)


if __name__ == "__main__":
    main()
