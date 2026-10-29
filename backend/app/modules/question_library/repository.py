from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.modules.question_library.models import (
    QuestionRootRecord,
    QuestionUsageRecord,
    QuestionVersionRecord,
    ShareImportRecord,
    ShareRecord,
    root_from_document,
    share_from_document,
    share_import_from_document,
    usage_from_document,
    version_from_document,
)


def _object_id(value: str | ObjectId) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


class QuestionVersionConflictError(Exception):
    pass


class ShareTokenConflictError(Exception):
    pass


class QuestionLibraryRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self.database = database
        self.roots = database.question_roots
        self.versions = database.question_versions
        self.shares = database.question_shares
        self.imports = database.question_share_imports
        self.usages = database.question_usages
        self.surveys = database.surveys
        self.survey_versions = database.survey_versions
        self.responses = database.survey_responses

    async def insert_root(self, document: dict[str, Any]) -> QuestionRootRecord:
        result = await self.roots.insert_one(document)
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return root_from_document(stored)

    async def insert_version(self, document: dict[str, Any]) -> QuestionVersionRecord:
        try:
            result = await self.versions.insert_one(document)
        except DuplicateKeyError as error:
            raise QuestionVersionConflictError from error
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return version_from_document(stored)

    async def delete_version(self, version_id: str) -> None:
        await self.versions.delete_one({"_id": _object_id(version_id)})

    async def find_root(
        self, question_id: str, owner_user_id: str, tenant_id: str
    ) -> QuestionRootRecord | None:
        try:
            object_id = _object_id(question_id)
        except Exception:
            return None
        document = await self.roots.find_one(
            {
                "_id": object_id,
                "owner_user_id": _object_id(owner_user_id),
                "tenant_id": _object_id(tenant_id),
            }
        )
        return root_from_document(document) if document else None

    async def list_roots(
        self,
        *,
        owner_user_id: str,
        tenant_id: str,
        search: str | None,
        question_type: str | None,
        archived: bool,
        skip: int,
        limit: int,
    ) -> tuple[list[QuestionRootRecord], int]:
        query: dict[str, Any] = {
            "owner_user_id": _object_id(owner_user_id),
            "tenant_id": _object_id(tenant_id),
            "archived_at": {"$ne": None} if archived else None,
        }
        if question_type:
            query["question_type"] = question_type
        if search:
            query["latest_title"] = {"$regex": re.escape(search), "$options": "i"}
        total = await self.roots.count_documents(query)
        cursor = self.roots.find(query).sort("updated_at", DESCENDING).skip(skip).limit(limit)
        return [root_from_document(document) async for document in cursor], total

    async def get_versions_by_ids(self, version_ids: list[str]) -> dict[str, QuestionVersionRecord]:
        if not version_ids:
            return {}
        cursor = self.versions.find({"_id": {"$in": [_object_id(item) for item in version_ids]}})
        return {str(document["_id"]): version_from_document(document) async for document in cursor}

    async def usage_survey_counts(
        self, *, question_ids: list[str], owner_user_id: str, tenant_id: str
    ) -> dict[str, int]:
        if not question_ids:
            return {}
        pipeline = [
            {
                "$match": {
                    "question_id": {"$in": [_object_id(item) for item in question_ids]},
                    "owner_user_id": _object_id(owner_user_id),
                    "tenant_id": _object_id(tenant_id),
                }
            },
            {
                "$group": {
                    "_id": {
                        "question_id": "$question_id",
                        "survey_id": "$survey_id",
                    }
                }
            },
            {"$group": {"_id": "$_id.question_id", "count": {"$sum": 1}}},
        ]
        cursor = await self.usages.aggregate(pipeline)
        return {str(row["_id"]): int(row["count"]) async for row in cursor}

    async def get_version(self, question_id: str, version_id: str) -> QuestionVersionRecord | None:
        try:
            object_id = _object_id(version_id)
        except Exception:
            return None
        document = await self.versions.find_one(
            {"_id": object_id, "question_id": _object_id(question_id)}
        )
        return version_from_document(document) if document else None

    async def get_version_for_owner(
        self,
        question_id: str,
        version_id: str,
        owner_user_id: str,
        tenant_id: str,
    ) -> QuestionVersionRecord | None:
        try:
            object_id = _object_id(version_id)
        except Exception:
            return None
        document = await self.versions.find_one(
            {
                "_id": object_id,
                "question_id": _object_id(question_id),
                "owner_user_id": _object_id(owner_user_id),
                "tenant_id": _object_id(tenant_id),
            }
        )
        return version_from_document(document) if document else None

    async def list_versions(
        self, *, question_id: str, owner_user_id: str, tenant_id: str
    ) -> list[QuestionVersionRecord]:
        cursor = self.versions.find(
            {
                "question_id": _object_id(question_id),
                "owner_user_id": _object_id(owner_user_id),
                "tenant_id": _object_id(tenant_id),
            }
        ).sort("version_number", DESCENDING)
        return [version_from_document(document) async for document in cursor]

    async def count_versions(self, question_id: str) -> int:
        return await self.versions.count_documents({"question_id": _object_id(question_id)})

    async def promote_version(
        self,
        *,
        question_id: str,
        expected_version_number: int,
        version: QuestionVersionRecord,
        title: str,
        required_by_default: bool,
        now: datetime,
    ) -> bool:
        document = await self.roots.find_one_and_update(
            {
                "_id": _object_id(question_id),
                "latest_version_number": expected_version_number,
            },
            {
                "$set": {
                    "latest_version_id": _object_id(version.id),
                    "latest_version_number": version.version_number,
                    "latest_title": title,
                    "required_by_default": required_by_default,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return document is not None

    async def set_archived(
        self, question_id: str, archived_at: datetime | None, now: datetime
    ) -> QuestionRootRecord | None:
        document = await self.roots.find_one_and_update(
            {"_id": _object_id(question_id)},
            {"$set": {"archived_at": archived_at, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return root_from_document(document) if document else None

    async def create_share(self, document: dict[str, Any]) -> ShareRecord:
        try:
            result = await self.shares.insert_one(document)
        except DuplicateKeyError as error:
            raise ShareTokenConflictError from error
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return share_from_document(stored)

    async def list_shares(self, question_id: str) -> list[ShareRecord]:
        cursor = self.shares.find({"question_id": _object_id(question_id)}).sort(
            "created_at", DESCENDING
        )
        return [share_from_document(document) async for document in cursor]

    async def revoke_share(
        self, share_id: str, question_id: str, now: datetime
    ) -> ShareRecord | None:
        try:
            object_id = _object_id(share_id)
        except Exception:
            return None
        document = await self.shares.find_one_and_update(
            {"_id": object_id, "question_id": _object_id(question_id)},
            {"$set": {"revoked_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return share_from_document(document) if document else None

    async def find_share_by_hash(self, token_hash: str) -> ShareRecord | None:
        document = await self.shares.find_one({"token_hash": token_hash})
        return share_from_document(document) if document else None

    async def create_import(self, document: dict[str, Any]) -> ShareImportRecord:
        result = await self.imports.insert_one(document)
        stored = dict(document)
        stored["_id"] = result.inserted_id
        return share_import_from_document(stored)

    async def list_imports(
        self, *, recipient_user_id: str, skip: int, limit: int
    ) -> tuple[list[ShareImportRecord], int]:
        query = {"recipient_user_id": _object_id(recipient_user_id)}
        total = await self.imports.count_documents(query)
        cursor = self.imports.find(query).sort("imported_at", DESCENDING).skip(skip).limit(limit)
        return [share_import_from_document(document) async for document in cursor], total

    async def get_shares_by_ids(self, share_ids: list[str]) -> dict[str, ShareRecord]:
        if not share_ids:
            return {}
        cursor = self.shares.find({"_id": {"$in": [_object_id(item) for item in share_ids]}})
        return {str(document["_id"]): share_from_document(document) async for document in cursor}

    async def upsert_usages(self, documents: list[dict[str, Any]]) -> None:
        for document in documents:
            await self.usages.update_one(
                {
                    "survey_version_id": document["survey_version_id"],
                    "survey_question_id": document["survey_question_id"],
                },
                {"$set": document},
                upsert=True,
            )

    async def delete_usages_for_survey_version(self, survey_version_id: str) -> None:
        await self.usages.delete_many({"survey_version_id": _object_id(survey_version_id)})

    async def list_usages(
        self, *, question_id: str, owner_user_id: str, tenant_id: str
    ) -> list[QuestionUsageRecord]:
        cursor = self.usages.find(
            {
                "question_id": _object_id(question_id),
                "owner_user_id": _object_id(owner_user_id),
                "tenant_id": _object_id(tenant_id),
            }
        ).sort("created_at", DESCENDING)
        return [usage_from_document(document) async for document in cursor]

    async def get_surveys_by_ids(self, survey_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not survey_ids:
            return {}
        cursor = self.surveys.find({"_id": {"$in": [_object_id(item) for item in survey_ids]}})
        return {str(document["_id"]): document async for document in cursor}

    async def submitted_response_counts(self, survey_version_ids: list[str]) -> dict[str, int]:
        if not survey_version_ids:
            return {}
        pipeline = [
            {
                "$match": {
                    "version_id": {"$in": [_object_id(item) for item in survey_version_ids]},
                    "status": "submitted",
                }
            },
            {"$group": {"_id": "$version_id", "count": {"$sum": 1}}},
        ]
        cursor = await self.responses.aggregate(pipeline)
        return {str(row["_id"]): int(row["count"]) async for row in cursor}

    async def version_answers(
        self, survey_version_ids: list[str]
    ) -> dict[str, list[dict[str, Any]]]:
        if not survey_version_ids:
            return {}
        cursor = self.responses.find(
            {
                "version_id": {"$in": [_object_id(item) for item in survey_version_ids]},
                "status": "submitted",
            },
            {"version_id": 1, "answers": 1, "submitted_at": 1, "updated_at": 1},
        ).sort("submitted_at", DESCENDING)
        grouped: dict[str, list[dict[str, Any]]] = {}
        async for document in cursor:
            grouped.setdefault(str(document["version_id"]), []).append(document)
        return grouped
