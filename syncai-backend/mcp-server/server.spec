# -*- mode: python ; coding: utf-8 -*-
"""
SyncAI MCP Server — PyInstaller 빌드 스펙
==========================================

빌드 커맨드 (mcp-server/ 폴더에서 실행):
  pyinstaller server.spec

결과: dist/server/ 폴더 — Inno Setup이 이 폴더를 통째로 설치 경로에 복사.
  dist/server/
  ├── server.exe         ← 실행 파일 (WinSW가 이 파일을 서비스로 등록)
  ├── cloudflared.exe    ← Cloudflare Tunnel 클라이언트 (server.exe와 같은 폴더)
  └── _internal/         ← Python 런타임 + 의존성 (자동 생성, 건드리지 말 것)

자동 업데이트 구조:
  server.exe = bootstrap.py (Python 런타임만 포함)
  실제 코드  = %APPDATA%\SyncAI\code\ (code.zip으로 배포, 자동 업데이트)

주의사항:
  - cloudflared.exe가 mcp-server/ 폴더에 있어야 빌드에 포함됨.
    없으면 빌드 오류 발생. 미리 다운로드:
    https://github.com/cloudflare/cloudflared/releases
    → cloudflared-windows-amd64.exe 다운로드 후 cloudflared.exe로 이름 변경
  - .env는 빌드에서 제외 — 설치 시 Inno Setup이 생성함.
  - PyInstaller는 반드시 Windows에서 실행해야 함 (cross-compile 불가).
  - 빌드 환경: pip install pyinstaller uvicorn[standard] fastapi httpx python-dotenv
"""

block_cipher = None

a = Analysis(
    ['bootstrap.py'],
    pathex=['.'],           # mcp-server/ 폴더를 탐색 경로에 추가
    binaries=[
        # cloudflared.exe를 dist/server/ 루트에 직접 배치
        # (server.exe와 같은 디렉토리 → config._APP_DIR로 탐색 가능)
        ('cloudflared.exe', '.'),
    ],
    datas=[],
    hiddenimports=[
        # ── uvicorn 내부 모듈 (동적 import로 PyInstaller가 자동 감지 못함) ──
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.middleware',
        'uvicorn.middleware.proxy_headers',
        # ── FastAPI / Starlette ──
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'starlette',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.responses',
        'starlette.routing',
        'starlette.applications',
        # ── anyio 백엔드 (asyncio 이벤트 루프) ──
        'anyio',
        'anyio._backends._asyncio',
        'anyio._backends._trio',
        'anyio.streams',
        'anyio.streams.memory',
        # ── uvicorn[standard] 추가 의존성 ──
        'httptools',           # HTTP 파서 (선택, 없으면 h11 폴백)
        'httptools.parser',
        'h11',
        # ── python-dotenv ──
        'dotenv',
        # ── httpx (heartbeat HTTP 클라이언트) ──
        'httpx',
        'httpx._transports',
        'httpx._transports.default',
        # ── 로컬 모듈은 번들에서 제외 ──
        # heartbeat.py, server.py, config.py, tools.py, ws_client.py, tunnel.py 는
        # %APPDATA%\SyncAI\code\ 에 code.zip으로 배포되어 런타임에 로드됨.
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 빌드 도구 / 테스트 프레임워크 — 불필요
        'pytest',
        'setuptools',
        'pip',
        'wheel',
        # GUI 라이브러리 중 불필요한 것
        # (tkinter는 pick-folder 다이얼로그에 사용 → 제외하지 말 것)
        'matplotlib',
        'numpy',
        'pandas',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,      # onedir 방식 — 의존성을 _internal/에 분리
    name='server',              # 결과: dist/server/server.exe
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,                   # UPX 압축 (설치 크기 감소)
    console=True,               # 콘솔 모드 — WinSW 서비스로 실행 시 stdout/stderr 로그 캡처
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # 아이콘: 코드 서명 인증서 구매 후 여기에 경로 지정
    # icon='syncai.ico',
)

# ── url_handler.exe — syncai:// URL 스킴 핸들러 ──────────────────────────────
a_uh = Analysis(
    ['url_handler.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)

pyz_uh = PYZ(a_uh.pure, a_uh.zipped_data, cipher=block_cipher)

exe_uh = EXE(
    pyz_uh,
    a_uh.scripts,
    [],
    exclude_binaries=True,
    name='url_handler',         # 결과: dist/server/url_handler.exe
    debug=False,
    strip=False,
    upx=True,
    console=False,              # 창 없이 실행
)

coll = COLLECT(
    exe,
    exe_uh,                     # url_handler.exe도 dist/server/에 포함
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[
        'cloudflared.exe',
    ],
    name='server',
)
