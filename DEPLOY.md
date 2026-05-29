# SyncAI 배포 가이드

> **배포 구성:** Frontend → Vercel (무료) / Backend → Fly.io (무료~$3/월) / PostgreSQL → Neon (무료) / Redis → Upstash (무료)
>
> 콜드 스타트 없음 · WebSocket 안정 · DB 무기한 무료

---

## 0. 사전 준비

- GitHub에 코드가 push된 상태여야 함
- 아래 CLI 설치 필요 (배포 시 한 번만):
  ```bash
  # Fly.io CLI 설치
  # Windows PowerShell
  iwr https://fly.io/install.ps1 -useb | iex
  ```

---

## 1. Neon PostgreSQL 생성 (무료)

1. [neon.tech](https://neon.tech) 가입 (GitHub 로그인 가능)
2. **Create Project** → 이름: `syncai` → Region: `AWS Asia Pacific (Singapore)`
3. 생성 후 **Dashboard** → **Connection string** 복사
   - 형식: `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. 이 값을 `DATABASE_URL`로 사용

---

## 2. Upstash Redis 생성 (무료)

1. [upstash.com](https://upstash.com) 가입 (GitHub 로그인 가능)
2. **Create Database** → 이름: `syncai-redis` → Region: `ap-northeast-1 (Tokyo)`
3. 생성 후 **Details** 탭 → **Redis Connection String** 복사
   - 형식: `rediss://default:PASSWORD@HOST:PORT`
4. 이 값을 `REDIS_URL`로 사용

---

## 3. Fly.io 배포 (Backend)

### 3-1. Fly.io 가입 및 CLI 로그인

1. [fly.io](https://fly.io) 가입
2. 터미널에서:
   ```bash
   fly auth login
   ```

### 3-2. 앱 생성 및 배포

`syncai-backend/` 폴더에서 실행:

```bash
cd syncai-backend

# 앱 생성 (fly.toml이 이미 있으므로 --name만 지정)
fly apps create syncai-backend

# 환경변수 주입 (민감한 값은 secrets로 관리)
fly secrets set \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="rediss://..." \
  SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')" \
  ANTHROPIC_API_KEY="sk-ant-..." \
  GEMINI_API_KEY="..." \
  CORS_ORIGINS="http://localhost:3000,https://your-app.vercel.app" \
  ALGORITHM="HS256" \
  ACCESS_TOKEN_EXPIRE_MINUTES="30" \
  REFRESH_TOKEN_EXPIRE_DAYS="30" \
  APP_ENV="production"

# 배포
fly deploy
```

### 3-3. 배포 확인

```bash
fly status           # 서비스 상태 확인
fly logs             # 실시간 로그 확인
```

브라우저에서 헬스체크:
```
GET https://syncai-backend.fly.dev/health
응답: {"status": "ok"}
```

---

## 4. Vercel 배포 (Frontend)

### 4-1. 프로젝트 연결

1. [vercel.com](https://vercel.com) 가입 (GitHub 로그인)
2. **Add New Project** → GitHub 레포 선택
3. **Root Directory**: `syncai-frontend`
4. Framework: **Next.js** (자동 감지)

### 4-2. 환경변수 입력

| 변수명 | 값 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://syncai-backend.fly.dev/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://syncai-backend.fly.dev/ws` ← **wss://** 주의! |

### 4-3. 배포 후 CORS 업데이트

Vercel 도메인 확정 후 (예: `https://syncai.vercel.app`):

```bash
cd syncai-backend
fly secrets set CORS_ORIGINS="http://localhost:3000,https://syncai.vercel.app"
```

→ Fly.io 자동 재배포됨

---

## 5. MCP 서버 설정 변경

Worker PC의 `syncai-backend/mcp-server/.env` 수정:

```env
# 변경 전
SYNCAI_BACKEND_URL=http://localhost:8001

# 변경 후
SYNCAI_BACKEND_URL=https://syncai-backend.fly.dev
```

변경 후 `start.bat` 재실행.

---

## 6. 로컬 개발 환경 유지

로컬 `.env`는 그대로:
```env
DATABASE_URL=postgresql://syncai:syncai@localhost:5432/syncai
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
APP_ENV=development
```

프론트 `.env.local`도 그대로:
```env
NEXT_PUBLIC_API_URL=http://localhost:8001/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
```

---

## 7. 유용한 Fly.io 명령어

```bash
fly logs                        # 실시간 로그
fly status                      # 서비스 상태
fly secrets list                # 등록된 환경변수 목록 (값은 비공개)
fly secrets set KEY=VALUE       # 환경변수 추가/수정
fly deploy                      # 재배포
fly ssh console                 # 컨테이너 접속
```

---

## 8. 실서비스 전환 시 비용 예상

| 항목 | 무료 한도 초과 시 |
|---|---|
| Fly.io | shared-cpu-1x 256mb → 월 ~$2-3 (이미 무료 범위 내) |
| Neon | 0.5GB 초과 시 Pro $19/월 (웬만해선 안 넘음) |
| Upstash | 10,000 req/day 초과 시 $0.2/10만 req (매우 저렴) |
| Vercel | 대역폭 초과 시 Pro $20/월 |
