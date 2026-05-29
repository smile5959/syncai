# SyncAI 로컬 실행 가이드

## 사전 준비
- Docker Desktop 실행 중
- Python 3.11+ (권장: 3.11 ~ 3.13 / Python 3.14는 일부 제한 있음)
- Node.js 18+
- Cloudflare 계정 (터널용, 선택)

---

## 1. 백엔드 세팅

```bash
cd syncai-backend

# 환경변수 설정
cp .env.example .env
# .env 열어서 GEMINI_API_KEY, SECRET_KEY 등 입력

# PostgreSQL(5433) + Redis 실행
docker-compose up -d

# Python 패키지 설치
pip install -r requirements.txt

# DB 마이그레이션
python -m alembic upgrade head
```

---

## 2. 백엔드 서버 실행

터미널 2개 필요

```bash
# 터미널 1 — API 서버 (--reload 제거, Python 3.14 버그)
python -m uvicorn app.main:app --port 8001

# 터미널 2 — ARQ Worker (heartbeat 크론잡용)
python run_worker.py
```

API 문서 확인: http://localhost:8001/docs

> **Note** AI 태스크는 FastAPI 인-프로세스(`asyncio.create_task`)로 실행됩니다.
> ARQ Worker는 heartbeat 크론잡 전용으로만 사용됩니다.

---

## 3. MCP 서버 세팅 (로컬 파일 연동)

Worker AI가 실제로 파일을 읽고 쓰려면 MCP 서버를 로컬 PC에서 실행해야 합니다.

```bash
cd syncai-backend/mcp-server

# 환경변수 설정
cp .env.example .env
```

### 3-1. MCP_BASE_DIR 설정 (필수)

`.env` 파일을 열어 **본인의 프로젝트 폴더**로 변경합니다.

```dotenv
# Windows
MCP_BASE_DIR=C:/Users/me/my-project

# macOS / Linux
MCP_BASE_DIR=/home/me/my-project
```

> ⚠️ **팀원마다 경로가 다릅니다.** 각자 본인 PC의 절대 경로를 입력하세요.
> AI는 이 경로 안의 파일만 읽고 쓸 수 있습니다.

**대안 — SyncAI 모달로 설정 (권장)**

Worker 등록/수정 모달의 **"접근 허용 경로"** 필드에 경로를 입력하면
백엔드가 heartbeat 응답에 해당 값을 포함해 MCP 서버로 전달합니다.
MCP 서버가 **재시작 없이** 런타임에 BASE_DIR을 갱신합니다.

### 3-2. 인증 토큰 설정

```dotenv
MCP_AUTH_TOKEN=your-secret-token-here   # ← 실제 토큰으로 교체
```

Worker 등록 모달의 **"인증 토큰"** 필드에 동일한 값을 입력합니다.

### 3-3. Heartbeat 설정

```dotenv
SYNCAI_BACKEND_URL=http://localhost:8001
SYNCAI_WORKER_ID=<Worker 등록 후 발급된 UUID>
SYNCAI_TOKEN=<SyncAI 로그인 JWT>
```

### 3-4. MCP 서버 실행

```bash
python server.py
# 포트: 7860 (기본값)
```

---

## 4. Cloudflare Tunnel 설정 (외부 접근용)

로컬 MCP 서버를 SyncAI 백엔드에서 접근할 수 있도록 터널링합니다.
팀원 PC와 백엔드가 같은 로컬 네트워크라면 생략 가능합니다.

```bash
# cloudflared 설치
brew install cloudflare/cloudflare/cloudflared  # macOS
# Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# 터널 생성 (MCP 포트 7860 노출)
cloudflared tunnel --url http://localhost:7860
# 출력 예: https://abc-def-123.trycloudflare.com
```

출력된 URL이 Worker 등록 모달의 **MCP 엔드포인트** 값입니다.

---

## 5. Worker 등록 순서

1. SyncAI에 로그인 → 팀 생성
2. 채팅방 우상단 ⚙️ → **MCP 연결 설정** 모달 열기
3. 입력:
   - **Worker 이름**: 예) `내 맥북 Pro`
   - **MCP 엔드포인트**: Cloudflare Tunnel URL (또는 `http://localhost:7860`)
   - **인증 토큰**: `.env`의 `MCP_AUTH_TOKEN` 값
   - **접근 허용 경로**: AI가 접근할 로컬 폴더 절대경로
4. **연결하기** → Worker 패널에서 🟢 온라인 확인

---

## 6. 전체 AI 흐름

```
/ai 커맨드 입력
  └→ POST /v1/rooms/:id/ai
       └→ Task 생성 (status: pending)
            └→ asyncio.create_task(_run_ai_task)
                 ├→ Supervisor (Gemini 2.5 Flash) 분석
                 ├→ tool_use: list_directory → MCP → 로컬 파일 목록
                 ├→ tool_use: read_file → MCP → 파일 내용
                 ├→ tool_use: write_file → MCP → 파일 수정
                 └→ 완료: WS broadcast (task_completed + ai_res)
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| Worker offline | heartbeat 미전송 | MCP 서버(`python server.py`) 실행 + `.env` SYNCAI_* 설정 확인 |
| MCP 401 오류 | 토큰 불일치 | MCP `.env`의 `MCP_AUTH_TOKEN`과 모달 입력값 일치 확인 |
| MCP 접근 거부 | BASE_DIR 밖 경로 | `MCP_BASE_DIR`을 올바른 프로젝트 루트로 수정 |
| Tunnel URL 만료 | cloudflared 재시작 필요 | `cloudflared tunnel` 재실행 후 모달에서 엔드포인트 업데이트 |
| `uvicorn --reload` 오류 | Python 3.14 버그 | `--reload` 제거하고 실행 |
| ARQ worker 오류 | Python 3.14 event loop | `python run_worker.py` 사용 |
| PostgreSQL 연결 실패 | 포트 충돌 | 포트 5433 사용 중인지 확인 (`docker-compose.yml`) |
