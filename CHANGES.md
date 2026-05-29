# CHANGES

## 2026-05-19 — Fly.io + Neon + Upstash + Vercel 스택으로 확정

### 변경 사항
- `syncai-backend/fly.toml` — 신규 생성: Fly.io 배포 설정 (nrt 리전, 256mb, 콜드스타트 방지, /health 체크)
- `DEPLOY.md` — Fly.io + Neon + Upstash + Vercel 배포 가이드로 전면 교체
  - 플랫폼 변경 이유: 비용 절감 + 관리 편의 + 콜드스타트 없음
  - fly secrets 명령으로 환경변수 관리

## 2026-05-19 — Render/Upstash/Vercel 검토 (Railway → Render 검토 후 Fly.io로 최종 변경)

## 2026-05-19 — Railway/Vercel 배포 준비 (코드 수정)

### 변경 파일
- `syncai-backend/app/config.py` — `CORS_ORIGINS` 환경변수 추가 (`get_cors_origins()` 메서드 포함)
- `syncai-backend/app/main.py` — CORS allow_origins를 하드코딩에서 `settings.get_cors_origins()` 로 변경
- `syncai-backend/.env.example` — `CORS_ORIGINS` 항목 추가
- `syncai-backend/Dockerfile` — `$PORT` 환경변수 대응 + `start.sh` 실행으로 변경
- `syncai-backend/start.sh` — 신규 생성: `alembic upgrade head` 후 uvicorn 실행

### 신규 파일
- `DEPLOY.md` — Railway + Vercel 배포 단계별 가이드 (환경변수 목록 포함)

### 로컬 개발 영향
- 없음. `.env`에 `CORS_ORIGINS` 없으면 기존 기본값(`localhost:3000`) 그대로 동작
