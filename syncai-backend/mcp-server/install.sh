#!/usr/bin/env bash
# ============================================================
# SyncAI MCP Server Installer — macOS
# ============================================================
#
# 사용법 (프론트에서 생성된 명령어):
#   curl -fsSL "https://syncai-backend.fly.dev/install.sh" | bash -s -- --token=TOKEN
#
# 수동 실행:
#   bash install.sh --token=TOKEN [--base-dir=/path/to/project]
#
# 설치 위치:
#   ~/Library/Application Support/SyncAI/
#
# 서비스 관리 (LaunchAgent):
#   시작:  launchctl load -w ~/Library/LaunchAgents/com.syncai.mcp.plist
#   중지:  launchctl unload ~/Library/LaunchAgents/com.syncai.mcp.plist
#   로그:  tail -f ~/Library/Logs/SyncAI/server.log
# ============================================================

set -euo pipefail

BACKEND_URL="https://syncai-backend.fly.dev"
APP_DIR="$HOME/Library/Application Support/SyncAI"
LOG_DIR="$HOME/Library/Logs/SyncAI"
VENV_DIR="$APP_DIR/venv"
CODE_DIR="$APP_DIR/code"
ENV_FILE="$APP_DIR/.env"
PLIST_LABEL="com.syncai.mcp"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

# 색상
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
TOKEN=""
BASE_DIR=""
for arg in "$@"; do
  case "$arg" in
    --token=*)    TOKEN="${arg#*=}" ;;
    --base-dir=*) BASE_DIR="${arg#*=}" ;;
  esac
done

echo ""
echo -e "${BLUE}┌─────────────────────────────────────┐${NC}"
echo -e "${BLUE}│     SyncAI MCP Server 설치 중...    │${NC}"
echo -e "${BLUE}└─────────────────────────────────────┘${NC}"
echo ""

# ── macOS 확인 ────────────────────────────────────────────────────────────────
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo -e "${RED}[오류] 이 스크립트는 macOS 전용입니다.${NC}"
  exit 1
fi

# ── 토큰 확인 ─────────────────────────────────────────────────────────────────
if [ -z "$TOKEN" ]; then
  echo -e "${RED}[오류] --token 인자가 필요합니다.${NC}"
  echo ""
  echo "SyncAI 웹앱 → MCP 설정 → 내 MCP → 새 MCP 등록 후"
  echo "표시되는 설치 명령어를 복사해서 실행해주세요."
  exit 1
fi

# ── Python 3.10+ 확인 ─────────────────────────────────────────────────────────
# Homebrew PATH가 없을 수 있으므로 절대경로도 포함
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PYTHON=""
for py in \
  /opt/homebrew/bin/python3.14 \
  /opt/homebrew/bin/python3.13 \
  /opt/homebrew/bin/python3.12 \
  /opt/homebrew/bin/python3.11 \
  /opt/homebrew/bin/python3.10 \
  /opt/homebrew/bin/python3 \
  /usr/local/bin/python3 \
  python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if [ -x "$py" ] || command -v "$py" &>/dev/null; then
    VER=$("$py" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null) || continue
    MAJ=$(echo "$VER" | cut -d. -f1)
    MIN=$(echo "$VER" | cut -d. -f2)
    if [ "$MAJ" -ge 3 ] && [ "$MIN" -ge 10 ]; then
      PYTHON="$py"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo -e "${RED}[오류] Python 3.10 이상이 필요합니다.${NC}"
  echo ""
  echo "다음 명령어로 설치해주세요:"
  echo "  brew install python3"
  exit 1
fi

echo -e "${GREEN}✓ Python $VER ($PYTHON)${NC}"

# ── 디렉터리 생성 ─────────────────────────────────────────────────────────────
mkdir -p "$APP_DIR" "$LOG_DIR" "$CODE_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# ── 서버 코드 다운로드 ────────────────────────────────────────────────────────
echo "서버 코드 다운로드 중..."
VERSION_JSON=$(curl -sf "$BACKEND_URL/v1/mcp-version" 2>/dev/null || echo "{}")
DOWNLOAD_URL=$(echo "$VERSION_JSON" | "$PYTHON" -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('download_url',''))" 2>/dev/null || echo "")

if [ -z "$DOWNLOAD_URL" ]; then
  echo -e "${YELLOW}⚠ 자동 다운로드 실패 — 기존 코드 유지합니다.${NC}"
else
  TMP_ZIP=$(mktemp /tmp/syncai-XXXXXX.zip)
  if curl -fsSL "$DOWNLOAD_URL" -o "$TMP_ZIP" 2>/dev/null; then
    unzip -qo "$TMP_ZIP" -d "$CODE_DIR"
    rm -f "$TMP_ZIP"
    echo -e "${GREEN}✓ 서버 코드 설치 완료${NC}"
  else
    rm -f "$TMP_ZIP"
    echo -e "${YELLOW}⚠ 코드 다운로드 실패 — 기존 코드 유지합니다.${NC}"
  fi
fi

if [ ! -f "$CODE_DIR/server.py" ]; then
  echo -e "${RED}[오류] server.py가 없습니다. 네트워크를 확인 후 다시 실행해주세요.${NC}"
  exit 1
fi

# ── Python 가상환경 + 의존성 설치 ────────────────────────────────────────────
echo "Python 환경 설정 중..."
if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON" -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python3"
VENV_PIP="$VENV_DIR/bin/pip"

"$VENV_PIP" install -q --upgrade pip

REQ_FILE="$CODE_DIR/requirements.txt"
if [ -f "$REQ_FILE" ]; then
  "$VENV_PIP" install -q -r "$REQ_FILE"
fi
echo -e "${GREEN}✓ Python 환경 준비 완료${NC}"

# ── cloudflared 설치 확인 ─────────────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
  if command -v brew &>/dev/null; then
    echo "cloudflared 설치 중..."
    brew install cloudflared -q && echo -e "${GREEN}✓ cloudflared 설치 완료${NC}" \
      || echo -e "${YELLOW}⚠ cloudflared 설치 실패 — 나중에 수동 설치: brew install cloudflared${NC}"
  else
    echo -e "${YELLOW}⚠ cloudflared 미설치 — 외부 접속이 필요하면: brew install cloudflared${NC}"
  fi
fi

# ── .env 작성 ─────────────────────────────────────────────────────────────────
{
  echo "SYNCAI_BACKEND_URL=$BACKEND_URL"
  echo "MCP_AUTH_TOKEN=$TOKEN"
  [ -n "$BASE_DIR" ] && echo "MCP_BASE_DIR=$BASE_DIR"
} > "$ENV_FILE"
echo -e "${GREEN}✓ 설정 파일 생성${NC}"

# ── LaunchAgent plist 생성 ────────────────────────────────────────────────────
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${VENV_PY}</string>
        <string>${CODE_DIR}/server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${APP_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/server.err</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST

# ── 기존 서비스 중지 + 재시작 ─────────────────────────────────────────────────
launchctl unload "$PLIST_PATH" 2>/dev/null || true
sleep 1
launchctl load -w "$PLIST_PATH"
echo -e "${GREEN}✓ 서비스 등록 및 시작 완료${NC}"

# ── 완료 메시지 ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}🎉 SyncAI MCP 설치 완료!${NC}"
echo ""
echo "MCP 서버가 백그라운드에서 실행 중입니다."
echo "SyncAI 웹앱에서 자동으로 '온라인' 상태로 표시됩니다."
echo ""
echo -e "${BLUE}유용한 명령어:${NC}"
echo "  로그 보기:   tail -f \"$LOG_DIR/server.log\""
echo "  서비스 중지: launchctl unload \"$PLIST_PATH\""
echo "  서비스 시작: launchctl load -w \"$PLIST_PATH\""
echo "  제거:        launchctl unload \"$PLIST_PATH\" && rm \"$PLIST_PATH\""
