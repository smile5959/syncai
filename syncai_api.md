# SyncAI — API 명세 초안

Base URL: `https://api.syncai.dev/v1`  
인증: Bearer JWT (`Authorization: Bearer <token>`)

---

## Auth

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| POST | `/auth/logout` | 로그아웃 |
| POST | `/auth/refresh` | 토큰 갱신 |

### POST /auth/signup
```json
Request:  { "email": "string", "password": "string", "name": "string" }
Response: { "user": { "id", "email", "name" }, "token": "string", "refresh_token": "string" }
```

### POST /auth/login
```json
Request:  { "email": "string", "password": "string" }
Response: { "token": "string", "refresh_token": "string" }
```

### POST /auth/refresh
```json
Request:  { "refresh_token": "string" }
Response: { "token": "string", "refresh_token": "string" }
```

---

## Teams

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/teams` | 팀 생성 |
| GET | `/teams/:id` | 팀 조회 |
| PATCH | `/teams/:id` | 팀 수정 |
| DELETE | `/teams/:id` | 팀 삭제 |
| GET | `/teams/:id/members` | 멤버 목록 |
| POST | `/teams/:id/members` | 멤버 초대 |
| DELETE | `/teams/:id/members/:userId` | 멤버 강퇴 |

### POST /teams
```json
Request:  { "name": "string", "color"?: "#hex", "icon"?: "emoji" }
Response: { "id", "name", "plan": "free", "owner_id", "color", "icon", "created_at" }
```

### PATCH /teams/:id
```json
Request:  { "name"?: "string", "color"?: "#hex", "icon"?: "emoji" }
Response: { "id", "name", "plan", "owner_id", "color", "icon", "created_at" }
// owner만 수정 가능
```

### DELETE /teams/:id
```
// owner만 삭제 가능
// TeamMember 행 먼저 삭제 후 Team 삭제 (cascade)
Response: 204 No Content
```

### PATCH /teams/:id/members/:userId
```json
Request:  { "role": "manager" | "member" }
Response: { "user_id", "role", "joined_at", "user": { "id", "name", "email" } }
// owner만 변경 가능, owner role 부여 불가
```

### POST /teams/:id/members
```json
Request:  { "email": "string", "role": "member" }
Response: { "ok": true, "invitation_id": "uuid" }
// 초대장(TeamInvitation) 생성; 이미 초대됐거나 멤버면 409
```

---

## Workers

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/teams/:id/workers` | Worker 등록 |
| GET | `/teams/:id/workers` | Worker 목록 |
| DELETE | `/teams/:id/workers/:workerId` | Worker 삭제 |
| POST | `/workers/:id/heartbeat` | heartbeat (Worker→서버) |
| GET | `/workers/:id/file-locks` | 현재 파일 잠금 목록 |

### POST /teams/:id/workers
```json
Request:  { "name": "string", "mcp_endpoint": "string" }
Response: { "id", "name", "connection_status": "offline", "task_status": "idle", "mcp_endpoint" }
```

### POST /workers/:id/heartbeat
```json
Request:  { "connection_status": "online|offline", "task_status": "idle|busy" }
Response: { "ok": true }
```

### GET /workers/:id/file-locks
```json
Response: { "locks": [{ "id", "file_path", "task_id", "locked_at" }] }
```

---

## Chat Rooms

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/teams/:id/rooms` | 채팅방 생성 |
| GET | `/teams/:id/rooms` | 채팅방 목록 |
| GET | `/rooms/:id` | 채팅방 조회 |
| PATCH | `/rooms/:id` | 채팅방 수정 (이름, worker_id 변경) |
| DELETE | `/rooms/:id` | 채팅방 삭제 |
| GET | `/rooms/:id/members` | 멤버 목록 |
| POST | `/rooms/:id/members` | 멤버 추가 |
| DELETE | `/rooms/:id/members/:userId` | 멤버 제거 |

### POST /teams/:id/rooms
```json
Request:  { "name": "string", "worker_id": "uuid" }
Response: { "id", "name", "team_id", "worker_id", "created_at" }
```

### PATCH /rooms/:id
```json
Request:  { "name"?: "string", "worker_id"?: "uuid" }
Response: { "id", "name", "worker_id" }
```

---

## Messages

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/rooms/:id/messages` | 메시지 목록 (페이지네이션) |
| POST | `/rooms/:id/messages` | 메시지 전송 (일반 채팅) |
| POST | `/rooms/:id/ai` | /ai 커맨드 실행 |

### GET /rooms/:id/messages
```
Query: ?cursor=<message_id>&limit=50
Response: { "messages": [...], "next_cursor": "string|null" }
```

### POST /rooms/:id/messages
```json
Request:  { "content": "string" }
Response: { "id", "room_id", "user_id", "content", "type": "chat", "created_at" }
```

### POST /rooms/:id/ai
```json
Request:  { "content": "string", "message_id": "uuid" }
Response: { "task_id": "uuid" }
// 비동기 처리 — 진행상황은 WebSocket Task 채널로 수신
```

---

## Tasks

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/rooms/:id/tasks` | 태스크 목록 |
| GET | `/tasks/:id` | 태스크 상세 |
| POST | `/tasks/:id/revert` | 변경사항 되돌리기 |

### GET /rooms/:id/tasks
```json
Response: { "tasks": [{ "id", "worker_id", "status", "result_diff", "created_at", "completed_at" }] }
```

### POST /tasks/:id/revert
```json
Request:  {}
Response: { "ok": true, "reverted_at": "timestamp" }
```

---

## WebSocket

### WS /ws/rooms/:id/chat — 채팅용
```
// 수신 이벤트
{ "type": "message", "data": { "id", "user_id", "content", "type", "created_at" } }

// 송신
{ "type": "message", "content": "string" }
```

### WS /ws/rooms/:id/tasks — Task 진행용
```
// 수신 이벤트
{ "type": "task_started",   "data": { "task_id", "worker_id" } }
{ "type": "task_progress",  "data": { "task_id", "progress": 0~100, "message": "string" } }
{ "type": "task_completed", "data": { "task_id", "result_diff", "completed_at" } }
{ "type": "task_failed",    "data": { "task_id", "error": "string" } }
```

---

## 공통 에러 포맷
```json
{ "error": { "code": "string", "message": "string" } }
```

| 코드 | 상황 |
|------|------|
| 400 | 잘못된 요청 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 충돌 (파일 잠금 등) |
| 500 | 서버 오류 |
