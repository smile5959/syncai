# SyncAI 다음 세션 프롬프트

## 현재 상태 (2026-05-28)

배포 완료 (fly deploy + vercel). MCP 서버 로컬 실행 시 두 가지 문제 발견 — 이번 세션에서 수정.

---

## 오늘 완료된 작업

- fly deploy (백엔드) ✅
- vercel --prod (프론트) ✅
- DB 마이그레이션: **아직 미실행** — `fly ssh console -C "alembic upgrade head"` 필요

### 미완료: DB 마이그레이션
파일: `syncai-backend/alembic/versions/i8j9k0l1m2n3_add_ai_summary_and_ai_plan.py`
추가 내용: `chat_rooms.ai_summary`, MessageType에 `ai_plan`, TaskStatusType에 `awaiting_confirm`/`cancelled`

---

## 이번 세션 메인 작업: start.bat 개선

### 문제 1: 포트 충돌
- Setup.exe로 설치된 `SyncAIMCPServer` Windows 서비스가 7860 포트를 선점
- `start.bat` 실행 시 `[Errno 10048]` 오류로 서버 실행 실패

### 문제 2: cloudflared 암호 다이얼로그
- `mcp-server/cloudflared.exe` 구버전 → 실행 시 "암호를 입력하십시오" 팝업
- X 닫으면 서버는 동작하지만 UX 불편

### 수정할 파일
`C:\khh\syncAI\syncai-backend\mcp-server\start.bat`

### 개선 로직
1. SyncAIMCPServer 서비스 실행 중이면 → `sc stop` 으로 중지
2. 7860 포트 점유 PID 찾기 → `taskkill /F /PID` 로 종료
3. 2초 대기
4. `python server.py` 실행

**주의사항**:
- PowerShell이 아닌 cmd.exe 배치 파일 문법
- 한글 echo 절대 금지 (인코딩 깨짐 이력 있음), 영어/ASCII만 사용
- 서비스/프로세스 종료 실패해도 계속 진행 (|| 또는 에러 무시)

### cloudflared.exe 교체
최신 버전 다운로드해서 교체 (암호 다이얼로그 없음):
```powershell
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "C:\khh\syncAI\syncai-backend\mcp-server\cloudflared.exe"
```

---

## 이전 세션에서 배포된 기능 (테스트 필요)

### SSE 기반 Worker 연결
- `mcp-server/heartbeat.py`: SSE 클라이언트 (`_sse_connect()`)
- `app/routers/mcp_configs.py`: `GET /v1/mcp-configs/sse?email=` 엔드포인트
- SSE 이벤트: `connected`, `token_assigned`, `base_dir_updated`, `ping`

### AI 동의 플로우
- `/ai` → `awaiting_confirm` 상태 Task 생성 → AI가 확인 카드 전송
- `/ai/confirm` → confirmed=true면 실행, false면 cancelled

### 테스트 체크리스트
1. start.bat 실행 → 포트 충돌 없이 서버 뜨는지
2. 암호 다이얼로그 안 뜨는지
3. `[SSE] 연결 성공 (lhm2387@skuniv.ac.kr)` 로그 확인
4. `/ai 파일 수정해줘` → 확인 카드 표시
5. DB 마이그레이션 실행 후 `awaiting_confirm` 상태 동작 확인

---

## 프로젝트 구조

- `syncai-frontend/` — Next.js (Vercel)
- `syncai-backend/` — FastAPI (Fly.io), PostgreSQL (Neon), Redis (Upstash)
- `syncai-backend/mcp-server/` — Worker PC 실행 MCP 서버

## 핵심 파일

| 역할 | 경로 |
|------|------|
| **수정 대상** | `syncai-backend/mcp-server/start.bat` |
| SSE 엔드포인트 | `syncai-backend/app/routers/mcp_configs.py` |
| AI 동의 플로우 | `syncai-backend/app/routers/messages.py` |
| SSE 클라이언트 | `syncai-backend/mcp-server/heartbeat.py` |
| DB 마이그레이션 | `syncai-backend/alembic/versions/i8j9k0l1m2n3_*.py` |

메모리 파일: MEMORY.md 참고 (project_syncai.md, todo_syncai.md)

모든 작업 전 허락 구하고 진행할 것.
