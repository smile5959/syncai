# SyncAI — Claude Code 컨텍스트

## 프로젝트
팀 채팅에서 `/ai @MCP이름 지시사항` → AI가 로컬 PC 파일 수정 → 결과를 채팅에 표시.
레포: https://github.com/smile5959/syncai

## 기술 스택
| 영역 | 기술 |
|------|------|
| Backend | FastAPI + Python, PostgreSQL (Neon), Redis (Upstash), Fly.io (Tokyo nrt) |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS v4, Zustand, Vercel |
| AI | Gemini 2.5 Flash (worker), supervisor는 worker와 동일 모델 사용 (OpenRouter :free 유료화 대응) |
| MCP | FastAPI JSON-RPC 2.0, WebSocket 역방향 연결, 로컬 macOS/Windows 실행 |

## 디렉토리 구조
```
syncai/
├── syncai-backend/app/
│   ├── agents/        # worker_llm.py, supervisor.py, worker.py
│   ├── routers/       # messages.py, ws.py, rooms.py, teams.py, workers.py, mcp_configs.py
│   ├── models/        # SQLAlchemy 모델
│   └── core/          # deps.py, auth.py
└── syncai-frontend/src/
    ├── app/(app)/rooms/          # layout.tsx, page.tsx, [id]/RoomPageClient.tsx
    ├── components/chat/          # message-item.tsx, chat-input.tsx
    ├── components/layout/        # room-sidebar.tsx, icon-nav.tsx
    ├── components/worker/        # worker-panel.tsx, mcp-settings-modal.tsx
    ├── store/                    # auth.ts, rooms.ts
    └── lib/                      # api.ts, ws.ts
```

## 핵심 아키텍처

### WebSocket
- chat WS: `wss://.../rooms/{room_id}/chat`, task WS: `wss://.../rooms/{room_id}/tasks`
- broadcast 형식: `{type:"message", data:{id, room_id, user_id, content, type, created_at}}`
- **`created_at` 반드시 `+ "Z"`** — 없으면 한국 브라우저가 UTC를 KST로 파싱, 9시간 오차
- room_id: URL slug로 오지만 내부는 UUID — `chat_connections` 키 반드시 UUID
- layout WS: rooms 변경 시 **델타 처리만** (추가/삭제), 전체 재생성 없음 — CONNECTING 상태 강제 close 오류 방지
- SyncWS 재연결: exponential backoff (3s→6s→12s→24s→30s max)

### Tauri 데스크탑 앱
- `output: 'export'` static build — SSR 없음, `rooms/[id]`는 `__placeholder__` 하나만 pre-build
- `lib.rs` initialization_script: fetch 가로채서 `/rooms/<id>/` → `/rooms/__placeholder__/` 리다이렉트
- **실제 room_id**: `useParams()`/`usePathname()` 모두 `__placeholder__` 반환 → `window.location.pathname` 직접 파싱
- 현재 방 활성 표시: `useParams()` 대신 `store.currentRoomUuid` 사용 (rooms-store에 UUID 저장됨)
- WS: 쿠키 없음 → `?token=` 쿼리 파라미터, localStorage에서 읽음
- 배경 WS 연결: 3초+idx×300ms 스태거 (cold start 중 연결 폭탄 방지)

### AI 처리 흐름
```
/ai 명령
  → MCP 없으면: planning 스킵 → chat-only (1-hop)
  → MCP 있으면: supervisor planning → needs_mcp 판단
      → false: chat-only (available_mcp_names 전달)
      → true: awaiting_confirm → 동의 → MCP 실행
```
- `worker_llm.py`: tool_calls 있으면 finish_reason 무시 (Gemini stop+tool_calls 동시 반환 대응)

### DB / 삭제 주의사항
- `require_room_access(room_id, user, db)` → room 객체 반환, 이후 `room.id`(UUID) 사용
- 팀 삭제 cascade 순서: FileLock(task_id) → Task(room) → Message → RoomMember → ChatRoom → **FileLock(worker_id)** → **Task.worker_id=null** → Worker → McpConfigTeam → TeamInvitation → TeamMember → Team
  - worker_id 기반 FileLock 정리 필수 (task_id만으론 잔여 락 누락)

### 인증
- JWT access_token + refresh_token (쿠키 / Tauri는 localStorage)
- WS 4001 close: token 만료 → refresh 시도 → 실패 시 logout

### Fly.io cold start
- 5분 idle 시 suspend → 첫 요청 5-10초 지연
- 로그인 화면 + AppLayout mount 시 `/health` ping + 4분 interval로 해결

### 환경변수
- `.env.production` 커밋됨 (NEXT_PUBLIC_* 만 포함, 시크릿 없음)
- `NEXT_PUBLIC_API_URL=https://syncai-backend.fly.dev/v1`
- `NEXT_PUBLIC_WS_URL=wss://syncai-backend.fly.dev/ws`

## 배포
- 백엔드: `syncai-backend/**` push → GitHub Actions → Fly.io 자동
- 프론트: `main` push → Vercel 자동
- MCP 릴리즈: `gh workflow run "Release MCP Code Bundle" --field version=X.X.X`

## 주요 파일
| 기능 | 파일 |
|------|------|
| 채팅방 클라이언트 | `syncai-frontend/src/app/(app)/rooms/[id]/RoomPageClient.tsx` |
| 방 목록 레이아웃 (unread, layout WS) | `syncai-frontend/src/app/(app)/rooms/layout.tsx` |
| WS 클라이언트 | `syncai-frontend/src/lib/ws.ts` |
| WS 서버 | `syncai-backend/app/routers/ws.py` |
| 메시지 API + AI 플로우 | `syncai-backend/app/routers/messages.py` |
| AI Worker LLM | `syncai-backend/app/agents/worker_llm.py` |
| 팀/방 삭제 API | `syncai-backend/app/routers/teams.py`, `rooms.py` |
| 사이드바 | `syncai-frontend/src/components/layout/room-sidebar.tsx` |
| 팀 아이콘 네비 | `syncai-frontend/src/components/layout/icon-nav.tsx` |
| 상태: 방 목록 + unread | `syncai-frontend/src/store/rooms.ts` |
