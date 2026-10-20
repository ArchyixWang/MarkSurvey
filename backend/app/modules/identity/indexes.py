from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def ensure_identity_indexes(database: AsyncDatabase) -> None:
    await database.tenants.create_index([("created_at", ASCENDING)])

    await database.users.create_index([("account", ASCENDING)], unique=True)
    await database.users.create_index([("email", ASCENDING)], unique=True)
    await database.users.create_index([("tenant_id", ASCENDING)])

    await database.sessions.create_index([("token_hash", ASCENDING)], unique=True)
    await database.sessions.create_index([("user_id", ASCENDING)])
    await database.sessions.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

    await database.email_codes.create_index(
        [("email", ASCENDING), ("purpose", ASCENDING), ("created_at", DESCENDING)]
    )
    await database.email_codes.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

    await database.captcha_challenges.create_index(
        [("verification_token_hash", ASCENDING)], sparse=True
    )
    await database.captcha_challenges.create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0
    )

    await database.rate_limits.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
