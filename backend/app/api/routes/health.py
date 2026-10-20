from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app import __version__
from app.core.config import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
    environment: str


@router.get("", response_model=HealthResponse, summary="服务健康检查")
def get_health() -> HealthResponse:
    settings = get_settings()

    return HealthResponse(
        service=settings.app_name,
        version=__version__,
        environment=settings.environment,
    )
