from fastapi import APIRouter

from app.api.routes import health
from app.modules.identity.router import router as identity_router

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["system"])
api_router.include_router(identity_router, tags=["identity"])
