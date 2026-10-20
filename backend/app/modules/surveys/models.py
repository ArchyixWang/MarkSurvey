from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class SurveyRecord:
    id: str
    tenant_id: str
    created_by_user_id: str
    short_code: str
    status: str
    draft_schema: dict[str, Any]
    draft_revision: int
    draft_schema_hash: str
    active_version_id: str | None
    active_version_number: int | None
    active_schema_hash: str | None
    deadline_at: datetime | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    closed_at: datetime | None


@dataclass(frozen=True, slots=True)
class SurveyVersionRecord:
    id: str
    tenant_id: str
    survey_id: str
    version_number: int
    schema: dict[str, Any]
    schema_hash: str
    created_by_user_id: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class SurveyResponseRecord:
    id: str
    tenant_id: str
    survey_id: str
    version_id: str
    owner_user_id: str | None
    respondent_user_id: str | None
    respondent_key_hash: str
    single_response_key: str | None
    status: str
    answers: dict[str, Any]
    current_question_id: str | None
    revision: int
    started_at: datetime
    updated_at: datetime
    submitted_at: datetime | None


def _id(value: Any) -> str:
    return str(value)


def survey_from_document(document: dict[str, Any]) -> SurveyRecord:
    return SurveyRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        created_by_user_id=_id(document["created_by_user_id"]),
        short_code=document["short_code"],
        status=document["status"],
        draft_schema=document["draft_schema"],
        draft_revision=document["draft_revision"],
        draft_schema_hash=document["draft_schema_hash"],
        active_version_id=(
            _id(document["active_version_id"]) if document.get("active_version_id") else None
        ),
        active_version_number=document.get("active_version_number"),
        active_schema_hash=document.get("active_schema_hash"),
        deadline_at=document.get("deadline_at"),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
        published_at=document.get("published_at"),
        closed_at=document.get("closed_at"),
    )


def version_from_document(document: dict[str, Any]) -> SurveyVersionRecord:
    return SurveyVersionRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        survey_id=_id(document["survey_id"]),
        version_number=document["version_number"],
        schema=document["schema"],
        schema_hash=document["schema_hash"],
        created_by_user_id=_id(document["created_by_user_id"]),
        created_at=document["created_at"],
    )


def response_from_document(document: dict[str, Any]) -> SurveyResponseRecord:
    return SurveyResponseRecord(
        id=_id(document["_id"]),
        tenant_id=_id(document["tenant_id"]),
        survey_id=_id(document["survey_id"]),
        version_id=_id(document["version_id"]),
        owner_user_id=(_id(document["owner_user_id"]) if document.get("owner_user_id") else None),
        respondent_user_id=(
            _id(document["respondent_user_id"]) if document.get("respondent_user_id") else None
        ),
        respondent_key_hash=document["respondent_key_hash"],
        single_response_key=document.get("single_response_key"),
        status=document["status"],
        answers=document.get("answers", {}),
        current_question_id=document.get("current_question_id"),
        revision=document["revision"],
        started_at=document["started_at"],
        updated_at=document["updated_at"],
        submitted_at=document.get("submitted_at"),
    )
