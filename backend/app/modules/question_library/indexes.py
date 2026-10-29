from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def ensure_question_library_indexes(database: AsyncDatabase) -> None:
    await database.question_roots.create_index(
        [("tenant_id", ASCENDING), ("owner_user_id", ASCENDING), ("updated_at", DESCENDING)]
    )
    await database.question_roots.create_index(
        [("owner_user_id", ASCENDING), ("archived_at", ASCENDING), ("updated_at", DESCENDING)]
    )

    await database.question_versions.create_index(
        [("question_id", ASCENDING), ("version_number", ASCENDING)], unique=True
    )
    await database.question_versions.create_index(
        [("tenant_id", ASCENDING), ("owner_user_id", ASCENDING), ("created_at", DESCENDING)]
    )

    await database.question_shares.create_index([("token_hash", ASCENDING)], unique=True)
    await database.question_shares.create_index(
        [("question_id", ASCENDING), ("created_at", DESCENDING)]
    )

    await database.question_share_imports.create_index(
        [("recipient_user_id", ASCENDING), ("imported_at", DESCENDING)]
    )
    await database.question_share_imports.create_index(
        [("share_id", ASCENDING), ("recipient_user_id", ASCENDING)]
    )

    await database.question_usages.create_index(
        [("survey_version_id", ASCENDING), ("survey_question_id", ASCENDING)], unique=True
    )
    await database.question_usages.create_index(
        [("question_id", ASCENDING), ("owner_user_id", ASCENDING), ("tenant_id", ASCENDING)]
    )
    await database.question_usages.create_index([("survey_id", ASCENDING)])
