# SyncAI — Claude Code 컨텍스트

## 프로젝트 개요
팀 채팅 인터페이스를 통해 AI가 로컬 PC 파일을 직접 수정하는 협업 플랫폼.
`/ai @MCP이름 지시사항` → AI가 해당 PC 파일 수정 → 결과를 채팅에 표시.

## 기술 스택
| 영역 | 기술 |
|------|------|
| Backend | FastAPI + Python, PostgreSQL (Neon), Redis (Upstash) |
| Frontend | Next.js App Router, TypeScript, Tailwind CSS v4, Zustand |
| AI | Gemini 2.5 Flash (worker), llama-3.1-8b (planning) via OpenRouter |
| MCP Server | FastAPI JSON-RPC 2.0, WebSocket 역방향 연결 |
| 배포 | Fly.io (백엔드 `syncai-backend`, Tokyo nrt), Vercel (프론트), Neon (DB), Upstash (Redis) |
| 레포 | https://github.com/smile5959/syncai |

## 디렉토리 구조
```
syncai/
├── syncai-backend/          # FastAPI 백엔드
│   ├── app/
│   │   ├── agents/          # worker_llm.py, supervisor.py
│   │   ├── routers/         # messages.py, ws.py, rooms.py, teams.py ...
│   │   ├── models/          # SQLAlchemy 모델
│   │   └── core/            # deps.py, auth.py, limiter.py
│   └── mcp-server/          # 로컬 PC 에이전트
│       ├── server.py        # MCP 서버 메인
│       ├── bootstrap.py     # 설치 부트스트래퍼
│       └── url_handler.py   # syncai:// 커스텀 URL 핸들러
└── syncai-frontend/         # Next.js 프론트
    └── src/
        ├── app/(app)/rooms/ # 채팅방 페이지
        ├── app/(auth)/login/# 로그인/회원가입
        ├── components/      # UI 컴포넌트
        ├── store/           # Zustand (auth.ts, rooms.ts)
        └── lib/             # api.ts, ws.ts
```

## 핵심 아키텍처 결정사항

### WebSocket 메시지 흐름
- 채팅 전송: WS `{type: "send_message", content}` → 서버 즉시 broadcast → DB 백그라운드 저장
- WS 실패 시: HTTP fallback (3초 타임아웃)
- room_id: URL에서 slug로 오지만 내부적으로 UUID로 정규화 (ws.py, deps.py)
- chat_connections / task_connections 키: 반드시 UUID (slug 아님)

### AI 처리 흐름
```
/ai 명령
  → MCP 없으면: planning 스킵 → 바로 chat-only (1-hop)
  → MCP 있으면: llama-3.1-8b planning → MCP 필요 여부 판단
      → needs_mcp=false: chat-only 실행
      → needs_mcp=true: 사용자 동의 요청 → MCP 작업 실행
```

### require_room_access
`deps.py`의 `require_room_access(room_id, user, db)` → room 객체 반환.
slug/UUID 모두 처리. 반환값으로 `room.id` 써야 DB 쿼리 정상 작동.

### 인증
- JWT access_token + refresh_token (쿠키)
- 미들웨어(middleware.ts): /login 접근 시 토큰 있으면 /rooms 리다이렉트
- WS: 쿠키 우선, 없으면 ?token= 쿼리 파라미터

## 작업 방식 (중요)
- 수정 전에 관련 코드 먼저 읽고 로직 파악 후 설명, 확인 후 진행
- 이미 동의한 내용은 재설명하지 말고 바로 다음 단계로
- 커밋은 명시적으로 요청할 때만
- 작업 완료 후 git push까지 항상 같이

## 배포
- **백엔드**: GitHub Actions — `syncai-backend/**` push 시 Fly.io 자동 배포
- **프론트**: Vercel — main 브랜치 push 시 자동 배포
- MCP 인스톨러 빌드: `gh workflow run "Build MCP Installer" --repo smile5959/syncai --ref main`

## 현재 상태 (2026-06-09)
### 최근 완료
- 실시간 AI 스트리밍 (stream=True, 가짜 sleep 루프 제거)
- WS slug→UUID 정규화로 실시간 메시지 전달 수정
- AI planning 2-hop → 1-hop (MCP 없을 때 planning 스킵)
- 채팅 전송 HTTP→WebSocket 교체 + fallback
- Worker 패널 전면 개편 (슬롯 카드, 작업 기록 탭 필터)
- 미읽 뱃지 + 브라우저 알림 (layout 레벨 WS)
- 팀 삭제 시 mcp_config_teams FK 버그 수정
- 회원가입 → 로그인 탭 전환 (URL 라우팅 → state)
- Supervisor 모델 교체: gemma-4-31b:free(유료 전환) → meta-llama/llama-3.1-8b-instruct:free
- Worker 컨텍스트 오염 수정: /ai @... 패턴 regex 정제, max_tokens 400→4096
- 확인 버튼 UI: 거부/한번만허용/항상허용 3버튼 (파일 접근 권한 확인 방식)

### 다음 할 것
1. Windows MCP 실제 테스트 (PowerShell 설치 후 온라인 확인)
2. MCP 토큰 만료 정책
3. 디버그 로그 제거 (messages.py MCP not-found print 삭제)

## 주요 파일 빠른 참조
| 기능 | 파일 |
|------|------|
| 채팅방 페이지 | `syncai-frontend/src/app/(app)/rooms/[id]/page.tsx` |
| WS 클라이언트 | `syncai-frontend/src/lib/ws.ts` |
| WS 서버 엔드포인트 | `syncai-backend/app/routers/ws.py` |
| 메시지 API | `syncai-backend/app/routers/messages.py` |
| AI Worker | `syncai-backend/app/agents/worker_llm.py` |
| 인증 deps | `syncai-backend/app/core/deps.py` |
| 사이드바 | `syncai-frontend/src/components/layout/room-sidebar.tsx` |
| Worker 패널 | `syncai-frontend/src/components/worker/worker-panel.tsx` |
