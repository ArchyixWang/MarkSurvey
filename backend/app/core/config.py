from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="MARKSURVEY_",
        extra="ignore",
    )

    app_name: str = "MarkSurvey API"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ]
    )
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "marksurvey"

    auth_secret: SecretStr = SecretStr("dev-only-change-this-secret-at-least-32-bytes")
    session_ttl_hours: int = Field(default=24, ge=1, le=24 * 30)
    session_cookie_name: str = "marksurvey_session"
    csrf_cookie_name: str = "marksurvey_csrf"
    cookie_secure: bool | None = None

    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "no-reply@marksurvey.local"
    smtp_tls: Literal["starttls", "ssl", "none"] = "starttls"

    email_code_ttl_minutes: int = Field(default=10, ge=1, le=60)
    email_code_resend_seconds: int = Field(default=60, ge=10, le=600)
    email_code_max_attempts: int = Field(default=5, ge=1, le=10)
    captcha_ttl_seconds: int = Field(default=120, ge=30, le=600)
    captcha_token_ttl_seconds: int = Field(default=300, ge=60, le=900)
    captcha_tolerance_px: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.environment == "production":
            if self.email_backend != "smtp":
                raise ValueError("Production requires MARKSURVEY_EMAIL_BACKEND=smtp")
            if len(self.auth_secret.get_secret_value()) < 32:
                raise ValueError("Production requires a 32+ character auth secret")

        if self.email_backend == "smtp" and not self.smtp_host:
            raise ValueError("MARKSURVEY_SMTP_HOST is required when using SMTP")

        return self

    @property
    def secure_cookies(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
