# SyncAI

> **팀 채팅 기반 AI 코드 에이전트 플랫폼**

채팅방에서 `/ai @MCP이름 지시사항`을 입력하면 AI가 로컬 PC의 파일을 직접 수정하고, 결과를 채팅으로 리포트합니다.
외부 앱(GitHub, Gmail 등) 연동과 Tauri 기반 macOS 데스크탑 앱을 직접 구현한 개인 프로젝트입니다.

🔗 [데모 (개발 중)](https://syncai.vercel.app)

---

## 시스템 개요

```
채팅창 /ai 명령
        ↓
  FastAPI Backend (Fly.io)
        ↓
  ┌─────────────────────────────────────┐
  │  Supervisor LLM (계획 수립)          │
  │    ↓ needs_mcp / needs_composio     │
  │  Worker LLM (실행)                  │
  │    ├─ MCP → 로컬 PC 파일 수정       │
  │    └─ Composio → 외부 앱 API 호출   │
  └─────────────────────────────────────┘
        ↓
  WebSocket broadcast → 채팅 결과 표시
```

---

## 주요 기능

- **AI 코드 에이전트** — 채팅 명령으로 로컬 파일 읽기·수정·생성, 커맨드 실행
- **외부 앱 연동** — Composio를 통해 GitHub, Gmail, Slack 등 100+ 앱과 연결
- **멀티플랫폼** — 웹(Vercel) + 데스크탑 앱(Tauri, macOS)
- **보안 설계** — path traversal 방어, MCP 토큰 90일 자동 교체, WS 인가 체크

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| **Backend** | Python · FastAPI · SQLAlchemy · PostgreSQL (Neon) · Redis (Upstash) |
| **Frontend** | Next.js App Router · TypeScript · Tailwind CSS v4 · Zustand |
| **AI** | Gemini 2.5 Flash · MCP(JSON-RPC 2.0) · Composio (외부 앱 연동) |
| **Desktop** | Tauri (Rust) — macOS |
| **Infra** | Fly.io (백엔드) · Vercel (프론트) · GitHub Actions (CI/CD) |

---

## 아키텍처 특징

### MCP (Model Context Protocol)
- WebSocket **역방향 연결** — 서버가 클라이언트(로컬 PC)로 MCP 명령 전달
- 파일 접근 보안: path traversal·`~` 우회·`.ssh/.aws/.pem` 등 차단
- 토큰 90일 자동 교체 — heartbeat 기반 무중단 갱신

### AI 처리 흐름
- Supervisor LLM → `needs_mcp` / `needs_composio` 판단 → Worker LLM 실행
- 사용자 승인 단계(`awaiting_confirm`) 포함 — 파괴적 작업 전 확인
- `tool_calls + stop` 동시 반환(Gemini 특이 동작) 대응

### WebSocket
- 채팅 WS + 태스크 WS 분리 운영
- 룸/태스크 비멤버 구독 차단 (4003/4004 close 코드)
- Exponential backoff 재연결 (3s→6s→12s→24s→30s)

### Tauri 데스크탑
- Next.js `output: 'export'` static build + `__placeholder__` 라우팅 트릭
- WS 쿠키 없음 → `?token=` 쿼리 파라미터, localStorage 기반 인증
- `window.confirm()` 미지원(WKWebView) → 커스텀 React 확인 다이얼로그

---

## 개발 중 (Roadmap)

- **팀 협업** — 팀 단위 채팅방, 역할 기반 MCP 공유
- **Windows 데스크탑 앱** — Tauri Windows 빌드 지원

---

## 시작하기

### 요구 사항
- Python 3.11+ / Node.js 18+
- PostgreSQL · Redis
- Gemini API Key

### 환경 변수

```env
# Backend
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
GEMINI_API_KEY=...
COMPOSIO_API_KEY=...   # 외부 앱 연동 시

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

### 실행

```bash
# Backend
cd syncai-backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd syncai-frontend
npm install
npm run dev
```

---

## 프로젝트 구조

```
syncai/
├── syncai-backend/
│   └── app/
│       ├── agents/     # worker_llm.py, supervisor.py
│       ├── routers/    # messages.py, ws.py, rooms.py, teams.py
│       ├── services/   # composio_service.py
│       └── core/       # auth.py, redis_client.py
├── syncai-frontend/
│   └── src/
│       ├── app/(app)/  # rooms, settings, integrations 페이지
│       ├── components/ # chat, layout, worker 컴포넌트
│       ├── store/      # auth.ts, rooms.ts (Zustand)
│       └── lib/        # api.ts, ws.ts
└── syncai-desktop/     # Tauri 데스크탑 앱
```
