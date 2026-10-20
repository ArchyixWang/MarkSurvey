from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.modules.surveys.models import (
    SurveyRecord,
    SurveyResponseRecord,
    SurveyVersionRecord,
    response_from_document,
    survey_from_document,
    version_from_document,
)


def _object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class DuplicateShortCodeError(Exception):
    pass


class VersionNumberConflictError(Exception):
    pass


class SurveyRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self.database = database
        self.surveys = database.surveys
        self.versions = database.survey_versions
        self.responses = database.survey_responses

    async def create_survey(self, document: dict[str, Any]) -> SurveyRecord:
        try:
            result = await self.surveys.insert_one(document)
        except DuplicateKeyError as error:
            raise DuplicateShortCodeError from error
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return survey_from_document(stored)

    async def find_survey(self, survey_id: str, tenant_id: str) -> SurveyRecord | None:
        try:
            object_id = _object_id(survey_id)
        except Exception:
            return None
        document = await self.surveys.find_one(
            {"_id": object_id, "tenant_id": _object_id(tenant_id)}
        )
        return survey_from_document(document) if document else None

    async def find_by_code(self, short_code: str) -> SurveyRecord | None:
        document = await self.surveys.find_one({"short_code": short_code})
        return survey_from_document(document) if document else None

    async def list_surveys(self, tenant_id: str) -> list[SurveyRecord]:
        cursor = self.surveys.find({"tenant_id": _object_id(tenant_id)}).sort(
            "updated_at", DESCENDING
        )
        return [survey_from_document(document) async for document in cursor]

    async def update_draft(
        self,
        survey_id: str,
        tenant_id: str,
        revision: int,
        schema: dict[str, Any],
        schema_hash: str,
        now: datetime,
    ) -> SurveyRecord | None:
        document = await self.surveys.find_one_and_update(
            {
                "_id": _object_id(survey_id),
                "tenant_id": _object_id(tenant_id),
                "draft_revision": revision,
            },
            {
                "$set": {
                    "draft_schema": schema,
                    "draft_schema_hash": schema_hash,
                    "updated_at": now,
                },
                "$inc": {"draft_revision": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        return survey_from_document(document) if document else None

    async def create_version(
        self,
        *,
        survey: SurveyRecord,
        schema: dict[str, Any],
        schema_hash: str,
        user_id: str,
        now: datetime,
    ) -> SurveyVersionRecord:
        version_number = (survey.active_version_number or 0) + 1
        document = {
            "tenant_id": _object_id(survey.tenant_id),
            "survey_id": _object_id(survey.id),
            "version_number": version_number,
            "schema": schema,
            "schema_hash": schema_hash,
            "created_by_user_id": _object_id(user_id),
            "created_at": now,
        }
        try:
            result = await self.versions.insert_one(document)
        except DuplicateKeyError as error:
            raise VersionNumberConflictError from error
        document["_id"] = result.inserted_id
        return version_from_document(document)

    async def delete_version(self, version_id: str, survey_id: str) -> None:
        await self.versions.delete_one(
            {"_id": _object_id(version_id), "survey_id": _object_id(survey_id)}
        )

    async def mark_published(
        self,
        survey_id: str,
        tenant_id: str,
        revision: int,
        version: SurveyVersionRecord,
        now: datetime,
    ) -> SurveyRecord | None:
        document = await self.surveys.find_one_and_update(
            {
                "_id": _object_id(survey_id),
                "tenant_id": _object_id(tenant_id),
                "draft_revision": revision,
            },
            {
                "$set": {
                    "status": "published",
                    "active_version_id": _object_id(version.id),
                    "active_version_number": version.version_number,
                    "active_schema_hash": version.schema_hash,
                    "published_at": now,
                    "closed_at": None,
                    "updated_at": now,
                },
                "$inc": {"draft_revision": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        return survey_from_document(document) if document else None

    async def list_versions(self, survey_id: str, tenant_id: str) -> list[SurveyVersionRecord]:
        cursor = self.versions.find(
            {
                "survey_id": _object_id(survey_id),
                "tenant_id": _object_id(tenant_id),
            }
        ).sort("version_number", DESCENDING)
        return [version_from_document(document) async for document in cursor]

    async def get_version(
        self, survey_id: str, tenant_id: str, version_id: str
    ) -> SurveyVersionRecord | None:
        try:
            object_id = _object_id(version_id)
        except Exception:
            return None
        document = await self.versions.find_one(
            {
                "_id": object_id,
                "survey_id": _object_id(survey_id),
                "tenant_id": _object_id(tenant_id),
            }
        )
        return version_from_document(document) if document else None

    async def close_survey(
        self, survey_id: str, tenant_id: str, now: datetime
    ) -> SurveyRecord | None:
        document = await self.surveys.find_one_and_update(
            {
                "_id": _object_id(survey_id),
                "tenant_id": _object_id(tenant_id),
                "status": {"$in": ["published", "closed"]},
            },
            {"$set": {"status": "closed", "closed_at": now, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return survey_from_document(document) if document else None

    async def set_deadline(
        self,
        survey_id: str,
        tenant_id: str,
        deadline_at: datetime | None,
        now: datetime,
    ) -> SurveyRecord | None:
        document = await self.surveys.find_one_and_update(
            {"_id": _object_id(survey_id), "tenant_id": _object_id(tenant_id)},
            {"$set": {"deadline_at": deadline_at, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return survey_from_document(document) if document else None

    async def response_counts(self, survey_ids: list[str]) -> dict[str, int]:
        if not survey_ids:
            return {}
        object_ids = [_object_id(survey_id) for survey_id in survey_ids]
        pipeline = [
            {"$match": {"survey_id": {"$in": object_ids}, "status": "submitted"}},
            {"$group": {"_id": "$survey_id", "count": {"$sum": 1}}},
        ]
        cursor = await self.responses.aggregate(pipeline)
        return {str(row["_id"]): int(row["count"]) async for row in cursor}

    async def invalidate_open_attempts(self, survey_id: str, reason: str, now: datetime) -> None:
        await self.responses.update_many(
            {"survey_id": _object_id(survey_id), "status": "draft"},
            {
                "$set": {
                    "status": "invalidated",
                    "invalidated_reason": reason,
                    "updated_at": now,
                }
            },
        )

    async def invalidate_stale_attempts(
        self, survey_id: str, active_version_id: str, now: datetime
    ) -> None:
        await self.responses.update_many(
            {
                "survey_id": _object_id(survey_id),
                "status": "draft",
                "version_id": {"$ne": _object_id(active_version_id)},
            },
            {
                "$set": {
                    "status": "invalidated",
                    "invalidated_reason": "version_changed",
                    "updated_at": now,
                }
            },
        )

    async def find_open_attempt(
        self, survey_id: str, owner_user_id: str
    ) -> SurveyResponseRecord | None:
        document = await self.responses.find_one(
            {
                "survey_id": _object_id(survey_id),
                "owner_user_id": _object_id(owner_user_id),
                "status": "draft",
            }
        )
        return response_from_document(document) if document else None

    async def find_submitted_attempt(
        self, survey_id: str, respondent_key_hash: str
    ) -> SurveyResponseRecord | None:
        document = await self.responses.find_one(
            {
                "survey_id": _object_id(survey_id),
                "respondent_key_hash": respondent_key_hash,
                "status": "submitted",
            },
            sort=[("submitted_at", DESCENDING)],
        )
        return response_from_document(document) if document else None

    async def create_attempt(self, document: dict[str, Any]) -> SurveyResponseRecord:
        try:
            result = await self.responses.insert_one(document)
        except DuplicateKeyError:
            existing = await self.find_open_attempt(
                str(document["survey_id"]), str(document["owner_user_id"])
            )
            if existing is None:
                raise
            return existing
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return response_from_document(stored)

    async def save_attempt(
        self,
        *,
        attempt_id: str,
        survey_id: str,
        version_id: str,
        owner_user_id: str,
        revision: int,
        answers: dict[str, Any],
        current_question_id: str | None,
        now: datetime,
    ) -> SurveyResponseRecord | None:
        document = await self.responses.find_one_and_update(
            {
                "_id": _object_id(attempt_id),
                "survey_id": _object_id(survey_id),
                "version_id": _object_id(version_id),
                "owner_user_id": _object_id(owner_user_id),
                "status": "draft",
                "revision": revision,
            },
            {
                "$set": {
                    "answers": answers,
                    "current_question_id": current_question_id,
                    "updated_at": now,
                },
                "$inc": {"revision": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        return response_from_document(document) if document else None

    async def submit_attempt(
        self,
        *,
        attempt_id: str,
        survey_id: str,
        version_id: str,
        owner_user_id: str,
        revision: int,
        answers: dict[str, Any],
        current_question_id: str | None,
        allow_anonymous: bool,
        allow_multiple: bool,
        respondent_key_hash: str,
        now: datetime,
    ) -> SurveyResponseRecord | None:
        update: dict[str, Any] = {
            "$set": {
                "status": "submitted",
                "answers": answers,
                "current_question_id": current_question_id,
                "revision": revision + 1,
                "updated_at": now,
                "submitted_at": now,
            },
            "$unset": {"owner_user_id": ""},
        }
        if allow_anonymous:
            update["$unset"]["respondent_user_id"] = ""
        else:
            update["$set"]["respondent_user_id"] = _object_id(owner_user_id)
        if allow_multiple:
            update["$unset"]["single_response_key"] = ""
        else:
            update["$set"]["single_response_key"] = respondent_key_hash
        document = await self.responses.find_one_and_update(
            {
                "_id": _object_id(attempt_id),
                "survey_id": _object_id(survey_id),
                "version_id": _object_id(version_id),
                "owner_user_id": _object_id(owner_user_id),
                "status": "draft",
                "revision": revision,
            },
            update,
            return_document=ReturnDocument.AFTER,
        )
        return response_from_document(document) if document else None

    async def list_submitted(self, survey_id: str) -> list[SurveyResponseRecord]:
        cursor = self.responses.find(
            {"survey_id": _object_id(survey_id), "status": "submitted"}
        ).sort("submitted_at", DESCENDING)
        return [response_from_document(document) async for document in cursor]

    async def get_attempt(self, attempt_id: str, survey_id: str) -> SurveyResponseRecord | None:
        try:
            object_id = _object_id(attempt_id)
        except Exception:
            return None
        document = await self.responses.find_one(
            {"_id": object_id, "survey_id": _object_id(survey_id)}
        )
        return response_from_document(document) if document else None
