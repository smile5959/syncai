from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str = "postgresql://syncai:syncai@localhost:5432/syncai"
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    OPENROUTER_API_KEY: str = ""
    APP_ENV: str = "development"
    # CORS — 쉼표로 구분된 허용 출처 목록
    # 예: CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    FRONTEND_URL: str = "https://syncai-frontend.vercel.app"

    def get_cors_origins(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_set(cls, v: str) -> str:
        insecure_defaults = {"change-me", "secret", "password", ""}
        if v in insecure_defaults or len(v) < 32:
            raise ValueError(
                "SECRET_KEY is insecure. Set a strong random value (≥32 chars) in your .env file.\n"
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return v


settings = Settings()
