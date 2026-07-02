from pydantic import BaseModel, EmailStr, ConfigDict
from app.schemas.team import TeamOut
import uuid


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    plan: str = "free"


class SignupResponse(BaseModel):
    user: UserOut
    token: str
    refresh_token: str


# 쿠키 설정과 동시에 body에도 토큰 포함 (API 클라이언트 호환)
class LoginResponse(BaseModel):
    user: UserOut
    token: str
    refresh_token: str
    teams: list[TeamOut] = []


class CookieSignupResponse(BaseModel):
    user: UserOut
    token: str
    refresh_token: str
    teams: list[TeamOut] = []
