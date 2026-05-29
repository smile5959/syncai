#!/bin/bash
set -e

echo ""
echo " SyncAI MCP Server - Linux/Mac 시작 스크립트"
echo " ============================================="

# .env 파일 없으면 예시 파일 복사
if [ ! -f .env ]; then
    echo " [!] .env 파일이 없습니다. .env.example 을 복사합니다."
    cp .env.example .env
    echo " [!] .env 파일을 열어 MCP_BASE_DIR 와 MCP_AUTH_TOKEN 을 설정하세요."
    ${EDITOR:-nano} .env
fi

# 가상환경 없으면 생성
if [ ! -d venv ]; then
    echo " [*] 가상환경 생성 중..."
    python3 -m venv venv
fi

# 활성화 및 패키지 설치
source venv/bin/activate
pip install -r requirements.txt -q

echo ""

# cloudflared 설치 여부 확인
if command -v cloudflared &> /dev/null; then
    echo " [*] cloudflared 설치 확인 - 서버 시작 시 자동으로 터널을 생성합니다."
else
    echo " [!] cloudflared 미설치 - localhost 모드로 동작합니다."
    echo " [!] 외부 배포를 원하면 cloudflared를 설치하세요:"
    echo " [!]   macOS : brew install cloudflared"
    echo " [!]   Linux : https://pkg.cloudflare.com/"
fi

echo ""
echo " [*] MCP 서버를 시작합니다..."
echo ""

python server.py
