"""
MCP 자격증명 노출 회귀 테스트
실행: createdb syncai_test && pytest tests/test_mcp_exposure.py -v -p no:cacheprovider
     (다른 DB면 TEST_DATABASE_URL)

1. 팀 MCP 목록: 남의 MCP는 mcp_token·endpoint(터널 주소)를 받지 못한다 — 본인 것은 받는다
2. fs/browse · fs/pick-folder: 소유자만 — 팀 공개 MCP라도, 팀 밖이면 더더욱 403
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.auth import create_access_token
from app.database import Base, get_db
from app.main import app
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.models.team import Team, TeamMember
from app.models.user import User

# SQLite는 경로 파라미터(str)와 UUID 칼럼 비교에서 깨진다 — 운영과 같은 Postgres로 돌린다
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "postgresql://localhost/syncai_test")
engine = create_engine(TEST_DB_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


def _auth(user_id) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


@pytest.fixture
def world():
    """owner·mate는 같은 팀, outsider는 다른 팀. owner의 MCP는 팀 공개."""
    db = TestingSessionLocal()
    try:
        def user(name):
            u = User(id=uuid.uuid4(), email=f"{name}_{uuid.uuid4().hex[:6]}@test.com",
                     name=name, hashed_password="x")
            db.add(u)
            db.flush()
            return u

        owner, mate, outsider = user("owner"), user("mate"), user("outsider")
        team = Team(id=uuid.uuid4(), name="T", owner_id=owner.id)
        other = Team(id=uuid.uuid4(), name="O", owner_id=outsider.id)
        db.add_all([team, other])
        db.flush()
        db.add_all([
            TeamMember(team_id=team.id, user_id=owner.id, role="owner"),
            TeamMember(team_id=team.id, user_id=mate.id, role="member"),
            TeamMember(team_id=other.id, user_id=outsider.id, role="owner"),
        ])
        mcp = McpConfig(id=uuid.uuid4(), owner_user_id=owner.id, name="owner-pc",
                        endpoint="https://owner.trycloudflare.com", mcp_token="owner_secret_token")
        db.add(mcp)
        db.flush()
        db.add(McpConfigTeam(mcp_config_id=mcp.id, team_id=team.id, is_public=True))
        db.commit()
        return {"owner": owner.id, "mate": mate.id, "outsider": outsider.id,
                "team": team.id, "mcp": mcp.id}
    finally:
        db.close()


def test_teammate_does_not_get_token_or_endpoint(world):
    res = client.get(f"/v1/teams/{world['team']}/mcp-configs", headers=_auth(world["mate"]))
    assert res.status_code == 200, res.text
    [row] = res.json()
    assert row["name"] == "owner-pc"            # 팀 공개 MCP는 보인다 (멘션용)
    assert row["mcp_token"] is None
    assert not row["endpoint"]


def test_owner_still_gets_own_token(world):
    res = client.get(f"/v1/teams/{world['team']}/mcp-configs", headers=_auth(world["owner"]))
    [row] = res.json()
    assert row["mcp_token"] == "owner_secret_token"
    assert row["endpoint"] == "https://owner.trycloudflare.com"


@pytest.mark.parametrize("who", ["mate", "outsider"])
@pytest.mark.parametrize("path", ["fs/browse", "fs/pick-folder"])
def test_fs_endpoints_owner_only(world, who, path):
    res = client.get(f"/v1/mcp-configs/{world['mcp']}/{path}", headers=_auth(world[who]))
    assert res.status_code == 403, res.text
