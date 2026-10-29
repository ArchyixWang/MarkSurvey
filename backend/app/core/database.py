from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings
from app.modules.identity.indexes import ensure_identity_indexes
from app.modules.question_library.indexes import ensure_question_library_indexes
from app.modules.surveys.indexes import ensure_survey_indexes


async def open_database(settings: Settings) -> tuple[AsyncMongoClient, AsyncDatabase]:
    client = AsyncMongoClient(
        settings.mongodb_uri,
        tz_aware=True,
        serverSelectionTimeoutMS=5000,
    )
    await client.admin.command("ping")
    database = client[settings.mongodb_database]
    await ensure_identity_indexes(database)
    await ensure_survey_indexes(database)
    await ensure_question_library_indexes(database)
    return client, database
