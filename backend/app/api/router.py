from fastapi import APIRouter

from app.api.routes import health
from app.modules.identity.router import router as identity_router
from app.modules.question_library.router import router as question_library_router
from app.modules.surveys.router import public_router as public_surveys_router
from app.modules.surveys.router import router as surveys_router

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["system"])
api_router.include_router(identity_router, tags=["identity"])
api_router.include_router(question_library_router, tags=["question-library"])
api_router.include_router(surveys_router, tags=["surveys"])
api_router.include_router(public_surveys_router, tags=["survey-responses"])
