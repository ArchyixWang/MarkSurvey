from __future__ import annotations

import hashlib
import math
import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pydantic import TypeAdapter

from app.core.errors import ApiError
from app.modules.identity.models import AuthContext
from app.modules.question_library.models import (
    QuestionRootRecord,
    QuestionUsageRecord,
    QuestionVersionRecord,
    ShareRecord,
)
from app.modules.question_library.repository import (
    QuestionLibraryRepository,
    QuestionVersionConflictError,
)
from app.modules.question_library.schemas import (
    LibraryMultipleChoice,
    LibraryNumberQuestion,
    LibraryNumericStatisticResponse,
    LibraryOptionStatisticResponse,
    LibraryQuestionContent,
    LibraryQuestionDetailResponse,
    LibraryQuestionListResponse,
    LibraryQuestionSourceResponse,
    LibraryQuestionStatisticsResponse,
    LibraryQuestionSummaryResponse,
    LibrarySingleChoice,
    LibraryTextQuestion,
    LibraryTextValueResponse,
    LibraryTextValuesResponse,
    LibraryVersionResponse,
    LibraryVersionStatisticsResponse,
    LibraryVersionSummaryResponse,
    QuestionCreateRequest,
    QuestionDeriveRequest,
    QuestionUsageResponse,
    QuestionUsageSurveyResponse,
    ShareCreatedResponse,
    ShareCreateRequest,
    SharedImportResponse,
    SharedQuestionResponse,
    ShareImportRequest,
    ShareInboxItemResponse,
    ShareInboxResponse,
    ShareListResponse,
    ShareSummaryResponse,
    VersionCreateRequest,
    VersionRestoreRequest,
)
from app.modules.surveys.schemas import SurveySchema

CONTENT_ADAPTER = TypeAdapter(LibraryQuestionContent)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _content_dict(content: LibraryQuestionContent) -> dict[str, Any]:
    return content.model_dump(mode="json")


def _content_model(version: QuestionVersionRecord) -> LibraryQuestionContent:
    try:
        return CONTENT_ADAPTER.validate_python(version.content)
    except Exception as error:
        raise ApiError(500, "QUESTION_LIBRARY_INVALID", "题目版本内容无效") from error


def _option_ids(content: LibraryQuestionContent) -> set[str]:
    if isinstance(content, (LibrarySingleChoice, LibraryMultipleChoice)):
        return {option.id for option in content.options}
    return set()


def _answer_value(content: LibraryQuestionContent, value: Any) -> Any:
    if isinstance(content, LibrarySingleChoice):
        if isinstance(value, str) and value in _option_ids(content):
            return value
        return None
    if isinstance(content, LibraryMultipleChoice):
        option_ids = _option_ids(content)
        if isinstance(value, list):
            selected = [item for item in value if isinstance(item, str) and item in option_ids]
            return selected or None
        return None
    if isinstance(content, LibraryTextQuestion):
        return value if isinstance(value, str) and value.strip() else None
    if isinstance(content, LibraryNumberQuestion):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        numeric = float(value)
        return numeric if math.isfinite(numeric) else None
    return None


class QuestionLibraryService:
    def __init__(self, repository: QuestionLibraryRepository) -> None:
        self.repository = repository

    def _now(self) -> datetime:
        return datetime.now(UTC)

    @staticmethod
    def _not_found() -> ApiError:
        return ApiError(404, "QUESTION_LIBRARY_NOT_FOUND", "题目不存在")

    def _share_active(
        self, share: ShareRecord, root: QuestionRootRecord | None, now: datetime | None = None
    ) -> bool:
        now = now or self._now()
        return bool(
            root is not None
            and root.archived_at is None
            and share.revoked_at is None
            and (share.expires_at is None or _utc(share.expires_at) > now)
        )

    async def _root(self, question_id: str, context: AuthContext) -> QuestionRootRecord:
        root = await self.repository.find_root(question_id, context.user.id, context.tenant.id)
        if root is None:
            raise self._not_found()
        return root

    async def _latest_version(self, root: QuestionRootRecord) -> QuestionVersionRecord:
        version = await self.repository.get_version(root.id, root.latest_version_id)
        if version is None:
            raise self._not_found()
        return version

    def _version_summary(
        self, version: QuestionVersionRecord, root: QuestionRootRecord
    ) -> LibraryVersionSummaryResponse:
        if version.shared_from_question_id is not None:
            origin_kind = "shared_copy"
        elif version.restored_from_version_id is not None:
            origin_kind = "restored"
        elif version.base_version_id is not None:
            origin_kind = "edited"
        elif root.source_kind == "derived" and version.version_number == 1:
            origin_kind = "derived_initial"
        else:
            origin_kind = "initial"
        content = _content_model(version)
        return LibraryVersionSummaryResponse(
            id=version.id,
            version_number=version.version_number,
            title=content.title,
            question_type=content.type,
            origin_kind=origin_kind,
            base_version_id=version.base_version_id,
            base_version_number=version.base_version_number,
            restored_from_version_id=version.restored_from_version_id,
            restored_from_version_number=version.restored_from_version_number,
            shared_from_question_id=version.shared_from_question_id,
            shared_from_version_id=version.shared_from_version_id,
            shared_from_version_number=version.shared_from_version_number,
            created_at=version.created_at,
        )

    def _version_response(
        self, version: QuestionVersionRecord, root: QuestionRootRecord
    ) -> LibraryVersionResponse:
        summary = self._version_summary(version, root)
        return LibraryVersionResponse(**summary.model_dump(), content=_content_model(version))

    def _summary(
        self,
        root: QuestionRootRecord,
        latest: QuestionVersionRecord,
        usage_count: int = 0,
    ) -> LibraryQuestionSummaryResponse:
        source = None
        if root.source_kind in {"derived", "shared_copy"} and root.source_question_id:
            source = LibraryQuestionSourceResponse(
                kind=root.source_kind,
                question_id=root.source_question_id,
                question_title=root.source_question_title or "来源题目",
                version_id=root.source_version_id or "",
                version_number=root.source_version_number or 0,
            )
        return LibraryQuestionSummaryResponse(
            id=root.id,
            title=latest.content["title"],
            question_type=root.question_type,
            latest_version_id=latest.id,
            latest_version_number=latest.version_number,
            required_by_default=bool(latest.content.get("required_by_default", False)),
            archived=root.archived_at is not None,
            usage_survey_count=usage_count,
            source=source,
            created_at=root.created_at,
            updated_at=root.updated_at,
        )

    async def _detail(self, root: QuestionRootRecord) -> LibraryQuestionDetailResponse:
        latest = await self._latest_version(root)
        usage_counts = await self.repository.usage_survey_counts(
            question_ids=[root.id],
            owner_user_id=root.owner_user_id,
            tenant_id=root.tenant_id,
        )
        summary = self._summary(root, latest, usage_counts.get(root.id, 0))
        return LibraryQuestionDetailResponse(
            **summary.model_dump(),
            latest_version=self._version_response(latest, root),
            version_count=await self.repository.count_versions(root.id),
        )

    async def _create_question(
        self,
        content: LibraryQuestionContent,
        context: AuthContext,
        *,
        source_kind: str | None = None,
        source_question: QuestionRootRecord | None = None,
        source_version: QuestionVersionRecord | None = None,
    ) -> LibraryQuestionDetailResponse:
        now = self._now()
        question_id = ObjectId()
        version_id = ObjectId()
        content_data = _content_dict(content)
        version_document: dict[str, Any] = {
            "_id": version_id,
            "tenant_id": ObjectId(context.tenant.id),
            "owner_user_id": ObjectId(context.user.id),
            "question_id": question_id,
            "version_number": 1,
            "content": content_data,
            "base_version_id": None,
            "base_version_number": None,
            "restored_from_version_id": None,
            "restored_from_version_number": None,
            "shared_from_question_id": None,
            "shared_from_version_id": None,
            "shared_from_version_number": None,
            "created_by_user_id": ObjectId(context.user.id),
            "created_at": now,
        }
        if source_kind == "shared_copy" and source_question and source_version:
            version_document.update(
                {
                    "shared_from_question_id": ObjectId(source_question.id),
                    "shared_from_version_id": ObjectId(source_version.id),
                    "shared_from_version_number": source_version.version_number,
                }
            )
        await self.repository.insert_version(version_document)
        root_document: dict[str, Any] = {
            "_id": question_id,
            "tenant_id": ObjectId(context.tenant.id),
            "owner_user_id": ObjectId(context.user.id),
            "question_type": content.type,
            "latest_title": content.title,
            "latest_version_id": version_id,
            "latest_version_number": 1,
            "required_by_default": content.required_by_default,
            "source_kind": source_kind,
            "source_question_id": (
                ObjectId(source_question.id) if source_question is not None else None
            ),
            "source_question_title": (
                source_question.latest_title if source_question is not None else None
            ),
            "source_version_id": (
                ObjectId(source_version.id) if source_version is not None else None
            ),
            "source_version_number": (
                source_version.version_number if source_version is not None else None
            ),
            "archived_at": None,
            "created_at": now,
            "updated_at": now,
        }
        try:
            root = await self.repository.insert_root(root_document)
        except Exception:
            await self.repository.delete_version(str(version_id))
            raise
        return await self._detail(root)

    async def create_question(
        self, payload: QuestionCreateRequest, context: AuthContext
    ) -> LibraryQuestionDetailResponse:
        return await self._create_question(payload.content, context)

    async def list_questions(
        self,
        context: AuthContext,
        *,
        page: int,
        page_size: int,
        search: str | None,
        question_type: str | None,
        archived: bool,
    ) -> LibraryQuestionListResponse:
        roots, total = await self.repository.list_roots(
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
            search=search,
            question_type=question_type,
            archived=archived,
            skip=(page - 1) * page_size,
            limit=page_size,
        )
        latest_versions = await self.repository.get_versions_by_ids(
            [root.latest_version_id for root in roots]
        )
        counts = await self.repository.usage_survey_counts(
            question_ids=[root.id for root in roots],
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
        )
        items = [
            self._summary(root, latest_versions[root.latest_version_id], counts.get(root.id, 0))
            for root in roots
            if root.latest_version_id in latest_versions
        ]
        return LibraryQuestionListResponse(items=items, page=page, page_size=page_size, total=total)

    async def get_question(
        self, question_id: str, context: AuthContext
    ) -> LibraryQuestionDetailResponse:
        return await self._detail(await self._root(question_id, context))

    async def create_version(
        self, question_id: str, payload: VersionCreateRequest, context: AuthContext
    ) -> LibraryQuestionDetailResponse:
        root = await self._root(question_id, context)
        if root.archived_at is not None:
            raise ApiError(409, "QUESTION_ARCHIVED", "题目已归档")
        if payload.content.type != root.question_type:
            raise ApiError(
                422,
                "QUESTION_LIBRARY_INVALID",
                "题目版本不能修改题型",
                field_errors={"type": "如需修改题型，请派生新题"},
            )
        if payload.base_version_number != root.latest_version_number:
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目已在其他页面更新，请刷新")
        now = self._now()
        version_document = {
            "tenant_id": ObjectId(context.tenant.id),
            "owner_user_id": ObjectId(context.user.id),
            "question_id": ObjectId(root.id),
            "version_number": root.latest_version_number + 1,
            "content": _content_dict(payload.content),
            "base_version_id": ObjectId(root.latest_version_id),
            "base_version_number": root.latest_version_number,
            "restored_from_version_id": None,
            "restored_from_version_number": None,
            "shared_from_question_id": None,
            "shared_from_version_id": None,
            "shared_from_version_number": None,
            "created_by_user_id": ObjectId(context.user.id),
            "created_at": now,
        }
        try:
            version = await self.repository.insert_version(version_document)
        except QuestionVersionConflictError as error:
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目版本已更新，请刷新") from error
        promoted = await self.repository.promote_version(
            question_id=root.id,
            expected_version_number=root.latest_version_number,
            version=version,
            title=payload.content.title,
            required_by_default=payload.content.required_by_default,
            now=now,
        )
        if not promoted:
            await self.repository.delete_version(version.id)
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目已在其他页面更新，请刷新")
        return await self._detail(await self._root(question_id, context))

    async def list_versions(
        self, question_id: str, context: AuthContext
    ) -> list[LibraryVersionResponse]:
        root = await self._root(question_id, context)
        versions = await self.repository.list_versions(
            question_id=root.id,
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
        )
        return [self._version_response(version, root) for version in versions]

    async def get_version(
        self, question_id: str, version_id: str, context: AuthContext
    ) -> LibraryVersionResponse:
        root = await self._root(question_id, context)
        version = await self.repository.get_version_for_owner(
            root.id, version_id, context.user.id, context.tenant.id
        )
        if version is None:
            raise ApiError(404, "QUESTION_VERSION_NOT_FOUND", "题目版本不存在")
        return self._version_response(version, root)

    async def restore_version(
        self,
        question_id: str,
        version_id: str,
        payload: VersionRestoreRequest,
        context: AuthContext,
    ) -> LibraryQuestionDetailResponse:
        root = await self._root(question_id, context)
        if root.archived_at is not None:
            raise ApiError(409, "QUESTION_ARCHIVED", "题目已归档")
        if payload.base_version_number != root.latest_version_number:
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目已在其他页面更新，请刷新")
        source = await self.repository.get_version_for_owner(
            root.id, version_id, context.user.id, context.tenant.id
        )
        if source is None:
            raise ApiError(404, "QUESTION_VERSION_NOT_FOUND", "题目版本不存在")
        content = _content_model(source)
        if content.type != root.question_type:
            raise ApiError(422, "QUESTION_LIBRARY_INVALID", "题目版本题型与题目不一致")
        now = self._now()
        version_document = {
            "tenant_id": ObjectId(context.tenant.id),
            "owner_user_id": ObjectId(context.user.id),
            "question_id": ObjectId(root.id),
            "version_number": root.latest_version_number + 1,
            "content": _content_dict(content),
            "base_version_id": None,
            "base_version_number": None,
            "restored_from_version_id": ObjectId(source.id),
            "restored_from_version_number": source.version_number,
            "shared_from_question_id": None,
            "shared_from_version_id": None,
            "shared_from_version_number": None,
            "created_by_user_id": ObjectId(context.user.id),
            "created_at": now,
        }
        try:
            version = await self.repository.insert_version(version_document)
        except QuestionVersionConflictError as error:
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目版本已更新，请刷新") from error
        promoted = await self.repository.promote_version(
            question_id=root.id,
            expected_version_number=root.latest_version_number,
            version=version,
            title=content.title,
            required_by_default=content.required_by_default,
            now=now,
        )
        if not promoted:
            await self.repository.delete_version(version.id)
            raise ApiError(409, "QUESTION_VERSION_CONFLICT", "题目已在其他页面更新，请刷新")
        return await self._detail(await self._root(question_id, context))

    async def derive_question(
        self,
        question_id: str,
        version_id: str,
        payload: QuestionDeriveRequest,
        context: AuthContext,
    ) -> LibraryQuestionDetailResponse:
        root = await self._root(question_id, context)
        source = await self.repository.get_version_for_owner(
            root.id, version_id, context.user.id, context.tenant.id
        )
        if source is None:
            raise ApiError(404, "QUESTION_VERSION_NOT_FOUND", "题目版本不存在")
        return await self._create_question(
            payload.content,
            context,
            source_kind="derived",
            source_question=root,
            source_version=source,
        )

    async def archive_question(
        self, question_id: str, context: AuthContext
    ) -> LibraryQuestionDetailResponse:
        root = await self._root(question_id, context)
        await self.repository.set_archived(question_id, self._now(), self._now())
        return await self._detail(await self._root(root.id, context))

    async def unarchive_question(
        self, question_id: str, context: AuthContext
    ) -> LibraryQuestionDetailResponse:
        root = await self._root(question_id, context)
        await self.repository.set_archived(question_id, None, self._now())
        return await self._detail(await self._root(root.id, context))

    async def create_share(
        self, question_id: str, payload: ShareCreateRequest, context: AuthContext
    ) -> ShareCreatedResponse:
        root = await self._root(question_id, context)
        if root.archived_at is not None:
            raise ApiError(409, "QUESTION_ARCHIVED", "题目已归档")
        now = self._now()
        expires_at = _utc(payload.expires_at) if payload.expires_at else None
        if expires_at is not None and expires_at <= now:
            raise ApiError(
                422,
                "QUESTION_LIBRARY_INVALID",
                "分享截止时间必须晚于当前时间",
                field_errors={"expires_at": "截止时间必须晚于当前时间"},
            )
        token = secrets.token_urlsafe(32)
        share = await self.repository.create_share(
            {
                "tenant_id": ObjectId(context.tenant.id),
                "owner_user_id": ObjectId(context.user.id),
                "question_id": ObjectId(root.id),
                "token_hash": _token_hash(token),
                "token_hint": token[:8],
                "expires_at": expires_at,
                "revoked_at": None,
                "created_by_user_id": ObjectId(context.user.id),
                "created_at": now,
            }
        )
        return ShareCreatedResponse(
            share=ShareSummaryResponse(
                id=share.id,
                token_hint=share.token_hint,
                created_at=share.created_at,
                expires_at=share.expires_at,
                revoked_at=share.revoked_at,
                active=True,
            ),
            token=token,
            url=f"/shared/questions/{token}",
        )

    async def list_shares(self, question_id: str, context: AuthContext) -> ShareListResponse:
        root = await self._root(question_id, context)
        shares = await self.repository.list_shares(root.id)
        now = self._now()
        return ShareListResponse(
            items=[
                ShareSummaryResponse(
                    id=share.id,
                    token_hint=share.token_hint,
                    created_at=share.created_at,
                    expires_at=share.expires_at,
                    revoked_at=share.revoked_at,
                    active=self._share_active(share, root, now),
                )
                for share in shares
            ]
        )

    async def revoke_share(
        self, question_id: str, share_id: str, context: AuthContext
    ) -> ShareSummaryResponse:
        root = await self._root(question_id, context)
        share = await self.repository.revoke_share(share_id, root.id, self._now())
        if share is None:
            raise ApiError(404, "QUESTION_SHARE_UNAVAILABLE", "分享不存在")
        return ShareSummaryResponse(
            id=share.id,
            token_hint=share.token_hint,
            created_at=share.created_at,
            expires_at=share.expires_at,
            revoked_at=share.revoked_at,
            active=False,
        )

    async def _share_context(self, token: str) -> tuple[ShareRecord, QuestionRootRecord]:
        share = await self.repository.find_share_by_hash(_token_hash(token))
        if share is None:
            raise ApiError(404, "QUESTION_SHARE_UNAVAILABLE", "分享不存在")
        root = await self.repository.find_root(
            share.question_id, share.owner_user_id, share.tenant_id
        )
        if not self._share_active(share, root):
            raise ApiError(410, "QUESTION_SHARE_UNAVAILABLE", "分享已失效")
        assert root is not None
        return share, root

    async def shared_question(self, token: str) -> SharedQuestionResponse:
        share, root = await self._share_context(token)
        versions = await self.repository.list_versions(
            question_id=root.id,
            owner_user_id=root.owner_user_id,
            tenant_id=root.tenant_id,
        )
        return SharedQuestionResponse(
            share_id=share.id,
            question_id=root.id,
            title=root.latest_title,
            question_type=root.question_type,
            expires_at=share.expires_at,
            versions=[self._version_response(version, root) for version in versions],
        )

    async def import_shared_question(
        self, token: str, payload: ShareImportRequest, context: AuthContext
    ) -> SharedImportResponse:
        share, source_root = await self._share_context(token)
        source_version = await self.repository.get_version(source_root.id, payload.version_id)
        if source_version is None:
            raise ApiError(404, "QUESTION_VERSION_NOT_FOUND", "题目版本不存在")
        content = _content_model(source_version)
        local = await self._create_question(
            content,
            context,
            source_kind="shared_copy",
            source_question=source_root,
            source_version=source_version,
        )
        local_root = await self._root(local.id, context)
        imported = await self.repository.create_import(
            {
                "share_id": ObjectId(share.id),
                "source_question_id": ObjectId(source_root.id),
                "source_version_id": ObjectId(source_version.id),
                "source_version_number": source_version.version_number,
                "source_owner_user_id": ObjectId(source_root.owner_user_id),
                "recipient_user_id": ObjectId(context.user.id),
                "recipient_tenant_id": ObjectId(context.tenant.id),
                "local_question_id": ObjectId(local_root.id),
                "local_version_id": ObjectId(local.latest_version_id),
                "imported_at": self._now(),
            }
        )
        return SharedImportResponse(import_id=imported.id, local_question=local)

    async def share_inbox(
        self, context: AuthContext, *, page: int, page_size: int
    ) -> ShareInboxResponse:
        imports, total = await self.repository.list_imports(
            recipient_user_id=context.user.id,
            skip=(page - 1) * page_size,
            limit=page_size,
        )
        shares = await self.repository.get_shares_by_ids([item.share_id for item in imports])
        local_versions = await self.repository.get_versions_by_ids(
            [item.local_version_id for item in imports]
        )
        items: list[ShareInboxItemResponse] = []
        now = self._now()
        for imported in imports:
            local_version = local_versions.get(imported.local_version_id)
            local_root = await self.repository.find_root(
                imported.local_question_id, context.user.id, context.tenant.id
            )
            share = shares.get(imported.share_id)
            source_root = None
            if share is not None:
                source_root = await self.repository.find_root(
                    share.question_id, share.owner_user_id, share.tenant_id
                )
            if local_root is None or local_version is None or share is None:
                continue
            source_version = await self.repository.get_version(
                imported.source_question_id, imported.source_version_id
            )
            source_title = (
                source_root.latest_title
                if source_root is not None
                else (source_version.content.get("title") if source_version else "来源题目")
            )
            items.append(
                ShareInboxItemResponse(
                    id=imported.id,
                    imported_at=imported.imported_at,
                    source_question_id=imported.source_question_id,
                    source_question_title=source_title,
                    source_version_number=imported.source_version_number,
                    source_share_active=self._share_active(share, source_root, now),
                    source_share_expires_at=share.expires_at,
                    local_question=self._summary(local_root, local_version),
                )
            )
        return ShareInboxResponse(items=items, page=page, page_size=page_size, total=total)

    async def validate_survey_refs(
        self,
        schema: SurveySchema,
        context: AuthContext,
        *,
        previous_schema: SurveySchema | None = None,
    ) -> None:
        previous_roots = {
            question.library_ref.question_id
            for question in (previous_schema.questions if previous_schema else [])
            if question.library_ref is not None and question.library_ref.linked
        }
        seen_roots: set[str] = set()
        for question in schema.questions:
            reference = question.library_ref
            if reference is None or not reference.linked:
                continue
            if reference.question_id in seen_roots:
                raise ApiError(
                    422,
                    "QUESTION_REFERENCE_INVALID",
                    "同一题目不能重复关联题库题目",
                    field_errors={question.id: "该题库题目已在问卷中使用"},
                )
            seen_roots.add(reference.question_id)
            root = await self.repository.find_root(
                reference.question_id, context.user.id, context.tenant.id
            )
            if root is None:
                raise ApiError(
                    422,
                    "QUESTION_REFERENCE_INVALID",
                    "题库题目不存在",
                    field_errors={question.id: "题库题目不存在或无权访问"},
                )
            if root.archived_at is not None and reference.question_id not in previous_roots:
                raise ApiError(
                    422,
                    "QUESTION_ARCHIVED",
                    "归档题目不能新加入问卷",
                    field_errors={question.id: "题目已归档"},
                )
            version = await self.repository.get_version_for_owner(
                reference.question_id,
                reference.version_id,
                context.user.id,
                context.tenant.id,
            )
            if version is None:
                raise ApiError(
                    422,
                    "QUESTION_REFERENCE_INVALID",
                    "题库题目版本不存在",
                    field_errors={question.id: "题库题目版本不存在"},
                )
            if version.content.get("type") != question.type or root.question_type != question.type:
                raise ApiError(
                    422,
                    "QUESTION_REFERENCE_INVALID",
                    "问卷题目与题库版本题型不一致",
                    field_errors={question.id: "题目题型与题库版本不一致"},
                )
            survey_content = question.model_dump(mode="json")
            for field in ("id", "required", "jump_rules", "library_ref"):
                survey_content.pop(field, None)
            library_content = dict(version.content)
            library_content.pop("required_by_default", None)
            if survey_content != library_content:
                raise ApiError(
                    422,
                    "QUESTION_REFERENCE_INVALID",
                    "关联题目的内容与题库版本不一致",
                    field_errors={question.id: "修改内容前需解除题库关联"},
                )

    async def record_survey_version(
        self,
        schema: SurveySchema,
        context: AuthContext,
        *,
        survey_id: str,
        survey_version_id: str,
        survey_version_number: int,
        now: datetime,
    ) -> None:
        documents: list[dict[str, Any]] = []
        for question in schema.questions:
            reference = question.library_ref
            if reference is None or not reference.linked:
                continue
            version = await self.repository.get_version_for_owner(
                reference.question_id,
                reference.version_id,
                context.user.id,
                context.tenant.id,
            )
            if version is None:
                raise ApiError(422, "QUESTION_REFERENCE_INVALID", "题库题目版本不存在")
            documents.append(
                {
                    "question_id": ObjectId(reference.question_id),
                    "question_version_id": ObjectId(reference.version_id),
                    "question_version_number": version.version_number,
                    "tenant_id": ObjectId(context.tenant.id),
                    "owner_user_id": ObjectId(context.user.id),
                    "survey_id": ObjectId(survey_id),
                    "survey_version_id": ObjectId(survey_version_id),
                    "survey_version_number": survey_version_number,
                    "survey_question_id": question.id,
                    "created_at": now,
                }
            )
        if documents:
            await self.repository.upsert_usages(documents)

    async def clear_survey_version_usages(self, survey_version_id: str) -> None:
        await self.repository.delete_usages_for_survey_version(survey_version_id)

    async def question_usage(self, question_id: str, context: AuthContext) -> QuestionUsageResponse:
        root = await self._root(question_id, context)
        usages = await self.repository.list_usages(
            question_id=root.id,
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
        )
        survey_ids = list({usage.survey_id for usage in usages})
        surveys = await self.repository.get_surveys_by_ids(survey_ids)
        counts = await self.repository.submitted_response_counts(
            [usage.survey_version_id for usage in usages]
        )
        grouped: dict[str, list[QuestionUsageRecord]] = defaultdict(list)
        for usage in usages:
            grouped[usage.survey_id].append(usage)
        now = self._now()
        items: list[QuestionUsageSurveyResponse] = []
        for survey_id, survey_usages in grouped.items():
            survey = surveys.get(survey_id)
            if survey is None:
                continue
            status = survey["status"]
            if (
                status == "published"
                and survey.get("deadline_at") is not None
                and _utc(survey["deadline_at"]) <= now
            ):
                status = "expired"
            items.append(
                QuestionUsageSurveyResponse(
                    survey_id=survey_id,
                    title=survey["draft_schema"]["title"],
                    status=status,
                    version_numbers=sorted(
                        {usage.survey_version_number for usage in survey_usages}
                    ),
                    response_count=sum(
                        counts.get(usage.survey_version_id, 0) for usage in survey_usages
                    ),
                    latest_used_at=max(usage.created_at for usage in survey_usages),
                )
            )
        items.sort(key=lambda item: item.latest_used_at, reverse=True)
        return QuestionUsageResponse(question_id=root.id, total_surveys=len(items), surveys=items)

    async def _statistics_entries(
        self, root: QuestionRootRecord, context: AuthContext
    ) -> tuple[list[QuestionVersionRecord], list[QuestionUsageRecord], list[dict[str, Any]]]:
        versions = await self.repository.list_versions(
            question_id=root.id,
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
        )
        version_map = {version.id: version for version in versions}
        usages = await self.repository.list_usages(
            question_id=root.id,
            owner_user_id=context.user.id,
            tenant_id=context.tenant.id,
        )
        surveys = await self.repository.get_surveys_by_ids(
            list({usage.survey_id for usage in usages})
        )
        answers = await self.repository.version_answers(
            list({usage.survey_version_id for usage in usages})
        )
        entries: list[dict[str, Any]] = []
        for usage in usages:
            version = version_map.get(usage.question_version_id)
            survey = surveys.get(usage.survey_id)
            if version is None or survey is None:
                continue
            content = _content_model(version)
            for response in answers.get(usage.survey_version_id, []):
                value = _answer_value(
                    content, response.get("answers", {}).get(usage.survey_question_id)
                )
                if value is None:
                    continue
                entries.append(
                    {
                        "value": value,
                        "version": version,
                        "content": content,
                        "survey_id": usage.survey_id,
                        "survey_title": survey["draft_schema"]["title"],
                        "survey_version_number": usage.survey_version_number,
                        "submitted_at": response.get("submitted_at") or response.get("updated_at"),
                    }
                )
        return versions, usages, entries

    @staticmethod
    def _choice_counts(
        content: LibraryQuestionContent, entries: list[dict[str, Any]]
    ) -> tuple[dict[str, int], list[Any]]:
        if not isinstance(content, (LibrarySingleChoice, LibraryMultipleChoice)):
            return {}, []
        counts: dict[str, int] = defaultdict(int)
        for entry in entries:
            value = entry["value"]
            if isinstance(content, LibrarySingleChoice):
                counts[value] += 1
            else:
                for option_id in value:
                    counts[option_id] += 1
        return counts, content.options

    @staticmethod
    def _numeric_statistic(values: list[float]) -> LibraryNumericStatisticResponse:
        return LibraryNumericStatisticResponse(
            count=len(values),
            average=round(sum(values) / len(values), 2) if values else None,
            minimum=min(values) if values else None,
            maximum=max(values) if values else None,
        )

    async def statistics(
        self, question_id: str, context: AuthContext
    ) -> LibraryQuestionStatisticsResponse:
        root = await self._root(question_id, context)
        versions, usages, entries = await self._statistics_entries(root, context)
        latest_version = versions[0] if versions else await self._latest_version(root)
        latest_content = _content_model(latest_version)
        total_answered = len(entries)
        total_options: list[LibraryOptionStatisticResponse] = []
        if isinstance(latest_content, (LibrarySingleChoice, LibraryMultipleChoice)):
            labels: dict[str, str] = {}
            order: list[str] = []
            latest_option_ids: set[str] = set()
            for index, version in enumerate(versions):
                content = _content_model(version)
                if not isinstance(content, (LibrarySingleChoice, LibraryMultipleChoice)):
                    continue
                if index == 0:
                    latest_option_ids = {option.id for option in content.options}
                for option in content.options:
                    labels.setdefault(option.id, option.label)
                    if option.id not in order:
                        order.append(option.id)
            counts, _ = self._choice_counts(latest_content, entries)
            total_options = [
                LibraryOptionStatisticResponse(
                    option_id=option_id,
                    label=labels.get(option_id, option_id),
                    count=counts.get(option_id, 0),
                    percentage=(
                        round(counts.get(option_id, 0) / total_answered * 100, 2)
                        if total_answered
                        else 0
                    ),
                    historical=option_id not in latest_option_ids,
                )
                for option_id in order
            ]
        numeric = None
        text_count = 0
        if isinstance(latest_content, LibraryNumberQuestion):
            numeric = self._numeric_statistic([float(entry["value"]) for entry in entries])
        elif isinstance(latest_content, LibraryTextQuestion):
            text_count = total_answered
        version_stats: list[LibraryVersionStatisticsResponse] = []
        for version in versions:
            content = _content_model(version)
            version_entries = [entry for entry in entries if entry["version"].id == version.id]
            options: list[LibraryOptionStatisticResponse] = []
            version_numeric = None
            version_text_count = 0
            if isinstance(content, (LibrarySingleChoice, LibraryMultipleChoice)):
                counts, content_options = self._choice_counts(content, version_entries)
                options = [
                    LibraryOptionStatisticResponse(
                        option_id=option.id,
                        label=option.label,
                        count=counts.get(option.id, 0),
                        percentage=(
                            round(counts.get(option.id, 0) / len(version_entries) * 100, 2)
                            if version_entries
                            else 0
                        ),
                    )
                    for option in content_options
                ]
            elif isinstance(content, LibraryNumberQuestion):
                version_numeric = self._numeric_statistic(
                    [float(entry["value"]) for entry in version_entries]
                )
            elif isinstance(content, LibraryTextQuestion):
                version_text_count = len(version_entries)
            version_stats.append(
                LibraryVersionStatisticsResponse(
                    version_id=version.id,
                    version_number=version.version_number,
                    title=content.title,
                    answered_count=len(version_entries),
                    options=options,
                    numeric=version_numeric,
                    text_value_count=version_text_count,
                )
            )
        return LibraryQuestionStatisticsResponse(
            question_id=root.id,
            title=latest_content.title,
            question_type=root.question_type,
            version_count=len(versions),
            used_survey_count=len({usage.survey_id for usage in usages}),
            answered_count=total_answered,
            options=total_options,
            numeric=numeric,
            text_value_count=text_count,
            versions=version_stats,
        )

    async def text_values(
        self,
        question_id: str,
        context: AuthContext,
        *,
        version_id: str | None,
        page: int,
        page_size: int,
    ) -> LibraryTextValuesResponse:
        root = await self._root(question_id, context)
        latest = await self._latest_version(root)
        if not isinstance(_content_model(latest), LibraryTextQuestion):
            raise ApiError(422, "QUESTION_LIBRARY_INVALID", "该题目不是文本题")
        _, _, entries = await self._statistics_entries(root, context)
        if version_id:
            entries = [entry for entry in entries if entry["version"].id == version_id]
        entries.sort(key=lambda entry: entry["submitted_at"], reverse=True)
        values = [
            LibraryTextValueResponse(
                value=entry["value"],
                survey_id=entry["survey_id"],
                survey_title=entry["survey_title"],
                survey_version_number=entry["survey_version_number"],
                question_version_number=entry["version"].version_number,
                submitted_at=entry["submitted_at"],
            )
            for entry in entries
        ]
        start = (page - 1) * page_size
        return LibraryTextValuesResponse(
            items=values[start : start + page_size],
            page=page,
            page_size=page_size,
            total=len(values),
        )
