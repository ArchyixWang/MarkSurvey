import contextlib

from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import OperationFailure


async def ensure_survey_indexes(database: AsyncDatabase) -> None:
    await database.surveys.create_index([("short_code", ASCENDING)], unique=True)
    await database.surveys.create_index([("tenant_id", ASCENDING), ("updated_at", DESCENDING)])

    await database.survey_versions.create_index(
        [("survey_id", ASCENDING), ("version_number", ASCENDING)], unique=True
    )
    await database.survey_versions.create_index(
        [("tenant_id", ASCENDING), ("survey_id", ASCENDING), ("created_at", DESCENDING)]
    )

    await database.survey_responses.create_index(
        [
            ("survey_id", ASCENDING),
            ("owner_user_id", ASCENDING),
        ],
        unique=True,
        partialFilterExpression={"status": "draft"},
    )
    with contextlib.suppress(OperationFailure):
        await database.survey_responses.drop_index("survey_id_1_single_response_key_1")
    await database.survey_responses.create_index(
        [("survey_id", ASCENDING), ("single_response_key", ASCENDING)],
        name="uniq_survey_single_response_key",
        unique=True,
        partialFilterExpression={"single_response_key": {"$type": "string"}},
    )
    await database.survey_responses.create_index(
        [("tenant_id", ASCENDING), ("survey_id", ASCENDING), ("status", ASCENDING)]
    )
    await database.survey_responses.create_index(
        [("survey_id", ASCENDING), ("version_id", ASCENDING), ("status", ASCENDING)]
    )
    await database.survey_responses.create_index([("version_id", ASCENDING)])
    await database.survey_responses.create_index(
        [("survey_id", ASCENDING), ("submitted_at", DESCENDING)]
    )
