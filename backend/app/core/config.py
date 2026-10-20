from functools import lru_cache
from typing import Literal

from pydantic import Field
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
        ]
    )
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "marksurvey"


@lru_cache
def get_settings() -> Settings:
    return Settings()
