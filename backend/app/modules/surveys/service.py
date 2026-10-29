from __future__ import annotations

import hashlib
import hmac
import json
import math
import secrets
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.errors import ApiError
from app.modules.identity.models import AuthContext
from app.modules.question_library.service import QuestionLibraryService
from app.modules.surveys.flow import (
    rule_conflicts,
    validate_draft_answers,
    validate_submission,
)
from app.modules.surveys.models import (
    SurveyRecord,
    SurveyResponseRecord,
    SurveyVersionRecord,
)
from app.modules.surveys.repository import (
    DuplicateShortCodeError,
    SurveyRepository,
    VersionNumberConflictError,
)
from app.modules.surveys.schemas import (
    AttemptCreateRequest,
    AttemptResponse,
    AttemptSavedResponse,
    AttemptSaveRequest,
    AttemptSubmitRequest,
    AttemptSummary,
    MultipleChoiceQuestion,
    NumberQuestion,
    NumericStatisticResponse,
    OptionStatisticResponse,
    PublicSurveyResponse,
    QuestionStatisticResponse,
    SingleChoiceQuestion,
    SubmissionResponse,
    SurveyCreateRequest,
    SurveyDetailResponse,
    SurveyDraftUpdateRequest,
    SurveyListResponse,
    SurveyPublishRequest,
    SurveySchema,
    SurveyStatisticsResponse,
    SurveySummaryResponse,
    SurveyVersionResponse,
    SurveyVersionSummaryResponse,
    TextQuestion,
    TextValueResponse,
    TextValuesResponse,
)

SHORT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"


def _schema_hash(schema: SurveySchema) -> str:
    payload = json.dumps(
        schema.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _effective_status(survey: SurveyRecord, now: datetime) -> str:
    if (
        survey.status == "published"
        and survey.deadline_at is not None
        and survey.deadline_at <= now
    ):
        return "expired"
    return survey.status


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class SurveyService:
    def __init__(
        self,
        *,
        settings: Settings,
        repository: SurveyRepository,
        question_library: QuestionLibraryService,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.question_library = question_library

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _respondent_key(self, survey_id: str, user_id: str) -> str:
        secret = self.settings.auth_secret.get_secret_value().encode("utf-8")
        message = f"{survey_id}:{user_id}".encode()
        return hmac.new(secret, message, hashlib.sha256).hexdigest()

    @staticmethod
    def _random_short_code() -> str:
        return "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(10))

    @staticmethod
    def _parse_schema(raw: dict[str, Any]) -> SurveySchema:
        try:
            return SurveySchema.model_validate(raw)
        except ValidationError as error:
            raise ApiError(
                409,
                "SURVEY_SCHEMA_INVALID",
                "问卷内容无效",
                field_errors={"schema": error.errors()[0].get("msg", "问卷内容无效")},
            ) from error

    @staticmethod
    def _not_found() -> ApiError:
        return ApiError(404, "SURVEY_NOT_FOUND", "问卷不存在")

    async def _survey(self, survey_id: str, context: AuthContext) -> SurveyRecord:
        survey = await self.repository.find_survey(survey_id, context.tenant.id)
        if survey is None:
            raise self._not_found()
        return survey

    async def _public_survey(self, short_code: str) -> SurveyRecord:
        survey = await self.repository.find_by_code(short_code)
        if survey is None:
            raise self._not_found()
        return survey

    async def _active_version(self, survey: SurveyRecord) -> SurveyVersionRecord:
        if survey.active_version_id is None:
            raise ApiError(409, "SURVEY_NOT_PUBLISHED", "问卷尚未发布")
        version = await self.repository.get_version(
            survey.id,
            survey.tenant_id,
            survey.active_version_id,
        )
        if version is None:
            raise ApiError(409, "SURVEY_NOT_PUBLISHED", "问卷尚未发布")
        return version

    def _assert_fillable(self, survey: SurveyRecord, now: datetime) -> None:
        if survey.status == "draft":
            raise ApiError(409, "SURVEY_NOT_PUBLISHED", "问卷尚未发布")
        if survey.status == "closed":
            raise ApiError(409, "SURVEY_CLOSED", "问卷已关闭")
        if _effective_status(survey, now) == "expired":
            raise ApiError(409, "SURVEY_EXPIRED", "问卷已过截止时间")

    @staticmethod
    def _has_unpublished_changes(survey: SurveyRecord) -> bool:
        return survey.draft_schema_hash != survey.active_schema_hash

    def _summary(self, survey: SurveyRecord, response_count: int) -> SurveySummaryResponse:
        schema = self._parse_schema(survey.draft_schema)
        return SurveySummaryResponse(
            id=survey.id,
            title=schema.title,
            short_code=survey.short_code,
            status=_effective_status(survey, self._now()),
            deadline_at=survey.deadline_at,
            active_version_number=survey.active_version_number,
            response_count=response_count,
            has_unpublished_changes=self._has_unpublished_changes(survey),
            created_at=survey.created_at,
            updated_at=survey.updated_at,
        )

    async def _detail(self, survey: SurveyRecord) -> SurveyDetailResponse:
        counts = await self.repository.response_counts([survey.id])
        summary = self._summary(survey, counts.get(survey.id, 0))
        return SurveyDetailResponse(
            **summary.model_dump(),
            draft_schema=self._parse_schema(survey.draft_schema),
            draft_revision=survey.draft_revision,
            active_version_id=survey.active_version_id,
            published_at=survey.published_at,
            closed_at=survey.closed_at,
        )

    async def create_survey(
        self,
        payload: SurveyCreateRequest,
        context: AuthContext,
    ) -> SurveyDetailResponse:
        schema = SurveySchema(
            title=payload.title,
            description=payload.description,
            allow_anonymous=payload.allow_anonymous,
        )
        now = self._now()
        document = {
            "tenant_id": ObjectId(context.tenant.id),
            "created_by_user_id": ObjectId(context.user.id),
            "status": "draft",
            "draft_schema": schema.model_dump(mode="json"),
            "draft_revision": 1,
            "draft_schema_hash": _schema_hash(schema),
            "active_version_id": None,
            "active_version_number": None,
            "active_schema_hash": None,
            "deadline_at": None,
            "created_at": now,
            "updated_at": now,
            "published_at": None,
            "closed_at": None,
        }
        for _ in range(8):
            document["short_code"] = self._random_short_code()
            try:
                survey = await self.repository.create_survey(document)
            except DuplicateShortCodeError:
                continue
            return await self._detail(survey)
        raise ApiError(503, "SURVEY_CODE_UNAVAILABLE", "暂时无法创建问卷，请稍后重试")

    async def list_surveys(
        self,
        context: AuthContext,
        *,
        page: int,
        page_size: int,
        status: str | None,
        query: str | None,
    ) -> SurveyListResponse:
        surveys = await self.repository.list_surveys(context.tenant.id)
        now = self._now()
        needle = (query or "").strip().casefold()
        filtered: list[SurveyRecord] = []
        for survey in surveys:
            schema = self._parse_schema(survey.draft_schema)
            effective_status = _effective_status(survey, now)
            if status and status != "all" and effective_status != status:
                continue
            if (
                needle
                and needle not in schema.title.casefold()
                and needle not in survey.short_code.casefold()
            ):
                continue
            filtered.append(survey)

        total = len(filtered)
        start = (page - 1) * page_size
        page_items = filtered[start : start + page_size]
        counts = await self.repository.response_counts([survey.id for survey in page_items])
        return SurveyListResponse(
            items=[self._summary(survey, counts.get(survey.id, 0)) for survey in page_items],
            page=page,
            page_size=page_size,
            total=total,
        )

    async def get_survey(self, survey_id: str, context: AuthContext) -> SurveyDetailResponse:
        return await self._detail(await self._survey(survey_id, context))

    async def save_draft(
        self,
        survey_id: str,
        payload: SurveyDraftUpdateRequest,
        context: AuthContext,
    ) -> SurveyDetailResponse:
        survey = await self._survey(survey_id, context)
        if payload.revision != survey.draft_revision:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "草稿已在其他页面更新，请刷新")

        if survey.active_version_id is not None:
            active = await self._active_version(survey)
            previous = self._parse_schema(active.schema)
            previous_types = {question.id: question.type for question in previous.questions}
            for question in payload.schema_data.questions:
                if question.id in previous_types and previous_types[question.id] != question.type:
                    raise ApiError(
                        422,
                        "SURVEY_SCHEMA_INVALID",
                        "已发布题目的类型不可修改",
                        field_errors={"questions": f"题目 {question.id} 的类型不可修改"},
                    )

        previous_draft = self._parse_schema(survey.draft_schema)
        await self.question_library.validate_survey_refs(
            payload.schema_data,
            context,
            previous_schema=previous_draft,
        )

        raw_schema = payload.schema_data.model_dump(mode="json")
        updated = await self.repository.update_draft(
            survey.id,
            context.tenant.id,
            payload.revision,
            raw_schema,
            _schema_hash(payload.schema_data),
            self._now(),
        )
        if updated is None:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "草稿已在其他页面更新，请刷新")
        return await self._detail(updated)

    async def publish_survey(
        self,
        survey_id: str,
        payload: SurveyPublishRequest,
        context: AuthContext,
    ) -> SurveyDetailResponse:
        survey = await self._survey(survey_id, context)
        if payload.revision != survey.draft_revision:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "草稿已在其他页面更新，请刷新")
        schema = self._parse_schema(survey.draft_schema)
        if not schema.questions:
            raise ApiError(
                422,
                "SURVEY_SCHEMA_INVALID",
                "问卷至少需要一道题目",
                field_errors={"questions": "至少添加一道题目"},
            )
        conflicts = rule_conflicts(schema)
        if conflicts:
            question_id = conflicts[0][0]
            raise ApiError(
                422,
                "SURVEY_RULE_CONFLICT",
                "跳转规则存在冲突",
                field_errors={question_id: "同一答案不能命中不同跳转目标"},
            )

        await self.question_library.validate_survey_refs(
            schema,
            context,
            previous_schema=schema,
        )

        now = self._now()
        try:
            version = await self.repository.create_version(
                survey=survey,
                schema=schema.model_dump(mode="json"),
                schema_hash=_schema_hash(schema),
                user_id=context.user.id,
                now=now,
            )
        except VersionNumberConflictError as error:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "版本已更新，请刷新") from error

        try:
            await self.question_library.record_survey_version(
                schema,
                context,
                survey_id=survey.id,
                survey_version_id=version.id,
                survey_version_number=version.version_number,
                now=now,
            )
        except Exception:
            await self.question_library.clear_survey_version_usages(version.id)
            await self.repository.delete_version(version.id, survey.id)
            raise

        published = await self.repository.mark_published(
            survey.id,
            context.tenant.id,
            payload.revision,
            version,
            now,
        )
        if published is None:
            await self.question_library.clear_survey_version_usages(version.id)
            await self.repository.delete_version(version.id, survey.id)
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "草稿已在其他页面更新，请刷新")
        await self.repository.invalidate_open_attempts(survey.id, "version_changed", now)
        return await self._detail(published)

    async def close_survey(self, survey_id: str, context: AuthContext) -> SurveyDetailResponse:
        survey = await self._survey(survey_id, context)
        if survey.status == "draft":
            raise ApiError(409, "SURVEY_NOT_PUBLISHED", "问卷尚未发布")
        now = self._now()
        closed = survey
        if survey.status != "closed":
            updated = await self.repository.close_survey(survey.id, context.tenant.id, now)
            if updated is None:
                raise self._not_found()
            closed = updated
            await self.repository.invalidate_open_attempts(survey.id, "survey_closed", now)
        return await self._detail(closed)

    async def set_deadline(
        self,
        survey_id: str,
        deadline_at: datetime | None,
        context: AuthContext,
    ) -> SurveyDetailResponse:
        survey = await self._survey(survey_id, context)
        normalized = _utc(deadline_at) if deadline_at is not None else None
        now = self._now()
        if normalized is not None and normalized <= now:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "截止时间必须晚于当前时间",
                field_errors={"deadline_at": "请选择未来时间"},
            )
        updated = await self.repository.set_deadline(
            survey.id,
            context.tenant.id,
            normalized,
            now,
        )
        if updated is None:
            raise self._not_found()
        return await self._detail(updated)

    async def list_versions(
        self,
        survey_id: str,
        context: AuthContext,
    ) -> list[SurveyVersionSummaryResponse]:
        survey = await self._survey(survey_id, context)
        versions = await self.repository.list_versions(survey.id, context.tenant.id)
        return [
            SurveyVersionSummaryResponse(
                id=version.id,
                version_number=version.version_number,
                schema_hash=version.schema_hash,
                created_at=version.created_at,
                active=version.id == survey.active_version_id,
            )
            for version in versions
        ]

    async def get_version(
        self,
        survey_id: str,
        version_id: str,
        context: AuthContext,
    ) -> SurveyVersionResponse:
        survey = await self._survey(survey_id, context)
        version = await self.repository.get_version(survey.id, context.tenant.id, version_id)
        if version is None:
            raise ApiError(404, "SURVEY_VERSION_NOT_FOUND", "版本不存在")
        return SurveyVersionResponse(
            id=version.id,
            version_number=version.version_number,
            schema_hash=version.schema_hash,
            created_at=version.created_at,
            active=version.id == survey.active_version_id,
            schema_data=self._parse_schema(version.schema),
        )

    async def copy_version_to_draft(
        self,
        survey_id: str,
        version_id: str,
        context: AuthContext,
    ) -> SurveyDetailResponse:
        survey = await self._survey(survey_id, context)
        version = await self.repository.get_version(survey.id, context.tenant.id, version_id)
        if version is None:
            raise ApiError(404, "SURVEY_VERSION_NOT_FOUND", "版本不存在")
        schema = self._parse_schema(version.schema)
        updated = await self.repository.update_draft(
            survey.id,
            context.tenant.id,
            survey.draft_revision,
            schema.model_dump(mode="json"),
            _schema_hash(schema),
            self._now(),
        )
        if updated is None:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "草稿已在其他页面更新，请刷新")
        return await self._detail(updated)

    def _attempt_summary(
        self,
        attempt: SurveyResponseRecord,
        version_number: int,
    ) -> AttemptSummary:
        return AttemptSummary(
            attempt_id=attempt.id,
            version_id=attempt.version_id,
            version_number=version_number,
            revision=attempt.revision,
            answers=attempt.answers,
            current_question_id=attempt.current_question_id,
            updated_at=attempt.updated_at,
        )

    async def get_public_survey(
        self,
        short_code: str,
        context: AuthContext,
    ) -> PublicSurveyResponse:
        survey = await self._public_survey(short_code)
        now = self._now()
        effective_status = _effective_status(survey, now)
        active_schema: SurveySchema | None = None
        if survey.active_version_id is not None:
            try:
                version = await self._active_version(survey)
                active_schema = self._parse_schema(version.schema)
            except ApiError:
                active_schema = None

        key = self._respondent_key(survey.id, context.user.id)
        open_attempt = await self.repository.find_open_attempt(survey.id, context.user.id)
        if open_attempt is not None and open_attempt.version_id != survey.active_version_id:
            open_attempt = None
        submitted = await self.repository.find_submitted_attempt(survey.id, key)
        completed = submitted is not None
        allow_multiple = active_schema.allow_multiple_responses if active_schema else False
        can_fill = (
            effective_status == "published"
            and active_schema is not None
            and not (completed and not allow_multiple)
        )
        title = (
            active_schema.title if active_schema else self._parse_schema(survey.draft_schema).title
        )
        return PublicSurveyResponse(
            short_code=survey.short_code,
            title=title,
            status=effective_status,
            deadline_at=survey.deadline_at,
            can_fill=can_fill,
            active_version_number=survey.active_version_number,
            survey_schema=active_schema,
            existing_attempt=(
                self._attempt_summary(open_attempt, survey.active_version_number or 0)
                if open_attempt is not None
                else None
            ),
            completed=completed,
            can_start_new=(effective_status == "published" and allow_multiple and completed),
        )

    async def create_attempt(
        self,
        short_code: str,
        payload: AttemptCreateRequest,
        context: AuthContext,
    ) -> AttemptResponse:
        survey = await self._public_survey(short_code)
        now = self._now()
        self._assert_fillable(survey, now)
        version = await self._active_version(survey)
        schema = self._parse_schema(version.schema)
        key = self._respondent_key(survey.id, context.user.id)
        submitted = await self.repository.find_submitted_attempt(survey.id, key)
        if submitted is not None and (not schema.allow_multiple_responses or not payload.start_new):
            raise ApiError(409, "SURVEY_ALREADY_SUBMITTED", "已提交过本问卷")

        await self.repository.invalidate_stale_attempts(survey.id, version.id, now)
        attempt = await self.repository.find_open_attempt(survey.id, context.user.id)
        if attempt is None:
            attempt = await self.repository.create_attempt(
                {
                    "tenant_id": ObjectId(survey.tenant_id),
                    "survey_id": ObjectId(survey.id),
                    "version_id": ObjectId(version.id),
                    "owner_user_id": ObjectId(context.user.id),
                    "respondent_user_id": ObjectId(context.user.id),
                    "respondent_key_hash": key,
                    "status": "draft",
                    "answers": {},
                    "current_question_id": None,
                    "revision": 1,
                    "started_at": now,
                    "updated_at": now,
                }
            )
        summary = self._attempt_summary(attempt, version.version_number)
        return AttemptResponse(
            **summary.model_dump(), short_code=survey.short_code, survey_schema=schema
        )

    @staticmethod
    def _validate_current_question(schema: SurveySchema, question_id: str | None) -> None:
        if question_id is not None and question_id not in {
            question.id for question in schema.questions
        }:
            raise ApiError(
                422,
                "SURVEY_ANSWERS_INVALID",
                "当前题目无效",
                field_errors={"current_question_id": "当前题目不存在"},
            )

    async def _attempt_context(
        self,
        short_code: str,
        attempt_id: str,
        context: AuthContext,
    ) -> tuple[SurveyRecord, SurveyResponseRecord, SurveySchema]:
        survey = await self._public_survey(short_code)
        now = self._now()
        self._assert_fillable(survey, now)
        attempt = await self.repository.get_attempt(attempt_id, survey.id)
        if attempt is None:
            raise ApiError(404, "SURVEY_ATTEMPT_NOT_FOUND", "答卷不存在")
        expected_key = self._respondent_key(survey.id, context.user.id)
        if attempt.status == "submitted" and attempt.respondent_key_hash == expected_key:
            raise ApiError(409, "SURVEY_ALREADY_SUBMITTED", "已提交过本问卷")
        if attempt.owner_user_id != context.user.id:
            raise ApiError(404, "SURVEY_ATTEMPT_NOT_FOUND", "答卷不存在")
        if attempt.status != "draft" or attempt.version_id != survey.active_version_id:
            raise ApiError(409, "SURVEY_VERSION_CHANGED", "问卷版本已更新，请刷新后重新填写")
        version = await self.repository.get_version(survey.id, survey.tenant_id, attempt.version_id)
        if version is None:
            raise ApiError(409, "SURVEY_VERSION_CHANGED", "问卷版本已更新，请刷新后重新填写")
        return survey, attempt, self._parse_schema(version.schema)

    async def save_attempt(
        self,
        short_code: str,
        attempt_id: str,
        payload: AttemptSaveRequest,
        context: AuthContext,
    ) -> AttemptSavedResponse:
        survey, attempt, schema = await self._attempt_context(short_code, attempt_id, context)
        self._validate_current_question(schema, payload.current_question_id)
        errors = validate_draft_answers(schema, payload.answers)
        if errors:
            raise ApiError(
                422,
                "SURVEY_ANSWERS_INVALID",
                "答案格式无效",
                field_errors=errors,
            )
        updated = await self.repository.save_attempt(
            attempt_id=attempt.id,
            survey_id=survey.id,
            version_id=attempt.version_id,
            owner_user_id=context.user.id,
            revision=payload.revision,
            answers=payload.answers,
            current_question_id=payload.current_question_id,
            now=self._now(),
        )
        if updated is None:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "答卷已在其他页面更新，请刷新")
        return AttemptSavedResponse(revision=updated.revision, updated_at=updated.updated_at)

    async def submit_attempt(
        self,
        short_code: str,
        attempt_id: str,
        payload: AttemptSubmitRequest,
        context: AuthContext,
    ) -> SubmissionResponse:
        survey, attempt, schema = await self._attempt_context(short_code, attempt_id, context)
        self._validate_current_question(schema, payload.current_question_id)
        draft_errors = validate_draft_answers(schema, payload.answers)
        if draft_errors:
            raise ApiError(
                422,
                "SURVEY_ANSWERS_INVALID",
                "答案格式无效",
                field_errors=draft_errors,
            )
        validation = validate_submission(schema, payload.answers)
        if validation.errors:
            raise ApiError(
                422,
                "SURVEY_ANSWERS_INVALID",
                "请检查未完成的答案",
                field_errors=validation.errors,
            )
        now = self._now()
        try:
            submitted = await self.repository.submit_attempt(
                attempt_id=attempt.id,
                survey_id=survey.id,
                version_id=attempt.version_id,
                owner_user_id=context.user.id,
                revision=payload.revision,
                answers=validation.answers,
                current_question_id=payload.current_question_id,
                allow_anonymous=schema.allow_anonymous,
                allow_multiple=schema.allow_multiple_responses,
                respondent_key_hash=attempt.respondent_key_hash,
                now=now,
            )
        except DuplicateKeyError as error:
            raise ApiError(409, "SURVEY_ALREADY_SUBMITTED", "已提交过本问卷") from error
        if submitted is None:
            raise ApiError(409, "SURVEY_REVISION_CONFLICT", "答卷已在其他页面更新，请刷新")
        return SubmissionResponse(
            response_id=submitted.id,
            submitted_at=submitted.submitted_at or now,
        )

    @staticmethod
    def _answer_value(question: Any, answers: dict[str, Any]) -> Any:
        value = answers.get(question.id)
        if isinstance(question, SingleChoiceQuestion):
            option_ids = {option.id for option in question.options}
            return value if isinstance(value, str) and value in option_ids else None
        if isinstance(question, MultipleChoiceQuestion):
            option_ids = {option.id for option in question.options}
            if (
                isinstance(value, list)
                and value
                and all(isinstance(item, str) and item in option_ids for item in value)
            ):
                return value
            return None
        if isinstance(question, TextQuestion):
            return value if isinstance(value, str) and bool(value.strip()) else None
        if isinstance(question, NumberQuestion):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return None
            numeric = float(value)
            return numeric if math.isfinite(numeric) else None
        return None

    async def statistics(
        self,
        survey_id: str,
        context: AuthContext,
    ) -> SurveyStatisticsResponse:
        survey = await self._survey(survey_id, context)
        version = await self._active_version(survey)
        schema = self._parse_schema(version.schema)
        submissions = await self.repository.list_submitted(survey.id)
        question_stats: list[QuestionStatisticResponse] = []
        for question in schema.questions:
            values = [
                value
                for submission in submissions
                if (value := self._answer_value(question, submission.answers)) is not None
            ]
            options: list[OptionStatisticResponse] = []
            numeric: NumericStatisticResponse | None = None
            text_count = 0
            if isinstance(question, (SingleChoiceQuestion, MultipleChoiceQuestion)):
                for option in question.options:
                    if isinstance(question, SingleChoiceQuestion):
                        count = sum(value == option.id for value in values)
                    else:
                        count = sum(option.id in value for value in values)
                    options.append(
                        OptionStatisticResponse(
                            option_id=option.id,
                            label=option.label,
                            count=count,
                            percentage=round(count / len(values) * 100, 2) if values else 0,
                        )
                    )
            elif isinstance(question, NumberQuestion):
                numbers = [float(value) for value in values]
                numeric = NumericStatisticResponse(
                    count=len(numbers),
                    average=round(sum(numbers) / len(numbers), 2) if numbers else None,
                    minimum=min(numbers) if numbers else None,
                    maximum=max(numbers) if numbers else None,
                )
            elif isinstance(question, TextQuestion):
                text_count = len(values)
            question_stats.append(
                QuestionStatisticResponse(
                    question_id=question.id,
                    title=question.title,
                    type=question.type,
                    answered_count=len(values),
                    options=options,
                    numeric=numeric,
                    text_value_count=text_count,
                )
            )
        return SurveyStatisticsResponse(
            survey_id=survey.id,
            active_version_number=version.version_number,
            submitted_responses=len(submissions),
            unique_respondents=len({submission.respondent_key_hash for submission in submissions}),
            questions=question_stats,
        )

    async def text_values(
        self,
        survey_id: str,
        question_id: str,
        context: AuthContext,
        *,
        page: int,
        page_size: int,
    ) -> TextValuesResponse:
        survey = await self._survey(survey_id, context)
        version = await self._active_version(survey)
        schema = self._parse_schema(version.schema)
        question = next(
            (item for item in schema.questions if item.id == question_id),
            None,
        )
        if question is None:
            raise ApiError(404, "SURVEY_QUESTION_NOT_FOUND", "题目不存在")
        if not isinstance(question, TextQuestion):
            raise ApiError(422, "SURVEY_QUESTION_TYPE_INVALID", "该题目不是文本题")

        submissions = await self.repository.list_submitted(survey.id)
        values = [
            TextValueResponse(
                value=answer,
                submitted_at=submission.submitted_at or submission.updated_at,
            )
            for submission in submissions
            if isinstance((answer := submission.answers.get(question.id)), str) and answer.strip()
        ]
        start = (page - 1) * page_size
        return TextValuesResponse(
            items=values[start : start + page_size],
            page=page,
            page_size=page_size,
            total=len(values),
        )
