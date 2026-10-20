from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __version__
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.database import open_database
from app.core.errors import (
    ApiError,
    api_error_handler,
    http_error_handler,
    validation_error_handler,
)
from app.modules.identity.email import EmailSender, build_email_sender
from app.modules.identity.repository import IdentityRepository
from app.modules.identity.service import IdentityService


def create_app(
    settings: Settings | None = None, email_sender: EmailSender | None = None
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        client, database = await open_database(application.state.settings)
        repository = IdentityRepository(database)
        sender = application.state.email_sender_override or build_email_sender(
            application.state.settings
        )
        application.state.mongo_client = client
        application.state.database = database
        application.state.identity_service = IdentityService(
            settings=application.state.settings,
            repository=repository,
            email_sender=sender,
        )
        try:
            yield
        finally:
            await client.close()

    application = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="MarkSurvey online survey system API.",
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.state.email_sender_override = email_sender

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_exception_handler(ApiError, api_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_exception_handler(StarletteHTTPException, http_error_handler)
    application.include_router(api_router, prefix=settings.api_prefix)

    return application


app = create_app()
