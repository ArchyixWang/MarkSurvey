from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.modules.identity.models import (
    CaptchaChallengeRecord,
    EmailCodeRecord,
    SessionRecord,
    TenantRecord,
    UserRecord,
    captcha_from_document,
    email_code_from_document,
    session_from_document,
    tenant_from_document,
    user_from_document,
)


class DuplicateUserError(Exception):
    def __init__(self, field: str) -> None:
        super().__init__(field)
        self.field = field


def _object_id(value: str) -> ObjectId:
    return ObjectId(value)


class IdentityRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self.database = database
        self.tenants = database.tenants
        self.users = database.users
        self.sessions = database.sessions
        self.email_codes = database.email_codes
        self.captcha_challenges = database.captcha_challenges
        self.rate_limits = database.rate_limits

    async def create_tenant(self, name: str, now: datetime) -> TenantRecord:
        document = {"name": name, "created_at": now}
        result = await self.tenants.insert_one(document)
        return TenantRecord(id=str(result.inserted_id), name=name)

    async def delete_tenant(self, tenant_id: str) -> None:
        await self.tenants.delete_one({"_id": _object_id(tenant_id)})

    async def find_tenant(self, tenant_id: str) -> TenantRecord | None:
        document = await self.tenants.find_one({"_id": _object_id(tenant_id)})
        return tenant_from_document(document) if document else None

    async def count_tenants(self) -> int:
        return await self.tenants.count_documents({})

    async def count_users(self) -> int:
        return await self.users.count_documents({})

    async def find_user_conflicts(self, account: str, email: str) -> set[str]:
        document = await self.users.find_one(
            {"$or": [{"account": account}, {"email": email}]},
            {"account": 1, "email": 1},
        )
        if not document:
            return set()

        conflicts: set[str] = set()
        if document.get("account") == account:
            conflicts.add("account")
        if document.get("email") == email:
            conflicts.add("email")
        return conflicts

    async def create_user(
        self,
        *,
        tenant_id: str,
        username: str,
        account: str,
        email: str,
        password_hash: str,
        role: str,
        now: datetime,
    ) -> UserRecord:
        document = {
            "tenant_id": _object_id(tenant_id),
            "username": username,
            "account": account,
            "email": email,
            "password_hash": password_hash,
            "role": role,
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = await self.users.insert_one(document)
        except DuplicateKeyError as exc:
            key_pattern = getattr(exc, "details", {}).get("keyPattern", {})
            field = next((key for key in key_pattern if key in {"account", "email"}), "")
            raise DuplicateUserError(field) from exc

        document["_id"] = result.inserted_id
        return user_from_document(document)

    async def find_user_by_login(self, identifier: str, is_email: bool) -> UserRecord | None:
        field = "email" if is_email else "account"
        document = await self.users.find_one({field: identifier})
        return user_from_document(document) if document else None

    async def find_user_by_email(self, email: str) -> UserRecord | None:
        document = await self.users.find_one({"email": email})
        return user_from_document(document) if document else None

    async def find_user_in_tenant(self, user_id: str, tenant_id: str) -> UserRecord | None:
        document = await self.users.find_one(
            {"_id": _object_id(user_id), "tenant_id": _object_id(tenant_id)}
        )
        return user_from_document(document) if document else None

    async def update_user_password(
        self, user_id: str, tenant_id: str, password_hash: str, now: datetime
    ) -> bool:
        result = await self.users.update_one(
            {"_id": _object_id(user_id), "tenant_id": _object_id(tenant_id)},
            {"$set": {"password_hash": password_hash, "updated_at": now}},
        )
        return result.modified_count == 1

    async def create_session(
        self,
        *,
        token_hash: str,
        csrf_token_hash: str,
        user_id: str,
        tenant_id: str,
        expires_at: datetime,
        now: datetime,
    ) -> None:
        await self.sessions.insert_one(
            {
                "token_hash": token_hash,
                "csrf_token_hash": csrf_token_hash,
                "user_id": _object_id(user_id),
                "tenant_id": _object_id(tenant_id),
                "expires_at": expires_at,
                "created_at": now,
            }
        )

    async def find_session_by_token_hash(
        self, token_hash: str, now: datetime
    ) -> SessionRecord | None:
        document = await self.sessions.find_one(
            {"token_hash": token_hash, "expires_at": {"$gt": now}}
        )
        return session_from_document(document) if document else None

    async def delete_session(self, session_id: str) -> None:
        await self.sessions.delete_one({"_id": _object_id(session_id)})

    async def delete_user_sessions(self, user_id: str, tenant_id: str) -> None:
        await self.sessions.delete_many(
            {"user_id": _object_id(user_id), "tenant_id": _object_id(tenant_id)}
        )

    async def find_latest_email_code(self, email: str, purpose: str) -> EmailCodeRecord | None:
        document = await self.email_codes.find_one(
            {"email": email, "purpose": purpose},
            sort=[("created_at", DESCENDING)],
        )
        return email_code_from_document(document) if document else None

    async def invalidate_email_codes(self, email: str, purpose: str, now: datetime) -> None:
        await self.email_codes.update_many(
            {"email": email, "purpose": purpose, "consumed_at": None},
            {"$set": {"consumed_at": now}},
        )

    async def create_email_code(
        self,
        *,
        email: str,
        purpose: str,
        code_hash: str,
        expires_at: datetime,
        attempts_remaining: int,
        now: datetime,
    ) -> None:
        await self.email_codes.insert_one(
            {
                "email": email,
                "purpose": purpose,
                "code_hash": code_hash,
                "expires_at": expires_at,
                "attempts_remaining": attempts_remaining,
                "consumed_at": None,
                "created_at": now,
            }
        )

    async def find_active_email_code(
        self, email: str, purpose: str, now: datetime
    ) -> EmailCodeRecord | None:
        document = await self.email_codes.find_one(
            {
                "email": email,
                "purpose": purpose,
                "expires_at": {"$gt": now},
                "attempts_remaining": {"$gt": 0},
                "consumed_at": None,
            },
            sort=[("created_at", DESCENDING)],
        )
        return email_code_from_document(document) if document else None

    async def decrement_email_code_attempt(
        self, code_id: str, now: datetime
    ) -> EmailCodeRecord | None:
        document = await self.email_codes.find_one_and_update(
            {
                "_id": _object_id(code_id),
                "expires_at": {"$gt": now},
                "attempts_remaining": {"$gt": 0},
                "consumed_at": None,
            },
            {"$inc": {"attempts_remaining": -1}},
            return_document=ReturnDocument.AFTER,
        )
        return email_code_from_document(document) if document else None

    async def consume_email_code(self, code_id: str, now: datetime) -> bool:
        result = await self.email_codes.update_one(
            {"_id": _object_id(code_id), "consumed_at": None},
            {"$set": {"consumed_at": now}},
        )
        return result.modified_count == 1

    async def create_captcha_challenge(
        self,
        *,
        target_x: int,
        tolerance: int,
        attempts_remaining: int,
        expires_at: datetime,
        now: datetime,
    ) -> str:
        result = await self.captcha_challenges.insert_one(
            {
                "target_x": target_x,
                "tolerance": tolerance,
                "attempts_remaining": attempts_remaining,
                "challenge_expires_at": expires_at,
                "token_expires_at": None,
                "verification_token_hash": None,
                "verified_at": None,
                "consumed_at": None,
                "expires_at": expires_at,
                "created_at": now,
            }
        )
        return str(result.inserted_id)

    async def find_captcha_challenge(self, challenge_id: str) -> CaptchaChallengeRecord | None:
        try:
            object_id = _object_id(challenge_id)
        except InvalidId:
            return None
        document = await self.captcha_challenges.find_one({"_id": object_id})
        return captcha_from_document(document) if document else None

    async def decrement_captcha_attempt(
        self, challenge_id: str, now: datetime
    ) -> CaptchaChallengeRecord | None:
        document = await self.captcha_challenges.find_one_and_update(
            {
                "_id": _object_id(challenge_id),
                "challenge_expires_at": {"$gt": now},
                "attempts_remaining": {"$gt": 0},
                "verification_token_hash": None,
                "consumed_at": None,
            },
            {"$inc": {"attempts_remaining": -1}},
            return_document=ReturnDocument.AFTER,
        )
        return captcha_from_document(document) if document else None

    async def mark_captcha_verified(
        self,
        *,
        challenge_id: str,
        token_hash: str,
        token_expires_at: datetime,
        now: datetime,
    ) -> bool:
        result = await self.captcha_challenges.update_one(
            {
                "_id": _object_id(challenge_id),
                "verification_token_hash": None,
                "consumed_at": None,
                "challenge_expires_at": {"$gt": now},
            },
            {
                "$set": {
                    "verification_token_hash": token_hash,
                    "verified_at": now,
                    "token_expires_at": token_expires_at,
                    "expires_at": token_expires_at,
                }
            },
        )
        return result.modified_count == 1

    async def consume_captcha_token(self, token_hash: str, now: datetime) -> bool:
        result = await self.captcha_challenges.update_one(
            {
                "verification_token_hash": token_hash,
                "token_expires_at": {"$gt": now},
                "consumed_at": None,
            },
            {"$set": {"consumed_at": now}},
        )
        return result.modified_count == 1

    async def get_rate_limit_count(self, limit_id: str) -> int:
        document = await self.rate_limits.find_one({"_id": limit_id}, {"count": 1})
        return int(document["count"]) if document else 0

    async def hit_rate_limit(
        self,
        *,
        limit_id: str,
        action: str,
        scope: str,
        key: str,
        window_start: datetime,
        expires_at: datetime,
        now: datetime,
    ) -> int:
        update = {
            "$inc": {"count": 1},
            "$setOnInsert": {
                "action": action,
                "scope": scope,
                "key": key,
                "window_start": window_start,
                "expires_at": expires_at,
                "created_at": now,
            },
        }
        try:
            document = await self.rate_limits.find_one_and_update(
                {"_id": limit_id},
                update,
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            document = await self.rate_limits.find_one_and_update(
                {"_id": limit_id},
                {"$inc": {"count": 1}},
                return_document=ReturnDocument.AFTER,
            )
        return int(document["count"]) if document else 1
