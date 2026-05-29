"""
Auth API 테스트
실행: pytest tests/test_auth.py -v
"""
import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

# 테스트용 SQLite DB (Windows/Linux 모두 호환)
_DB_PATH = os.path.join(tempfile.gettempdir(), "syncai_test_auth.db")
TEST_DB_URL = f"sqlite:///{_DB_PATH}"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
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


# ─────────────────────────────────────────
# 회원가입 테스트
# ─────────────────────────────────────────

def test_signup_success():
    res = client.post("/v1/auth/signup", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "테스트유저"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["name"] == "테스트유저"
    assert "token" in data
    assert "refresh_token" in data


def test_signup_duplicate_email():
    payload = {"email": "dup@example.com", "password": "pw", "name": "유저"}
    client.post("/v1/auth/signup", json=payload)
    res = client.post("/v1/auth/signup", json=payload)
    assert res.status_code == 409


# ─────────────────────────────────────────
# 로그인 테스트
# ─────────────────────────────────────────

def test_login_success():
    client.post("/v1/auth/signup", json={
        "email": "login@example.com",
        "password": "mypassword",
        "name": "로그인유저"
    })
    res = client.post("/v1/auth/login", json={
        "email": "login@example.com",
        "password": "mypassword"
    })
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert "refresh_token" in data


def test_login_wrong_password():
    client.post("/v1/auth/signup", json={
        "email": "fail@example.com",
        "password": "correctpw",
        "name": "유저"
    })
    res = client.post("/v1/auth/login", json={
        "email": "fail@example.com",
        "password": "wrongpw"
    })
    assert res.status_code == 401


def test_login_nonexistent_user():
    res = client.post("/v1/auth/login", json={
        "email": "nobody@example.com",
        "password": "pw"
    })
    assert res.status_code == 401


# ─────────────────────────────────────────
# 토큰 갱신 테스트
# ─────────────────────────────────────────

def test_refresh_token_success():
    res = client.post("/v1/auth/signup", json={
        "email": "refresh@example.com",
        "password": "pw123",
        "name": "갱신유저"
    })
    refresh_token = res.json()["refresh_token"]

    res2 = client.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res2.status_code == 200
    data = res2.json()
    assert "token" in data
    assert "refresh_token" in data


def test_refresh_with_invalid_token():
    res = client.post("/v1/auth/refresh", json={"refresh_token": "invalid.token.here"})
    assert res.status_code == 401


def test_refresh_with_access_token_rejected():
    """access token을 refresh에 쓰면 거부되어야 함"""
    res = client.post("/v1/auth/signup", json={
        "email": "wrong@example.com",
        "password": "pw",
        "name": "유저"
    })
    access_token = res.json()["token"]
    client.cookies.clear()  # 쿠키의 valid refresh_token이 body 토큰을 덮어쓰지 않도록
    res2 = client.post("/v1/auth/refresh", json={"refresh_token": access_token})
    assert res2.status_code == 401


# ─────────────────────────────────────────
# 로그아웃 테스트
# ─────────────────────────────────────────

def test_logout():
    res = client.post("/v1/auth/logout")
    assert res.status_code == 200
    assert res.json()["ok"] is True
