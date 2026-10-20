from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class TenantRecord:
    id: str
    name: str


@dataclass(frozen=True, slots=True)
class UserRecord:
    id: str
    tenant_id: str
    username: str
    account: str
    email: str
    password_hash: str
    role: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class SessionRecord:
    id: str
    token_hash: str
    csrf_token_hash: str
    user_id: str
    tenant_id: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class EmailCodeRecord:
    id: str
    email: str
    purpose: str
    code_hash: str
    expires_at: datetime
    attempts_remaining: int
    consumed_at: datetime | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class CaptchaChallengeRecord:
    id: str
    target_x: int
    tolerance: int
    attempts_remaining: int
    challenge_expires_at: datetime
    token_expires_at: datetime | None
    verification_token_hash: str | None
    consumed_at: datetime | None


@dataclass(frozen=True, slots=True)
class AuthContext:
    session: SessionRecord
    user: UserRecord
    tenant: TenantRecord


def _id(value: Any) -> str:
    return str(value)


def tenant_from_document(document: dict[str, Any]) -> TenantRecord:
    return TenantRecord(id=_id(document["_id"]), name=document["name"])


def user_from_document(document: dict[str, Any]) -> UserRecord:
    return UserRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        username=document["username"],
        account=document["account"],
        email=document["email"],
        password_hash=document["password_hash"],
        role=document["role"],
        created_at=document["created_at"],
    )


def session_from_document(document: dict[str, Any]) -> SessionRecord:
    return SessionRecord(
        id=_id(document["_id"]),
        token_hash=document["token_hash"],
        csrf_token_hash=document["csrf_token_hash"],
        user_id=_id(document["user_id"]),
        tenant_id=_id(document["tenant_id"]),
        expires_at=document["expires_at"],
    )


def email_code_from_document(document: dict[str, Any]) -> EmailCodeRecord:
    return EmailCodeRecord(
        id=_id(document["_id"]),
        email=document["email"],
        purpose=document["purpose"],
        code_hash=document["code_hash"],
        expires_at=document["expires_at"],
        attempts_remaining=document["attempts_remaining"],
        consumed_at=document.get("consumed_at"),
        created_at=document["created_at"],
    )


def captcha_from_document(document: dict[str, Any]) -> CaptchaChallengeRecord:
    return CaptchaChallengeRecord(
        id=_id(document["_id"]),
        target_x=document["target_x"],
        tolerance=document["tolerance"],
        attempts_remaining=document["attempts_remaining"],
        challenge_expires_at=document["challenge_expires_at"],
        token_expires_at=document.get("token_expires_at"),
        verification_token_hash=document.get("verification_token_hash"),
        consumed_at=document.get("consumed_at"),
    )
