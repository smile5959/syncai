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
│   ├── agents/        # worker_llm.py, supervisor.py
│   ├── routers/       # messages.py, ws.py, rooms.py, teams.py, workers.py, mcp_configs.py
│   ├── models/        # SQLAlchemy 모델
│   └── core/          # deps.py, auth.py, redis_client.py
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
- **`created_at` 포맷**: `datetime.utcnow().isoformat() + "Z"` 사용 — `datetime.now(timezone.utc).isoformat()` 은 `"...+00:00"` 반환, 뒤에 `"Z"` 붙이면 `"...+00:00Z"` (이중 타임존) → JS `Invalid Date`
- room_id: URL slug로 오지만 내부는 UUID — `chat_connections` 키 반드시 UUID
- layout WS: rooms 변경 시 **델타 처리만** (추가/삭제), 전체 재생성 없음 — CONNECTING 상태 강제 close 오류 방지
- SyncWS 재연결: exponential backoff (3s→6s→12s→24s→30s max)
- **SyncWS.close()**: CONNECTING 상태엔 `.close()` 호출 안 함 → `onopen`에서 `this.closed` 체크 후 정상 close (브라우저 에러 방지)

### Tauri 데스크탑 앱
- `output: 'export'` static build — SSR 없음, `rooms/[id]`는 `__placeholder__` 하나만 pre-build
- `lib.rs` initialization_script: fetch 가로채서 `/rooms/<id>/` → `/rooms/__placeholder__/` 리다이렉트
- **실제 room_id**: `useParams()`/`usePathname()` 모두 `__placeholder__` 반환 → `window.location.pathname` 직접 파싱
- 현재 방 활성 표시: `useParams()` 대신 `store.currentRoomUuid` 사용 (rooms-store에 UUID 저장됨)
- WS: 쿠키 없음 → `?token=` 쿼리 파라미터, localStorage에서 읽음
- 배경 WS 연결: 3초+idx×300ms 스태거 (cold start 중 연결 폭탄 방지)
- **빌드**: `npm run build:tauri` → `scripts/tauri-build.sh` 실행 (page.tsx ↔ page.tauri.tsx 교체 후 복원)
- `page.tsx` = Vercel용(`dynamicParams=true`), `page.tauri.tsx` = Tauri용(`generateStaticParams`)
  - `dynamicParams=true`와 `output:export` 동시 사용 불가 — 반드시 분리 유지

### Tauri 다이얼로그 주의사항
- macOS WKWebView는 `window.confirm()` / `window.alert()` / `window.prompt()`를 **구현하지 않음**
  - 호출하면 팝업 없이 조용히 `false`(confirm) / `undefined`(prompt) 반환 — 무반응처럼 보임
  - `tauri-plugin-dialog`을 추가하거나 커스텀 React 모달을 써야 함
- **삭제/확인 UI 패턴**: `useConfirm()` 훅 사용 — `src/components/ui/confirm-dialog.tsx`
  - `ConfirmDialogProvider`를 `(app)/layout.tsx`에서 감싸고 있음
  - `const confirm = useConfirm(); if (!(await confirm("..."))) return;` 패턴으로 사용
  - Esc 취소 / Enter 확인 키보드 단축키 포함
  - **절대 `window.confirm()` 직접 호출 금지** — Tauri 데스크탑에서 항상 무반응

### AI 처리 흐름
```
/ai 명령
  → _send_ai_plan: Composio 연결 앱 목록 조회 (get_connected_app_names)
  → MCP도 없고 Composio도 없고 멘션도 없으면: planning 스킵 → chat-only (1-hop)
  → planning (needs_mcp / needs_composio 판단)
      → needs_composio=true, composio_app 있음:
          → 미연결 앱 → 채팅 에러 + /integrations 안내
          → 연결됨 → awaiting_confirm → 동의 → _run_composio_task (로컬 MCP 불필요)
      → needs_mcp=true:
          → 유저 MCP 미등록 → 채팅 에러 즉시 반환
          → MCP 오프라인(mcp_broker.is_online) → 채팅 에러 즉시 반환
          → 정상: awaiting_confirm → 동의 → _run_ai_task (로컬 MCP)
      → 둘 다 false: chat-only (available_mcp_names 전달)
```
- `worker_llm.py`: tool_calls 있으면 finish_reason 무시 (Gemini stop+tool_calls 동시 반환 대응)
- `WorkerLLM`: `composio_tools` + `composio_executor` 파라미터 — `_MCP_TOOL_NAMES`에 없는 툴은 `composio_executor` 호출
- 에러 채팅 전송: `chat_connections` broadcast, `created_at` 반드시 `datetime.utcnow().isoformat() + "Z"` 포맷
- `_format_error_for_chat(error)`: 기술적 에러 → 한국어 친화적 문구 변환

### Composio 외부 앱 연동
- `COMPOSIO_API_KEY` 환경변수 필수 (config.py + Fly.io secret)
- **Composio API v3** 사용 (v1은 2026-06 전체 종료 — 410 Gone)
  - 앱 목록: `GET /api/v3/toolkits` → `{items:[{name,slug,meta:{description,logo,categories}}]}`
  - 연결 목록: `GET /api/v3/connected_accounts` → **user_id/status 파라미터를 Composio가 무시** → 응답에서 직접 필터 (`item.user_id == user_id and item.status == "ACTIVE"`)
  - 연결 시작: ① `GET /api/v3/auth_configs?toolkit_slug=X` → managed auth_config 조회 ② 없으면 `POST /api/v3/auth_configs` 생성 ③ `POST /api/v3/connected_accounts/link` → `redirect_url` 반환
  - 툴 실행: `POST /api/v3/tools/execute/{tool_slug}` body: `{user_id, arguments}`
  - 툴 목록: `GET /api/v3/tools?toolkit_slugs=X&important=true&limit=20`
- 연결 저장: Composio 서버에 `user_id=str(user.id)` — SyncAI DB에 토큰 없음
- `services/composio_service.py`: `get_connected_app_names(user_id)`, `get_tools_for_apps(slugs)`, `execute_action(user_id, tool_slug, params)`
  - **툴 스키마 sanitize 필수**: `get_tools_for_apps`는 `_sanitize_schema` → `_sanitize_key` 적용. Composio `input_parameters`에 `$schema`/`$defs`/공백 포함 키 등 LLM 비허용 필드가 있어 그대로 쓰면 "Provider returned error" (400) 발생
  - 허용 패턴: `^[a-zA-Z0-9_.-]{1,64}$` — `$`-prefix 키는 제거, 나머지 특수문자 `_` 치환, `type` 배열(`["string","null"]`) → non-null 단일 타입
- `routers/integrations.py`: `GET /v1/integrations/apps`, `POST /v1/integrations/connect`, `GET /v1/integrations/connections`, `DELETE /v1/integrations/connections/{id}`
- `AiConfirmRequest.composio_app`: confirm 요청에 포함 → `_run_composio_task` 라우팅 키

### AiPlanCard 승인 버튼
- `showButtons` 조건: `status === "idle"` AND `!isExpired` AND `isTriggerer` AND `taskStatus ∈ {awaiting_confirm, pending, undefined}`
- `isTriggerer = !currentUserId || plan.triggered_by === currentUserId` — **plan payload 기준** (task 로드 불필요)
- `plan_content` JSON 필드: `task_id, needs_mcp, needs_composio, composio_app, mcp_name, mcp_config_id, task_title, confirmation_message, task_plan, triggered_by`
- `task_plan`: 다이얼로그에 monospace 박스로 표시되는 워커 지시 1-3문장
- `task_awaiting_confirm` WS 이벤트: plan 전송 직후 `task_connections`로 broadcast, `{task_id, triggered_by}` 포함
- **`isExpired` 계산**: `useState(false)` + `useEffect` 내 `setInterval` 패턴 — `Date.now()`를 컴포넌트 바디에 쓰면 서버/클라이언트 값 불일치로 React hydration error #418 발생

### RoomPageClient teamId 주의
- `teamId`는 **`room.team_id` 우선** (`currentTeam`은 auth store의 마지막 선택 팀 — 방 팀과 다를 수 있음)
- `teamId = room?.team_id || currentTeam?.id || ""`
- room 팀 ≠ currentTeam이면 `teamsApi.get(room.team_id)`로 별도 fetch → `effectiveTeam` 사용
- MCP 설정 모달, 멤버 패널 등 모두 `effectiveTeam` 기준으로 렌더링

### MCP 선택 우선순위 (@멘션 없을 때)
1. 본인 소유 + 팀 연결 + 온라인
2. 팀 public + 온라인 (타 팀원 MCP)
3. Fallback: 팀 연결 없어도 본인 소유 온라인 config

### McpConfigTeam is_public / _ensure_team_links
- MCP 생성 시 `is_public=True` 기본값
- `_ensure_team_links`: 팀 가입 후 McpConfigTeam 없으면 `is_public=True`로 생성 (기존 False는 유지)
- `auto_register_mcp` case 1 (기존 토큰): `_ensure_team_links` 후 반드시 `db.commit()` 필요
- heartbeat에서도 `_ensure_team_links` 호출 — MCP 재연결 없이 팀 가입한 경우 대응

### 앱 초기화 — 전체 선로딩 패턴 (2026-06-26)

- `GET /v1/users/me/init` → `{ user, teams: [{ team, rooms, workers, mcp_configs }] }` 한 번에 반환
- `(app)/layout.tsx` mount 시 `meInit()` 1콜로 모든 데이터 초기화 (기존: `me()` + `myTeams()` 2콜)
- `teamsCache: Record<teamId, TeamInitData>` (rooms store) — 팀 전환 즉시 캐시에서 렌더, 네트워크 0
- cache miss 시에만 `teamsApi.init()` fallback → 성공 후 `updateTeamCache()` 호출 (재방문 cache hit 보장)
- `icon-nav.tsx`: `myTeams()` API 제거 → `storeTeams` (auth store `teams: Team[]`) 구독

**meInit catch 패턴 — redirect 루프 방지**
```typescript
.catch((err) => {
  const status = err?.response?.status;
  if (status === 401 || status === 403) logoutUser();
  // 5xx·네트워크 오류: 로그아웃 안 함
});
```
**절대 `logout()` + `router.replace("/login")` 쓰지 말 것** — `logout()`은 Zustand만 리셋, HttpOnly 쿠키 유지 → 미들웨어가 쿠키 보고 `/rooms`로 되돌리는 무한루프.

### Worker SSE 패턴 (2026-06-26)

- `GET /v1/teams/{team_id}/workers/stream` — SSE 엔드포인트 (`workers.py`)
  - 인증: cookie → Bearer header → `?token=` 쿼리 파라미터 (Tauri 대응)
  - DB 세션: 초기 snapshot 후 즉시 close → Redis pub/sub 시작 (연결 홀딩 방지)
  - `event: init` → worker 전체 목록 / `event: update` → 개별 worker 변경
- Redis 채널: `syncai:workers:{team_id}` — `_acquire_worker` / `_release_worker` 후 publish
- `rooms/layout.tsx`: `EventSource` 연결, 팀 전환 시 재연결 (`currentTeam?.id` dep)
- 기존 5초 폴링 완전 제거 (`RoomPageClient.tsx`)
- `import redis.asyncio as aioredis` — `redis==5.0.4`에 내장, 별도 패키지 불필요

### 채팅방 진입 성능 패턴 (2026-06-24)

- `GET /v1/rooms/{id}/init` → `{room, messages, next_cursor, tasks}` 단일 응답 (기존 3콜 → 1콜)
- `GET /v1/teams/{id}/init` → `{rooms, workers, mcp_configs}` 단일 응답 (기존 3콜 → 1콜)
- `RoomPageClient.tsx`: `roomsApi.init()` 1콜, workers/mcp는 `useRoomsStore`에서 읽음
- `lib/prefetch.ts`: 모듈 레벨 캐시(TTL 30초), 사이드바 hover → `prefetchRoom()` 트리거
  - 캐시 히트 → 즉시 렌더 후 백그라운드 갱신 / 미스 → 빈 화면 후 fetch
  - stale response 가드: `getRealRoomId() !== fetchId` 체크 (빠른 방 전환 race condition 방지)
- tasks N+1 수정 (`tasks.py`): message_id별 개별 쿼리 → `IN` 한 번으로 통합
- `require_room_access` 반환값 재사용 — get_room에서 이중 조회 제거

### DB / 삭제 주의사항
- `require_room_access(room_id, user, db)` → room 객체 반환, 이후 `room.id`(UUID) 사용
- 팀 삭제 cascade 순서: FileLock(task_id) → Task(room) → Message → RoomMember → ChatRoom → **FileLock(worker_id)** → **Task.worker_id=null** → Worker → McpConfigTeam → TeamInvitation → TeamMember → Team
  - worker_id 기반 FileLock 정리 필수 (task_id만으론 잔여 락 누락)

### 인증
- JWT access_token + refresh_token (쿠키 / Tauri는 localStorage)
- WS 4001 close: token 만료 → refresh 시도 → 실패 시 logout
- **로그인 critical path**: 절대 non-critical API (ex. `myTeams()`) await 금지 — Fly.io cold start에서 hang
  - navigate 후 레이아웃 컴포넌트에서 lazy 로딩
  - login page: mount-only `useEffect([])` + `loggingInRef` 로 race condition 방지
- **로그인 후 이동**: `router.push` 금지 → `window.location.href = "/rooms"` 필수
  - `router.push`(client-side nav)는 방금 `document.cookie`로 설정한 쿠키가 RSC 요청에 누락될 수 있어 미들웨어가 /login으로 되돌림
- **로그아웃**: `logoutUser()` async — `/api/auth/logout` await 후 `window.location.href = "/login"`
  - 쿠키가 `HttpOnly`이면 `document.cookie`로 삭제 불가 → 서버 응답(Set-Cookie) 받기 전에 navigate하면 미들웨어가 쿠키를 보고 /rooms로 되돌림
- **login/page.tsx**: `useSearchParams()` 사용 시 반드시 `<Suspense fallback={null}>` 로 감쌀 것 (Next.js App Router 빌드 요건)

### 페이지 레이아웃 패턴
- **설정/연동 페이지 공통 패턴**: `<main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>` + 내부 `<div style={{ maxWidth: 900, margin: "0 auto", padding: "0 28px 60px" }}>`
- **sticky 헤더 full-width 배경**: `marginLeft/Right: -28`, `paddingLeft/Right: 28` 음수 마진으로 컨테이너 경계 너머까지 배경 확장
- **설정 페이지**: maxWidth 820, padding 36px 28px 60px
- **연동 페이지**: maxWidth 900, padding 0 28px 60px

### 연동 페이지 카드 디자인 (2026-06-20 기준)
- 카드 패딩: 28px, border-radius: rounded-2xl
- 로고: 56×56px, 흰 배경, `box-shadow: 0 1px 4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.07)`
- 앱 이름: 16px bold, 카테고리: pill 뱃지 (bg-elevated + border)
- 버튼: height 40px, border-radius 10px, accent-bg 기본 → hover 시 accent 채움 + ArrowRight 이동

### 테마 시스템
- `html` 엘리먼트에 `dark` / `light` / `oat` 클래스 → `globals.css` CSS 변수 전환
- `theme-provider.tsx`: `type Theme = "dark" | "light" | "oat"`, localStorage `syncai-theme`
  - `toggle()`: dark → light → oat → dark 순환
  - `setTheme(t)`: 직접 지정 (설정 페이지 카드)
- **Oat 팔레트**: bg `#F7F3EC`, surface `#FDFAF5`, accent `#B87333` (copper), text `#2A1C0C`

### icon-nav 확장 패턴
- `globals.css` `.icon-nav-root` / `.icon-nav-label` 클래스로 hover 확장 구현
- 커서 1초 유지 → 68px → 210px (`transition-delay: 1s`), 이탈 즉시 축소 (`delay: 0s`)
- **JS state 쓰지 말 것** — setTimeout + setState는 React 렌더 타이밍 이슈로 동작 불안정
- 레이블: `max-width: 0 → 130px` + `opacity: 0 → 1` (delay 1.08s)
- 팀 이니셜: 3글자 (`name.slice(0, 3)`), 팀 아이콘 크기: 40px

### Fly.io cold start
- 5분 idle 시 suspend → 첫 요청 5-10초 지연
- 로그인 화면 + AppLayout mount 시 `/health` ping + 4분 interval로 해결

### Redis (Upstash) 재연결
- Upstash는 idle 연결을 끊음 → 앱이 hang되면서 health check 실패 → 503
- `app/core/redis_client.py`: 공유 sync Redis 풀, `health_check_interval=30`, `socket_keepalive=True`
- ws.py async `redis_subscriber()`도 동일 옵션 적용
- publish 실패 시 `_pool = None` 리셋 → 다음 호출에서 자동 재연결
- **절대 `sync_redis.from_url()` 매번 호출 금지** — `redis_client.publish()` 사용

### SQLAlchemy 커넥션 풀
- `pool_size=5, max_overflow=5, pool_pre_ping=True` (최대 10 연결)
- `pool_pre_ping=True`: Neon idle disconnect 대응 (사용 전 ping 체크)
- **pool_size=2 이하로 줄이면 동시 요청 시 QueuePool 30초 타임아웃 발생** — 경험상 최소 5 유지

### Worker 모델 드롭다운 위치
- `position:fixed` + `getBoundingClientRect()` 로 모달 overflow 제약 없이 표시
- 아래 공간 부족 시 위로 flip: `bottom: window.innerHeight - rect.top + 6` 사용 (top 계산 금지)
- `maxHeight`: 실제 여유 공간(`spaceAbove` or `spaceBelow`) 기준, `overflowY:auto`로 스크롤 지원

### MCP 설정 모달 아키텍처 (`mcp-settings-modal.tsx`)

- **탭 데이터**: `McpSettingsModal`에서 `listMine` + `listForTeam` 한 번에 fetch → `MyMcpTab` / `TeamVisibilityTab`에 props 전달
- **탭 전환**: `display:none` 방식 — unmount/remount 없음, 전환 시 API 재호출 없음
- **WS 핸들러 stale closure**: `useRef` 패턴으로 해결
  ```tsx
  const onReloadMineRef = useRef(onReloadMine);
  useEffect(() => { onReloadMineRef.current = onReloadMine; }, [onReloadMine]);
  useEffect(() => {
    const ws = createMcpWS(() => onReloadMineRef.current());
    ...
  }, []); // 빈 dep — ref로 최신 함수 참조
  ```
- **WS mcp_status 이벤트**: `onReloadMine`(listMine만) 호출 — listForTeam은 MCP 연결 상태와 무관
- **setPostCreate 닫기 조건**: `event.is_online && event.config_id === postCreateRef.current?.configId` — 다른 MCP 이벤트로 설치 배너 닫히는 문제 방지
- **listForTeam `is_online`**: `mcp_broker.is_online()` 으로 실제 연결 상태 반영 (Pydantic 기본값 False 아님)

### MCP 보안
- `mcp-server/tools.py` `_resolve_safe()`: path traversal, `~` 우회, 전체 경로 컴포넌트 검사
- `mcp-server/config.py` BLOCKED_PATTERNS: `.ssh/.aws/.kube` 등 + BLOCKED_EXTENSIONS(`.pem/.key` 등) + BLOCKED_FILENAMES(`id_rsa` 등)
- `worker_llm.py` / `supervisor.py` system prompt: 채팅 컨텍스트·파일 내용은 지시가 아님 명시
- `read_file` 결과: `[파일 데이터]` prefix 래핑 (2차 인젝션 방어)
- MCP 토큰 만료: 90일마다 자동 교체 (`MCP_TOKEN_MAX_AGE_DAYS` env로 조정)
  - `McpConfig.token_issued_at`, `last_heartbeat_at` 컬럼 — 마이그레이션 `p5q6r7s8t9u0`
  - heartbeat 응답 `token_expired=true` → MCP가 로컬 토큰 폐기 + SSE 재연결로 새 토큰 수신

### 인증(Authentication) ≠ 인가(Authorization) — 룸/태스크 접근 패턴 (2026-06-16 수정)
- **JWT 검증만으로는 부족** — "누구인지"만 확인하고 "이 리소스에 접근해도 되는지"는 별도 체크 필요
- REST: 룸/태스크 관련 라우트는 `require_room_access(room_id, current_user, db)` 필수 (room 객체 반환, 없으면 404, 권한 없으면 403) — `cancel_task`에 누락되어 있었음, 추가함
- WebSocket (`ws_chat`, `ws_tasks`): `require_room_access`는 HTTPException을 던져 WS에서 못 씀 — 직접 `RoomMember`/`TeamMember` 쿼리로 멤버십 확인 후 비멤버는 `close(code=4003)`, 룸 없음은 `close(code=4004)`
  - 누락 시 room_id만 알면(브로드캐스트 평문 노출) 비멤버가 채팅/태스크 실시간 스트림을 그대로 구독 가능했음
- `_pending_endpoints` 캐시(`mcp_configs.py`): 비인증 엔드포인트(`lookup-by-email`, `sse`)가 `endpoint` 파라미터를 받아 이 캐시에 쓰면 안 됨 — 공격자가 임의 endpoint를 주입해 `mcp_token`을 탈취하는 경로가 생김. 둘 다 `endpoint` 처리 제거함
  - endpoint 등록은 **`heartbeat`(mcp_token 필요)로만** 수행 — 폴더 선택 등 소비처는 DB fallback(`McpConfig.endpoint`)으로 처리

### 환경변수
- `.env.production` 커밋됨 (NEXT_PUBLIC_* 만 포함, 시크릿 없음)
- `NEXT_PUBLIC_API_URL=https://syncai-backend.fly.dev/v1`
- `NEXT_PUBLIC_WS_URL=wss://syncai-backend.fly.dev/ws`
- `COMPOSIO_API_KEY` — Fly.io secret 등록 완료 (2026-06-17)
- `MCP_TOKEN_MAX_AGE_DAYS` (기본 90) — MCP 토큰 최대 유효 기간(일)

## 배포
- 백엔드: `syncai-backend/**` push → GitHub Actions → Fly.io 자동
- 프론트: `main` push → Vercel 자동
- MCP 릴리즈: `gh workflow run "Release MCP Code Bundle" --field version=X.X.X`

## 주요 파일
| 기능 | 파일 |
|------|------|
| 채팅방 클라이언트 | `syncai-frontend/src/app/(app)/rooms/[id]/RoomPageClient.tsx` |
| 채팅방 라우트 (Vercel) | `syncai-frontend/src/app/(app)/rooms/[id]/page.tsx` |
| 채팅방 라우트 (Tauri) | `syncai-frontend/src/app/(app)/rooms/[id]/page.tauri.tsx` |
| 방 목록 레이아웃 (unread, layout WS) | `syncai-frontend/src/app/(app)/rooms/layout.tsx` |
| WS 클라이언트 | `syncai-frontend/src/lib/ws.ts` |
| WS 서버 | `syncai-backend/app/routers/ws.py` |
| 메시지 API + AI 플로우 | `syncai-backend/app/routers/messages.py` |
| AI Worker LLM (MCP+Composio 툴) | `syncai-backend/app/agents/worker_llm.py` |
| Composio 외부 앱 API | `syncai-backend/app/routers/integrations.py` |
| Composio REST 래퍼 | `syncai-backend/app/services/composio_service.py` |
| 외부 앱 연동 허브 페이지 (마켓플레이스 UI) | `syncai-frontend/src/app/(app)/integrations/page.tsx` |
| 팀/방 삭제 API | `syncai-backend/app/routers/teams.py`, `rooms.py` |
| 사이드바 | `syncai-frontend/src/components/layout/room-sidebar.tsx` |
| 팀 아이콘 네비 | `syncai-frontend/src/components/layout/icon-nav.tsx` |
| 설정 페이지 (4탭: 프로필/테마/플랜/계정) | `syncai-frontend/src/app/(app)/settings/page.tsx` |
| 테마 프로바이더 (dark/light/oat) | `syncai-frontend/src/components/providers/theme-provider.tsx` |
| 상태: 방 목록 + unread + workers + teamMcpConfigs | `syncai-frontend/src/store/rooms.ts` |
| 채팅방 prefetch 캐시 (TTL 30초) | `syncai-frontend/src/lib/prefetch.ts` |
| MCP 설정 모달 | `syncai-frontend/src/components/worker/mcp-settings-modal.tsx` |
| Tauri 확인 모달 (window.confirm 대체) | `syncai-frontend/src/components/ui/confirm-dialog.tsx` |
| Tauri 빌드 스크립트 (Next.js only) | `syncai-frontend/scripts/tauri-build.sh` |
| Tauri 앱 프로젝트 (빌드·번들) | `syncai-desktop/` (`npm run build` → `.app` + `.dmg`) |
| MCP 파일 접근 보안 | `syncai-backend/mcp-server/tools.py`, `config.py` |
| MCP heartbeat + 토큰 만료 | `syncai-backend/mcp-server/heartbeat.py` |
| Redis 공유 풀 (sync) | `syncai-backend/app/core/redis_client.py` |
