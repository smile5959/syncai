# SyncAI — 백엔드

## 기술 스택
FastAPI 0.111 / Python 3.14 / PostgreSQL / Redis / ARQ / SQLAlchemy / Alembic / bcrypt / OpenAI SDK (Gemini 호환)

## 프로젝트 구조
```
syncai-backend/
├── app/
│   ├── main.py          # FastAPI + CORS + 라우터 등록
│   ├── config.py        # 환경변수 (pydantic-settings)
│   ├── database.py      # PostgreSQL + SQLAlchemy
│   ├── worker.py        # ARQ Worker 진입점
│   ├── models/          # User/Team/TeamMember/Worker/ChatRoom/RoomMember/Message/Task/FileLock
│   ├── schemas/         # Pydantic v2 스키마
│   ├── routers/         # auth/teams/workers/rooms/messages/tasks/users/ws
│   ├── agents/          # mcp_client.py / worker.py / supervisor.py
│   ├── core/            # JWT(auth.py) / deps.py
│   └── services/        # task_service(ARQ) / ai_service / room_service
└── alembic/
```

## ERD 핵심 관계 (리팩토링 후 목표)
```
users ←── teams (owner_id) ←── team_members (user_id)
teams ←── workers (team_id)            ← AI 슬롯 (플랜 기반 N개)
users ←── mcp_configs (owner_user_id)  ← 사용자별 PC 접근 설정
mcp_configs ←── mcp_config_teams (mcp_config_id, team_id, is_public)
teams ←── chat_rooms (team_id)         ← worker_id 제거
chat_rooms ←── messages (room_id, user_id)
chat_rooms ←── tasks (room_id, worker_id, message_id)
tasks ←── file_locks (task_id, worker_id)
```

### workers 테이블 (재정의 — AI 슬롯)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| team_id | UUID | FK→teams |
| name | VARCHAR | 슬롯 이름 (예: "Worker 1") |
| status | ENUM | idle / busy |
| current_task_id | UUID? | 현재 처리 중인 task |
| created_at | TIMESTAMP | |

### mcp_configs 테이블 (신규)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| owner_user_id | UUID | FK→users |
| name | VARCHAR | 사용자 지정 이름 (예: "내 맥북") |
| endpoint | VARCHAR | MCP 서버 주소 |
| base_dir | VARCHAR | 접근 허용 경로 |
| mcp_token | VARCHAR | Bearer 인증 토큰 |
| created_at | TIMESTAMP | |

### mcp_config_teams 테이블 (신규 — 팀별 공개 설정)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| mcp_config_id | UUID | FK→mcp_configs |
| team_id | UUID | FK→teams |
| is_public | BOOLEAN | 팀 내 공개 여부 |

- `teams.plan`: free/pro/biz (users에 plan 없음)
- `chat_rooms.worker_id` 제거 → Worker 슬롯 동적 할당으로 변경

## 라우터 등록 (`main.py`)
```python
app.include_router(auth.router,        prefix="/v1")
app.include_router(teams.router,       prefix="/v1")
app.include_router(workers.router,     prefix="/v1")
app.include_router(rooms.router,       prefix="/v1")
app.include_router(messages.router,    prefix="/v1")
app.include_router(tasks.router,       prefix="/v1")
app.include_router(mcp_configs.router, prefix="/v1")
app.include_router(users.router)       # 자체 prefix=/v1/users
app.include_router(ws.router)          # /ws/rooms/:id/chat|tasks
```

## 구현 완료
- Auth: 회원가입/로그인/로그아웃/토큰갱신 (JWT + bcrypt)
- Teams/Workers/Rooms/Messages/Tasks: 전체 CRUD
- `GET /v1/users/me` + `GET /v1/users/me/teams` (소속 팀 목록)
- 메시지 전송 → WS broadcast 연동
- `/ai` 커맨드: 슬라이딩 윈도우(최근 20개, ai_cmd/ai_res/chat 전부 포함, 현재 명령 중복 제거)
- 멀티에이전트 + MCP 클라이언트: mcp_client / worker / supervisor agents
- Alembic 마이그레이션 완료 (10개 테이블: mcp_configs, mcp_config_teams 추가)
- 테스트: test_auth(7) / test_ws(5) / test_agents(9) 전체 통과

## 로컬 실행 (Windows PowerShell)
```powershell
cd syncai-backend
docker-compose up -d                              # PostgreSQL(5433) + Redis
python -m pip install -r requirements.txt
python -m alembic upgrade head
python scripts/seed_dev.py                        # ← DB 초기화 후 반드시 실행 (mcp_configs 복구)
python -m uvicorn app.main:app --port 8001        # --reload 제거 (Python 3.14 버그)
# MCP 서버 (별도 터미널):
cd mcp-server && python server.py
# run_worker.py는 더 이상 사용하지 않음 (AI 태스크 in-process 처리)
# API 문서: http://localhost:8001/docs
```

## 개발 환경 초기화 절차 (DB 리셋 시)
```powershell
# 1. 마이그레이션만 재적용 (데이터 보존)
python -m alembic upgrade head

# 2. DB를 완전히 비웠다면 seed 스크립트로 mcp_configs 복구
python scripts/seed_dev.py
# → mcp-server/.env의 MCP_AUTH_TOKEN으로 mcp_configs 레코드 자동 생성
# → workers 테이블 기준 모든 팀에 mcp_config_teams(is_public=true) 연결
# → 이미 레코드가 있으면 skip (idempotent)

# 3. MCP 서버 재시작 → heartbeat이 정상 연결됨
cd mcp-server && python server.py
```

> **주의**: `alembic downgrade`는 데이터를 날리므로 자제할 것.
> 완전 초기화 필요 시: `downgrade base` → `upgrade head` → `seed_dev.py` 순서로 실행.

## MCP 서버 (`syncai-backend/mcp-server/`)
```
mcp-server/
├── server.py          # FastAPI JSON-RPC 2.0, Bearer→TOKEN_REGISTRY base_dir 결정, /set-token, /health
├── tools.py           # read_file/write_file/create_file/list_directory/delete_file (base_dir 파라미터 주입)
├── config.py          # TOKEN_REGISTRY: dict[token→Path], token_registry.json 영구 저장, .env 하위 호환
├── heartbeat.py       # 토큰별 독립 asyncio Task, add_token() 런타임 추가 API
├── .env.example       # 설정 템플릿
└── start.bat          # Windows 실행 스크립트 (⚠️ 관리자 권한 자동 요청 미구현 — 향후 예정)
```
실행: `mcp-server/` 폴더에서 `.env` 설정 후 `python server.py` (포트 7860)

> **⚠️ Windows 주의**: C:\ 루트 등 시스템 경로 파일 접근 시 관리자 권한 필요.
> 현재는 터미널을 "관리자 권한으로 실행"한 뒤 `python server.py` 또는 `start.bat` 실행.
> (UAC elevation 자동화 예정)

## 환경변수 주요 항목 (`.env`)
```
DATABASE_URL=postgresql://...@localhost:5433/syncai
REDIS_URL=redis://localhost:6379
SECRET_KEY=...
GEMINI_API_KEY=...   ← 발급 완료 (gemini-2.5-flash 사용)
```

## AI 엔진
- **Gemini 2.5 Flash** (Vertex AI 엔드포인트, GCP 서비스 계정 인증)
- `app/agents/supervisor.py`: openai SDK + Vertex AI OpenAI 호환 엔드포인트
  - `GOOGLE_APPLICATION_CREDENTIALS` 설정 시: Vertex AI (`us-central1-aiplatform.googleapis.com`) + OAuth2 토큰
  - 미설정 시: Google AI Studio (`generativelanguage.googleapis.com`) + API 키 fallback
- 서비스 계정: `capd-runner@skuniv-training-2.iam.gserviceaccount.com`
- 주의: Google AI Studio 엔드포인트는 서비스 계정 OAuth2 토큰 미지원 (API 키 전용)

## /ai 커맨드 동작 조건
1. 팀에 idle Worker 슬롯 1개 이상 필요 (`POST /v1/teams/{id}/workers`로 생성)
2. MCP Config 등록 필요 (`POST /v1/mcp-configs`) + 팀에 public 설정
3. MCP 서버(`python server.py`) 실행 — heartbeat으로 endpoint 자동 등록
4. MCP 서버 `.env`에 `SYNCAI_BACKEND_URL`, `MCP_AUTH_TOKEN` 설정 필요
5. @mention으로 특정 MCP 지정 가능: `/ai @내맥북 버그 고쳐줘`
6. 모든 슬롯 busy 시 → asyncio.Queue 대기 → 슬롯 해제 시 자동 실행

## 스키마 변경 (이번 세션)
- `AiCommandRequest.message_id`: `uuid.UUID` → `uuid.UUID | None = None` (optional 처리)
- `teams` 테이블: `color VARCHAR(7)`, `icon VARCHAR(10)` 컬럼 추가 (마이그레이션: `f5g6h7i8j9k0`)
- `TeamCreate` / `TeamUpdate` / `TeamOut`에 `color`, `icon` 필드 추가

## 실시간 AI 응답
- **[현재 방식]** AI 태스크를 FastAPI 인-프로세스 `asyncio.create_task()`로 실행 (`messages.py::_run_ai_task`)
- ARQ + Redis pub/sub 체인 제거 — `broadcast(chat_connections, ...)` 직접 호출로 WebSocket 전달 보장
- `run_worker.py` 비활성화 완료 — ARQ 완전 제거, 서버 하나만 실행
- **[이전 방식, 참고용]** ARQ → Redis pub/sub → `redis_subscriber` → WebSocket (연결 불안정으로 교체)

## 초대 수락 동작 (B안)
- `POST /v1/invitations/{id}/accept`: TeamMember 추가 후 해당 팀의 모든 ChatRoom에 RoomMember 자동 추가
- `invitations.py`에 `ChatRoom`, `RoomMember` import 추가

## 스키마 변경사항
- `RoomOut`에 `worker: WorkerInRoom | None` 추가 — 새로고침 시 Worker 상태 유지
- `rooms.py` list_rooms / get_room에 `joinedload(ChatRoom.worker)` 추가 — lazy loading 방지

## 알려진 이슈 / 결정사항
- `uvicorn --reload` 사용 불가 (Python 3.14 asyncio CancelledError)
- `python -m arq app.worker.WorkerSettings` 불가 (Python 3.14 event loop 이슈) → `python run_worker.py` 사용
- PostgreSQL 포트 5433 (기존 프로젝트 충돌로 변경)
- `passlib` bcrypt 호환 불가 → `bcrypt` 직접 사용 (`app/core/auth.py`)
- Task revert: ✅ 실구현 완료 (2026-05-14) — backup_snapshot + mcp_config_id 기반 MCP 파일 복원
- Worker 2개 등록 주의: MCP 설정 모달로 Worker 등록 시 중복 생성될 수 있음. 실제 방에 연결된 worker_id 확인 필요

## 버그 수정 (2026-05-11)
- CORS: `allow_origins=["*"]` + `allow_credentials=True` 조합 불가 → origin 명시
- `datetime.utcnow` → `datetime.now(timezone.utc)` 전체 적용
- `WorkerInRoom` 스키마에 `mcp_token`, `mcp_base_dir` 누락 → 추가 (프론트 pre-fill 복구)
- WebSocket: `accept()` 전 `close(4001)` → Starlette 403 → 무한 재연결. `accept()` 먼저 호출로 수정. 프론트 `ws.ts`에서 code 4001 감지 시 토큰 갱신 or 로그아웃
- MCP 401: `MCPClient` 생성 시 토큰 미전달 → `token=worker_row.mcp_token or ""` 수정

## MCP 개선 (2026-05-12 구현)
- `HeartbeatRequest`에 `mcp_endpoint` 추가 → MCP 서버가 자신의 주소를 자동 등록
- `heartbeat.py`: `self_endpoint = f"http://localhost:{config.PORT}"` 자동 전송
- `GET /workers/{id}/fs/browse?path=.`: 백엔드 → MCP 서버 list_directory 프록시 (프론트 폴더 탐색 UI용)
- `WorkerCreate.mcp_endpoint` → optional (기본값 `""`)
- `room_service.get_recent_messages`: `type=="chat"` 필터 제거, `exclude_id` 파라미터 추가
- `supervisor.py` SYSTEM_PROMPT 강화: 자기소개 금지, 재확인 질문 금지, base_dir 항상 명시

## MCP 자동화 (2026-05-11 구현)
- `workers.mcp_token`: 등록 시 미입력이면 `secrets.token_hex(16)` 자동 생성. 동일 토큰 재등록 시 upsert
- `GET /v1/workers/lookup?mcp_token=xxx`: 토큰으로 Worker ID 조회 (인증 불필요)
- `mcp-server/heartbeat.py`: 시작 시 `SYNCAI_WORKER_ID` 없으면 토큰으로 자동 조회. heartbeat 404 시 자동 re-lookup
- 프론트 모달: 등록 완료 후 생성 토큰 표시 + 복사 버튼. `.env` 수동 수정 불필요

## MCP BASE_DIR 사용자 설정 (2026-05-11 구현)
- `workers.mcp_base_dir` 컬럼 추가 (마이그레이션: `c3d4e5f6a7b8`)
- `POST /workers/{id}/heartbeat` 응답에 `mcp_base_dir` 포함
- `mcp-server/heartbeat.py`: 응답에서 `mcp_base_dir` 수신 → `config.BASE_DIR` 런타임 갱신 (재시작 불필요)
- `mcp-server/tools.py`: `import config as _cfg` 직접 참조 (동적 갱신 반영)
- 프론트 모달: "접근 허용 경로" 입력 필드 추가

## Gemini AI 개선 (2026-05-11)
- `SYSTEM_PROMPT` 개정: "접근 불가" 발언 금지, 대화 중 자기소개 반복 금지, 경로 불확실 시 `list_directory`로 탐색
- `SupervisorAgent`에 `mcp_base_dir` 주입 → 허용 경로를 시스템 프롬프트에 동적 추가
- `messages.py`, `task_service.py`: `SupervisorAgent` 생성 시 `worker_row.mcp_base_dir` 전달

## MCP 툴 추가 (2026-05-11)
- `delete_file` 툴 추가: `mcp-server/tools.py`, `supervisor.py` MCP_TOOLS, `worker.py` SUPPORTED_TOOLS 모두 반영
- 파일만 삭제 가능 (디렉토리 삭제 불가)

## Task revert 실구현 (2026-05-14)
- **`tasks` 테이블** (마이그레이션: `h7i8j9k0l1m2`):
  - `backup_snapshot` (JSON, nullable): AI 실행 전 파일 원본 스냅샷 `{경로: 원본내용 | null(신규파일)}`
  - `mcp_config_id` (UUID FK → mcp_configs, ON DELETE SET NULL): 실행에 사용한 MCP 추적
- **`agents/worker.py`** `WorkerAgent`:
  - `_write_file`: `before=None` (신규파일) vs `before=str` (기존파일) 구분
  - `_delete_file`: 삭제 전 원본 내용 캡처 → `file_changes[path] = {before, after=None}`
  - `build_backup_snapshot()`: `{경로: before}` dict 반환 (revert 전용)
- **`routers/messages.py`** `_run_ai_task`: 완료 시 `task.backup_snapshot`, `task.mcp_config_id` 저장
- **`routers/tasks.py`** `POST /tasks/{id}/revert` (async):
  - `require_room_access` 인가 검증 추가 (기존에 누락)
  - `list_tasks`, `get_task`에도 `require_room_access` 추가
  - SELECT FOR UPDATE로 동시 revert 경쟁 조건 방지 (이중 revert 차단)
  - snapshot 파일별 `write_file`/`delete_file` 호출, 부분 실패 시 `task.error`에 기록 후 500
- **`schemas/task.py`** `TaskOut`: `has_snapshot` computed field 추가 (프론트 되돌리기 버튼 활성화 제어)

## Worker/MCP 구조 분리 리팩토링 (2026-05-13)
- **개념 분리 확정**: Worker = AI 슬롯(팀 소유), MCP Config = PC 접근 설정(사용자 소유)
- **DB 변경** (마이그레이션: `g6h7i8j9k0l1`):
  - `workers` 컬럼 정리: mcp_endpoint/token/base_dir/connection_status/task_status/last_heartbeat_at 제거 → `status`(idle/busy) + `current_task_id` 추가
  - `mcp_configs` 테이블 신규: id/owner_user_id/name/endpoint/base_dir/mcp_token
  - `mcp_config_teams` 테이블 신규: mcp_config_id/team_id/is_public
  - `chat_rooms.worker_id` 제거 (동적 슬롯 할당으로 전환)
  - `tasks.worker_id` nullable로 변경 (큐 대기 중 task는 worker 미배정)
- **신규 라우터** `app/routers/mcp_configs.py`:
  - `POST /v1/mcp-configs` — 내 MCP 등록 (token 자동 생성)
  - `GET /v1/mcp-configs` — 내 MCP 목록
  - `PUT /v1/mcp-configs/{id}` — 수정
  - `DELETE /v1/mcp-configs/{id}` — 삭제
  - `PUT /v1/mcp-configs/{id}/teams/{team_id}?is_public=true` — 팀별 공개 설정
  - `GET /v1/teams/{team_id}/mcp-configs` — 팀 내 접근 가능한 MCP 목록
  - `GET /v1/mcp-configs/lookup?mcp_token=xxx` — MCP 서버 시작 시 config_id 조회
  - `POST /v1/mcp-configs/heartbeat` — endpoint 자동 갱신
  - `GET /v1/mcp-configs/{id}/fs/browse` — 파일시스템 탐색 (프론트 UI용)
- **messages.py** `_run_ai_task` 변경: Worker 슬롯 점유/해제, MCP Config 선택, 큐 시스템
  - `@mention` 파싱: `/ai @내PC 버그 고쳐줘` → 해당 MCP 직접 지정
  - 슬롯 없으면 `asyncio.Queue` 대기 → 슬롯 해제 시 자동 실행
- **supervisor.py** 변경: `available_mcps` + `selected_mcp_name` 파라미터 추가, 시스템 프롬프트에 팀 MCP 목록 주입
- **mcp-server/heartbeat.py** 변경: 엔드포인트 `/v1/mcp-configs/heartbeat`, 환경변수 `SYNCAI_WORKER_ID` → `SYNCAI_MCP_CONFIG_ID`
