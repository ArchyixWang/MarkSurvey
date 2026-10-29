from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class QuestionRootRecord:
    id: str
    tenant_id: str
    owner_user_id: str
    question_type: str
    latest_title: str
    latest_version_id: str
    latest_version_number: int
    required_by_default: bool
    source_kind: str | None
    source_question_id: str | None
    source_question_title: str | None
    source_version_id: str | None
    source_version_number: int | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class QuestionVersionRecord:
    id: str
    tenant_id: str
    owner_user_id: str
    question_id: str
    version_number: int
    content: dict[str, Any]
    base_version_id: str | None
    base_version_number: int | None
    restored_from_version_id: str | None
    restored_from_version_number: int | None
    shared_from_question_id: str | None
    shared_from_version_id: str | None
    shared_from_version_number: int | None
    created_by_user_id: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ShareRecord:
    id: str
    tenant_id: str
    owner_user_id: str
    question_id: str
    token_hash: str
    token_hint: str
    expires_at: datetime | None
    revoked_at: datetime | None
    created_by_user_id: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ShareImportRecord:
    id: str
    share_id: str
    source_question_id: str
    source_version_id: str
    source_version_number: int
    source_owner_user_id: str
    recipient_user_id: str
    recipient_tenant_id: str
    local_question_id: str
    local_version_id: str
    imported_at: datetime


@dataclass(frozen=True, slots=True)
class QuestionUsageRecord:
    id: str
    question_id: str
    question_version_id: str
    question_version_number: int
    tenant_id: str
    owner_user_id: str
    survey_id: str
    survey_version_id: str
    survey_version_number: int
    survey_question_id: str
    created_at: datetime


def _id(value: Any) -> str:
    return str(value)


def _optional_id(value: Any) -> str | None:
    return _id(value) if value is not None else None


def root_from_document(document: dict[str, Any]) -> QuestionRootRecord:
    return QuestionRootRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        owner_user_id=_id(document["owner_user_id"]),
        question_type=document["question_type"],
        latest_title=document["latest_title"],
        latest_version_id=_id(document["latest_version_id"]),
        latest_version_number=document["latest_version_number"],
        required_by_default=bool(document.get("required_by_default", False)),
        source_kind=document.get("source_kind"),
        source_question_id=_optional_id(document.get("source_question_id")),
        source_question_title=document.get("source_question_title"),
        source_version_id=_optional_id(document.get("source_version_id")),
        source_version_number=document.get("source_version_number"),
        archived_at=document.get("archived_at"),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def version_from_document(document: dict[str, Any]) -> QuestionVersionRecord:
    return QuestionVersionRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        owner_user_id=_id(document["owner_user_id"]),
        question_id=_id(document["question_id"]),
        version_number=document["version_number"],
        content=document["content"],
        base_version_id=_optional_id(document.get("base_version_id")),
        base_version_number=document.get("base_version_number"),
        restored_from_version_id=_optional_id(document.get("restored_from_version_id")),
        restored_from_version_number=document.get("restored_from_version_number"),
        shared_from_question_id=_optional_id(document.get("shared_from_question_id")),
        shared_from_version_id=_optional_id(document.get("shared_from_version_id")),
        shared_from_version_number=document.get("shared_from_version_number"),
        created_by_user_id=_id(document["created_by_user_id"]),
        created_at=document["created_at"],
    )


def share_from_document(document: dict[str, Any]) -> ShareRecord:
    return ShareRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        owner_user_id=_id(document["owner_user_id"]),
        question_id=_id(document["question_id"]),
        token_hash=document["token_hash"],
        token_hint=document["token_hint"],
        expires_at=document.get("expires_at"),
        revoked_at=document.get("revoked_at"),
        created_by_user_id=_id(document["created_by_user_id"]),
        created_at=document["created_at"],
    )


def share_import_from_document(document: dict[str, Any]) -> ShareImportRecord:
    return ShareImportRecord(
        id=_id(document["_id"]),
        share_id=_id(document["share_id"]),
        source_question_id=_id(document["source_question_id"]),
        source_version_id=_id(document["source_version_id"]),
        source_version_number=document["source_version_number"],
        source_owner_user_id=_id(document["source_owner_user_id"]),
        recipient_user_id=_id(document["recipient_user_id"]),
        recipient_tenant_id=_id(document["recipient_tenant_id"]),
        local_question_id=_id(document["local_question_id"]),
        local_version_id=_id(document["local_version_id"]),
        imported_at=document["imported_at"],
    )


def usage_from_document(document: dict[str, Any]) -> QuestionUsageRecord:
    return QuestionUsageRecord(
        id=_id(document["_id"]),
        question_id=_id(document["question_id"]),
        question_version_id=_id(document["question_version_id"]),
        question_version_number=document["question_version_number"],
        tenant_id=_id(document["tenant_id"]),
        owner_user_id=_id(document["owner_user_id"]),
        survey_id=_id(document["survey_id"]),
        survey_version_id=_id(document["survey_version_id"]),
        survey_version_number=document["survey_version_number"],
        survey_question_id=document["survey_question_id"],
        created_at=document["created_at"],
    )
