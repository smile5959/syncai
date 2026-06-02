# SyncAI — 프론트엔드

## 기술 스택
Next.js 16.2.5 (App Router) / TypeScript / Tailwind CSS v4 / Zustand / Axios / Radix UI / Lucide

## 에셋
- `public/logo.jpg` — SyncAI 로고 이미지 (무한대+코드 심볼, 보라/파랑 그라디언트)
  - `IconNav` 상단 앱 아이콘으로 사용 (36×36, objectPosition: "50% 12%" 로 심볼 영역 크롭)

## 프로젝트 구조
```
syncai-frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx        # 로그인/회원가입
│   │   ├── (auth)/onboarding/page.tsx   # 팀 생성 온보딩
│   │   ├── (app)/layout.tsx             # IconNav(56px) 래퍼
│   │   ├── (app)/rooms/page.tsx         # 채팅방 목록 (빈 화면)
│   │   ├── (app)/rooms/[id]/page.tsx    # 채팅방 메인 (반응형)
│   │   ├── globals.css                  # 라이트/다크 CSS 변수
│   │   └── layout.tsx / page.tsx
│   ├── components/
│   │   ├── ui/                  # Button / Input / Badge
│   │   ├── layout/              # IconNav(56px) / RoomSidebar(240px, 반응형)
│   │   ├── providers/           # ThemeProvider
│   │   ├── chat/                # MessageItem / ChatInput
│   │   └── worker/              # WorkerPanel(300px, 반응형) / McpSettingsModal
│   ├── lib/api.ts               # Axios + 인터셉터
│   ├── lib/ws.ts                # SyncWS 자동재연결
│   ├── store/auth.ts            # Zustand: user/team/token
│   └── types/index.ts
└── .env.local                   # NEXT_PUBLIC_API_URL=http://localhost:8001/v1
```

## 구현 완료 화면
| 화면 | 경로 | 내용 |
|------|------|------|
| 로그인/회원가입 | `/login` | 분할 레이아웃, JWT 저장, 팀 분기 |
| 온보딩 | `/onboarding` | 팀 생성 → `/rooms` |
| 채팅방 목록 | `/rooms` | 사이드바 + 생성 모달 |
| 채팅방 메인 | `/rooms/[id]` | 채팅 + Worker 패널 + WS |
| AI 작업 진행/결과 | (Worker 패널) | 진행률 바 / Diff 뷰어 + 되돌리기 |
| MCP 설정 | (모달) | 내 MCP / 팀 공개 설정 / 설치 가이드 탭 |

## 반응형 레이아웃 구조
```
[IconNav 56px] [RoomSidebar 240px 토글] [Chat flex-1] [WorkerPanel 300px 토글]
```
- `rooms/[id]/page.tsx`에서 `showSidebar` / `showWorker` state로 슬라이드 토글(width 0↔값, transition 0.25s)
- 창 크기 자동 감지: <900px=둘다숨김 / 900~1200px=사이드바만 / ≥1200px=전부표시
- 헤더 햄버거(☰)→사이드바 토글, PanelRight 버튼→Worker 토글
- 모든 레이아웃 div `minWidth:0` — flexbox overflow 방지

## 프론트 개선 (2026-05-12)
- `mcp-settings-modal.tsx`: 엔드포인트 입력 제거, 폴더 탐색 UI 추가 (`workers.browse` 호출), 자동 등록 안내
- `room-sidebar.tsx`: 채팅방 이름 변경(인라인 인풋) + 삭제(confirm 후 API), 검색 필터 동작, `onRoomsChange` prop 추가
- `api.ts`: `workers.create/update` mcp_endpoint 파라미터 제거, `workers.browse` 추가

## 핵심 파일 메모
- **`icon-nav.tsx`**: 로고 height:56px 컨테이너에 중앙 정렬 → 채팅 헤더 수평선과 일치
- **`room-sidebar.tsx`**: 팀 헤더 height:56px 고정 / width:100%로 부모가 너비 제어 / 채팅방 아이템 py-3.5 / 채팅방 목록 상단에 `{팀이름} 채팅방` 레이블 + 액센트 바로 팀↔방 계층 시각화
- **`worker-panel.tsx`**: `workers: Worker[]` prop (슬롯 목록) — idle(녹색)/busy(accent) 상태 표시, idle/busy 개수 Badge, 태스크 히스토리 + DiffViewer + 되돌리기
- **`mcp-settings-modal.tsx`**: `{teamId, onClose}` prop. 3탭 — 내 MCP(생성/삭제/토큰 표시) / 팀 공개 설정(is_public 토글, @멘션 힌트) / 설치 가이드
- **`chat-input.tsx`**: `mcpAvailable` + `availableMcpNames` prop. `/ai @` 입력 시 MCP 이름 자동완성 드롭다운(↑↓ Tab/Enter 선택, Esc 닫기)
- **`rooms/[id]/page.tsx`**: `workers: Worker[]` 상태(팀별 폴링 5초) / `teamMcpConfigs` 상태 / `mcpAvailable` = public MCP 존재 여부 / task_queued WS 이벤트 → 임시 안내 메시지 표시
- **`message-item.tsx`**: 모든 스타일 inline style — Tailwind v4 미생성 클래스 우회. paddingLeft:28px 고정. `/ai` 커맨드는 `isMe`에 따라 우→좌 분기 (내 커맨드=오른쪽, 타인=왼쪽, AI응답=항상왼쪽)
- **`api.ts`**: 401 시 refresh_token 자동 갱신
- **`ws.ts`**: `createChatWS(roomId)` / `createTaskWS(roomId)` — 3초 자동 재연결
- **`globals.css`**: `textarea/button:focus-visible { outline: none !important }`

## 로컬 실행
```powershell
cd syncai-frontend && npm install && npm run dev  # http://localhost:3000
```

## 팀 아이콘 커스텀
- `Team` 타입에 `color?: string | null`, `icon?: string | null` 추가
- 팀 생성/수정 모달: 컬러 팔레트(12색) + 이모지 피커(56개) 선택 가능
- 팀 아이콘 표시: `icon` 있으면 이모지, 없으면 이니셜(2글자) / `color` 있으면 커스텀, 없으면 ID 해시로 자동 배정
- `getTeamColor(team)`: `team.color ?? hashColor(team.id)` — 항상 고유 색상 보장
- 팀 CRUD 호버 메뉴: 아이콘 우상단 "..." 버튼 or 우클릭 → owner는 수정/삭제, member는 나가기

## 팀 구조 (2026-05-12 개편: Discord식 TeamBar)
- **TeamBar** (`icon-nav.tsx`): 좌측 56px 컬럼, 팀 아이콘(이니셜 원형) 목록 + 하단 "+" 버튼
  - 마운트 시 `GET /v1/users/me/teams` → `useAuthStore.setTeam()` 호출
  - 팀 아이콘 클릭 → store 팀 전환 + `/rooms` 이동
  - "+" 버튼 → 팀 생성 모달 (`POST /v1/teams`)
  - 초대 수락 시 팀 목록 재로드 + 신규 팀 자동 선택
- **RoomSidebar**: 팀 드롭다운 완전 제거, `useAuthStore`에서 팀 이름 읽기
- **rooms/page.tsx**: 로컬 teams/currentTeam state 제거 → `useAuthStore` 구독
- **rooms/[id]/page.tsx**: `localStorage.team_id` 직접 읽기 제거 → `useAuthStore.team` 사용

## Worker 슬롯 관리 UI + 사이드바 정리 (2026-05-14)
- **`mcp-settings-modal.tsx`**: "Worker 슬롯" 탭(`workers`) 추가 (4번째 탭, `Cpu` 아이콘)
  - `WorkerSlotsTab({ teamId })`: 슬롯 목록 조회, 이름 입력(최대 50자) 후 추가, 삭제
  - busy 슬롯 삭제 시 confirm 확인 다이얼로그 표시
  - 슬롯 상태 인디케이터(idle=녹색/busy=accent), idle/busy 뱃지, 슬롯 수 요약
  - `workersApi.list/create/delete` 사용, `Worker` 타입 import 추가
- **`room-sidebar.tsx`**: 구버전 잔재 제거
  - `isOnline`, `room.worker_id`, `connection_status` 참조 완전 제거
  - `Wifi`, `WifiOff` import 제거

## 알려진 이슈
- Tailwind v4 일부 클래스 미생성 → 레이아웃 관련은 모두 inline style로 우회
- `/ai` 커맨드: Worker 슬롯(팀 설정) + MCP 서버(로컬 실행) + 팀에 public MCP 등록 필요

## /ai 커맨드 동작 흐름 (최신)
1. `sendAi(roomId, content)` → `POST /v1/rooms/{id}/ai` (202 Accepted)
2. 백엔드: `@멘션` 파싱 → MCP 선택 → idle Worker 슬롯 점유 (없으면 큐 대기)
3. 슬롯 없을 때: `task_queued` WS → 프론트 임시 안내 메시지 표시
4. `_run_ai_task`: Supervisor(Gemini) 실행 → ai_res 저장 → `broadcast`
5. 프론트: `task_started/progress/completed/failed` WS → Worker 슬롯 즉시 재폴링
6. 안전망: WS 재연결 시 `messagesApi.list` 캐치업 + 태스크 진행 중 3초 폴링

## Worker/MCP 구조 분리 리팩토링 (2026-05-13)
**변경 전**: `worker` 단일 객체(room에 연결), `workerOnline` bool
**변경 후**: `workers: Worker[]` (팀 슬롯 목록 폴링), `mcpAvailable` (public MCP 존재 여부)

주요 변경 파일:
- `types/index.ts`: Worker(status/current_task_id), McpConfig/McpConfigWithTeam 타입 추가
- `lib/api.ts`: `workers` API 간소화(list/create/delete), `mcpConfigs` API 신규
- `mcp-settings-modal.tsx`: room/onSave prop 제거 → `teamId` prop, 3탭 구조
- `worker-panel.tsx`: `worker` → `workers[]` prop, 슬롯 목록 + idle/busy 배지
- `chat-input.tsx`: `workerOnline` → `mcpAvailable`, `@` 멘션 자동완성 드롭다운
- `rooms/[id]/page.tsx`: worker 단일→슬롯 목록, teamMcpConfigs, task_queued 이벤트

## 핵심 변경 이력
- `ws.ts` `SyncWS`: `onReconnect` 콜백 추가 — 재연결 시 호출, 첫 연결은 제외
- `api.ts` `messages.sendAi`: `message_id` 파라미터 제거 (백엔드 optional 처리)
- `rooms/[id]/page.tsx`: `/ai` 커맨드 시 `messagesApi.send` 중복 호출 제거, sendAi 실패 에러 표시, WS 재연결 캐치업, 태스크 진행 중 폴링
