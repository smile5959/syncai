"""
개발 환경 시드 스크립트
========================
DB 리셋 후 mcp_configs / mcp_config_teams 레코드를 자동 복구한다.

사용법:
    cd syncai-backend
    python scripts/seed_dev.py

동작:
  1. mcp-server/.env  에서 MCP_AUTH_TOKEN / MCP_BASE_DIR / MCP_PORT 읽기
  2. syncai-backend/.env 에서 DATABASE_URL 읽기
  3. users 테이블에서 SYNCAI_TOKEN(JWT)의 sub → owner_user_id 결정
     (토큰 없으면 첫 번째 유저 사용)
  4. mcp_configs에 해당 토큰 레코드가 없으면 INSERT (idempotent)
  5. workers 테이블의 모든 팀 → mcp_config_teams INSERT (is_public=true, idempotent)

주의:
  - 개발 환경 전용 (APP_ENV=development 일 때만 실행)
  - 프로덕션 DB에 절대 실행하지 말 것
"""
import os
import sys
import uuid
import base64
import json
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent          # syncai-backend/scripts/
BACKEND_DIR  = SCRIPT_DIR.parent                        # syncai-backend/
MCP_ENV_FILE = BACKEND_DIR / "mcp-server" / ".env"          # mcp-server/.env
BACKEND_ENV  = BACKEND_DIR / ".env"


def load_env_file(path: Path) -> dict[str, str]:
    """단순 key=value .env 파서 (따옴표 제거 포함)."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip().strip('"').strip("'")
        env[key.strip()] = val
    return env


def decode_jwt_sub(token: str) -> str | None:
    """JWT payload에서 sub 필드 추출 (서명 검증 없음 — 로컬 개발용)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # base64url padding 보정
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub")
    except Exception:
        return None


def main() -> None:
    # ─── 0. 환경변수 로드 ────────────────────────────────────────────────────
    backend_env = load_env_file(BACKEND_ENV)
    mcp_env     = load_env_file(MCP_ENV_FILE)

    # 개발 환경 가드
    app_env = backend_env.get("APP_ENV", "development")
    if app_env != "development":
        print(f"[seed] APP_ENV={app_env} — 개발 환경이 아니므로 실행을 중단합니다.")
        sys.exit(1)

    database_url  = backend_env.get("DATABASE_URL", "")
    mcp_token     = mcp_env.get("MCP_AUTH_TOKEN", "")
    mcp_base_dir  = mcp_env.get("MCP_BASE_DIR", "")
    mcp_port      = mcp_env.get("MCP_PORT", "7860")
    syncai_token  = mcp_env.get("SYNCAI_TOKEN", "")

    if not database_url:
        print("[seed] ERROR: DATABASE_URL이 설정되지 않았습니다 (syncai-backend/.env 확인).")
        sys.exit(1)

    if not mcp_token:
        print("[seed] ERROR: MCP_AUTH_TOKEN이 설정되지 않았습니다 (mcp-server/.env 확인).")
        sys.exit(1)

    # ─── 1. DB 연결 ──────────────────────────────────────────────────────────
    try:
        import sqlalchemy as sa
        from sqlalchemy import text
    except ImportError:
        print("[seed] ERROR: sqlalchemy가 설치되지 않았습니다. pip install sqlalchemy psycopg2-binary")
        sys.exit(1)

    engine = sa.create_engine(database_url, future=True)

    with engine.connect() as conn:
        # ─── 2. owner_user_id 결정 ──────────────────────────────────────────
        owner_id: str | None = None

        if syncai_token:
            sub = decode_jwt_sub(syncai_token)
            if sub:
                row = conn.execute(
                    text("SELECT id FROM users WHERE id = :uid LIMIT 1"),
                    {"uid": sub},
                ).fetchone()
                if row:
                    owner_id = str(row[0])
                    print(f"[seed] owner: JWT sub → {owner_id}")

        if not owner_id:
            row = conn.execute(text("SELECT id FROM users ORDER BY created_at LIMIT 1")).fetchone()
            if not row:
                print("[seed] ERROR: users 테이블이 비어있습니다. 먼저 회원가입 후 실행하세요.")
                sys.exit(1)
            owner_id = str(row[0])
            print(f"[seed] owner: 첫 번째 유저 → {owner_id}")

        # ─── 3. mcp_configs upsert ──────────────────────────────────────────
        existing = conn.execute(
            text("SELECT id FROM mcp_configs WHERE mcp_token = :token LIMIT 1"),
            {"token": mcp_token},
        ).fetchone()

        if existing:
            config_id = str(existing[0])
            print(f"[seed] mcp_configs: 이미 존재 (id={config_id}) — skip")
        else:
            config_id = str(uuid.uuid4())
            conn.execute(
                text("""
                    INSERT INTO mcp_configs
                        (id, owner_user_id, name, endpoint, base_dir, mcp_token, created_at)
                    VALUES
                        (:id, :owner, 'dev-local', :endpoint, :base_dir, :token, NOW())
                """),
                {
                    "id":       config_id,
                    "owner":    owner_id,
                    "endpoint": f"http://localhost:{mcp_port}",
                    "base_dir": mcp_base_dir,
                    "token":    mcp_token,
                },
            )
            conn.commit()
            print(f"[seed] mcp_configs: 생성 완료 (id={config_id})")

        # ─── 4. 모든 팀 → mcp_config_teams 연결 ────────────────────────────
        teams = conn.execute(text("SELECT DISTINCT team_id FROM workers")).fetchall()
        if not teams:
            # workers가 없으면 teams 테이블에서 직접 조회
            teams = conn.execute(text("SELECT id FROM teams")).fetchall()
            team_ids = [str(r[0]) for r in teams]
        else:
            team_ids = [str(r[0]) for r in teams]

        inserted = 0
        for team_id in team_ids:
            already = conn.execute(
                text("""
                    SELECT 1 FROM mcp_config_teams
                    WHERE mcp_config_id = :cid AND team_id = :tid
                """),
                {"cid": config_id, "tid": team_id},
            ).fetchone()
            if not already:
                conn.execute(
                    text("""
                        INSERT INTO mcp_config_teams (mcp_config_id, team_id, is_public)
                        VALUES (:cid, :tid, true)
                    """),
                    {"cid": config_id, "tid": team_id},
                )
                inserted += 1

        if team_ids:
            conn.commit()
            print(f"[seed] mcp_config_teams: {inserted}개 팀 연결 완료 (총 {len(team_ids)}팀)")
        else:
            print("[seed] mcp_config_teams: 연결할 팀 없음 (팀 생성 후 재실행 권장)")

        # ─── 5. 결과 요약 ───────────────────────────────────────────────────
        print()
        print("=" * 55)
        print("  ✅  seed 완료")
        print(f"  mcp_config_id : {config_id}")
        print(f"  mcp_token     : {mcp_token}")
        print(f"  owner_user_id : {owner_id}")
        print(f"  base_dir      : {mcp_base_dir}")
        print(f"  endpoint      : http://localhost:{mcp_port}")
        print(f"  팀 연결       : {len(team_ids)}개")
        print("=" * 55)
        print()
        print("  이제 MCP 서버를 재시작하면 heartbeat이 정상 작동합니다.")
        print("  cd mcp-server && python server.py")
        print()


if __name__ == "__main__":
    main()
