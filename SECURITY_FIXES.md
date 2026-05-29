# SyncAI 보안 패치 내역 (2026-05-13)

## 백엔드

### 1. SECRET_KEY 검증 강화
- **파일**: `app/config.py`
- 32자 미만 or 알려진 취약 키 사용 시 서버 기동 거부 (Pydantic `@field_validator`)
- `.env` SECRET_KEY → 64자 hex 키로 교체

### 2. IDOR 취약점 차단 (핵심)
- **파일**: `app/core/deps.py` (신규 헬퍼 함수 추가)
  - `_parse_uuid()` — UUID 형식 검증, 잘못된 형식은 400
  - `require_team_member()` — 팀 멤버/owner 여부 확인, 아니면 403
  - `require_team_owner()` — owner 전용 작업 보호
  - `require_room_access()` — 룸 멤버 또는 팀 멤버만 허용
- **적용 라우터**:
  - `routers/teams.py` — get, list_members, invite_member, remove_member
  - `routers/rooms.py` — create, list, get, update, delete, members CRUD
  - `routers/messages.py` — list, send, ai_command
  - `routers/workers.py` — register, list, update, delete

### 3. WebSocket 토큰 검증
- **파일**: `app/routers/ws.py`
- `_verify_ws_token()` 추가: `type == "access"` + `sub` 필드 필수 확인
- 예외 발생 시 소켓 cleanup (`dead socket` 정리)

### 4. Auth Refresh 사용자 존재 확인
- **파일**: `app/routers/auth.py`
- refresh 토큰 갱신 시 DB에서 실제 사용자 존재 여부 검증 후 발급

### 5. 토큰/에러 정보 노출 제거
- **파일**: `app/main.py` — 전역 예외 핸들러가 `str(exc)` 대신 generic 메시지 반환
- **파일**: `app/agents/supervisor.py` — 토큰 부분 로깅 제거

### 6. FileLock 경쟁 상태 방지
- **파일**: `app/agents/worker.py`
- 5분 초과 오래된 lock은 자동 해제 (stale lock cleanup)
- `IntegrityError` 처리로 동시 write 충돌 대응

---

## 프론트엔드

### 7. 미들웨어 인증 게이트
- **파일**: `src/middleware.ts` (신규)
- `auth_session` 쿠키 없으면 `/login`으로 서버사이드 리다이렉트

### 8. 로그아웃 시 선택적 스토리지 삭제
- **파일**: `src/store/auth.ts`
- `logout()` → `localStorage.clear()` 대신 auth 키만 삭제
- `setUser()` → `auth_session=1` 쿠키 설정

### 9. 로그인 토큰 초기화 순서 버그 수정 ✅ (최신)
- **파일**: `src/app/(auth)/login/page.tsx`
- `auth.login()` 직후 `localStorage.setItem(token)` → 이후 `usersApi.me()` 호출
- 기존: me() 호출 전 token이 없어 HTTPBearer가 403 반환하는 버그 수정

---

## 남은 작업 (Todo)

- [x] localStorage → httpOnly 쿠키 마이그레이션 (2026-05-13)
- [ ] rooms/[id]/page.tsx silent catch → 에러 UI 개선
- [ ] `_run_ai_task` 서비스 레이어 분리
- [ ] 팀/룸/권한 흐름 도메인 테스트 커버리지 추가
