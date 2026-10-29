from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.modules.surveys.schemas import ApiModel, OptionSchema

QuestionType = Literal["single_choice", "multiple_choice", "text", "number"]


def _clean_text(value: str) -> str:
    return value.strip()


class LibraryQuestionBase(ApiModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=1000)
    required_by_default: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("题目标题不能为空")
        return value


def _validate_options(options: list[OptionSchema]) -> None:
    ids = [option.id for option in options]
    if len(ids) != len(set(ids)):
        raise ValueError("选项 ID 不能重复")
    labels = [option.label.casefold() for option in options]
    if len(labels) != len(set(labels)):
        raise ValueError("同一题目的选项文案不能重复")


class LibrarySingleChoice(LibraryQuestionBase):
    type: Literal["single_choice"]
    options: list[OptionSchema] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def validate_options(self) -> LibrarySingleChoice:
        _validate_options(self.options)
        return self


class LibraryMultipleChoice(LibraryQuestionBase):
    type: Literal["multiple_choice"]
    options: list[OptionSchema] = Field(min_length=2, max_length=20)
    min_selected: int | None = Field(default=None, ge=0, le=20)
    max_selected: int | None = Field(default=None, ge=0, le=20)

    @model_validator(mode="after")
    def validate_options(self) -> LibraryMultipleChoice:
        _validate_options(self.options)
        if (
            self.min_selected is not None
            and self.max_selected is not None
            and self.min_selected > self.max_selected
        ):
            raise ValueError("最少选择数不能大于最多选择数")
        minimum = self.min_selected or 0
        maximum = self.max_selected if self.max_selected is not None else len(self.options)
        if maximum > len(self.options) or minimum > len(self.options):
            raise ValueError("选择数量不能超过选项数量")
        return self


class LibraryTextQuestion(LibraryQuestionBase):
    type: Literal["text"]
    min_length: int | None = Field(default=None, ge=0, le=10000)
    max_length: int | None = Field(default=None, ge=0, le=10000)

    @model_validator(mode="after")
    def validate_lengths(self) -> LibraryTextQuestion:
        if (
            self.min_length is not None
            and self.max_length is not None
            and self.min_length > self.max_length
        ):
            raise ValueError("最少字数不能大于最多字数")
        return self


class LibraryNumberQuestion(LibraryQuestionBase):
    type: Literal["number"]
    min_value: float | None = None
    max_value: float | None = None
    integer_only: bool = False

    @model_validator(mode="after")
    def validate_range(self) -> LibraryNumberQuestion:
        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value > self.max_value
        ):
            raise ValueError("最小值不能大于最大值")
        if self.integer_only:
            if self.min_value is not None and not self.min_value.is_integer():
                raise ValueError("整数题的最小值必须为整数")
            if self.max_value is not None and not self.max_value.is_integer():
                raise ValueError("整数题的最大值必须为整数")
        return self


LibraryQuestionContent = Annotated[
    LibrarySingleChoice | LibraryMultipleChoice | LibraryTextQuestion | LibraryNumberQuestion,
    Field(discriminator="type"),
]


class QuestionCreateRequest(ApiModel):
    content: LibraryQuestionContent


class VersionCreateRequest(ApiModel):
    content: LibraryQuestionContent
    base_version_number: int = Field(ge=1)


class VersionRestoreRequest(ApiModel):
    base_version_number: int = Field(ge=1)


class QuestionDeriveRequest(ApiModel):
    content: LibraryQuestionContent


class ShareCreateRequest(ApiModel):
    expires_at: datetime | None = None


class ShareImportRequest(ApiModel):
    version_id: str = Field(min_length=1, max_length=64)


class LibraryQuestionSourceResponse(ApiModel):
    kind: Literal["derived", "shared_copy"]
    question_id: str
    question_title: str
    version_id: str
    version_number: int


class LibraryQuestionSummaryResponse(ApiModel):
    id: str
    title: str
    question_type: QuestionType
    latest_version_id: str
    latest_version_number: int
    required_by_default: bool
    archived: bool
    usage_survey_count: int
    source: LibraryQuestionSourceResponse | None = None
    created_at: datetime
    updated_at: datetime


class LibraryQuestionListResponse(ApiModel):
    items: list[LibraryQuestionSummaryResponse]
    page: int
    page_size: int
    total: int


class LibraryVersionSummaryResponse(ApiModel):
    id: str
    version_number: int
    title: str
    question_type: QuestionType
    origin_kind: Literal["initial", "edited", "restored", "shared_copy", "derived_initial"]
    base_version_id: str | None = None
    base_version_number: int | None = None
    restored_from_version_id: str | None = None
    restored_from_version_number: int | None = None
    shared_from_question_id: str | None = None
    shared_from_version_id: str | None = None
    shared_from_version_number: int | None = None
    created_at: datetime


class LibraryVersionResponse(LibraryVersionSummaryResponse):
    content: LibraryQuestionContent


class LibraryQuestionDetailResponse(LibraryQuestionSummaryResponse):
    latest_version: LibraryVersionResponse
    version_count: int


class ShareSummaryResponse(ApiModel):
    id: str
    token_hint: str
    created_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    active: bool


class ShareCreatedResponse(ApiModel):
    share: ShareSummaryResponse
    token: str
    url: str


class ShareListResponse(ApiModel):
    items: list[ShareSummaryResponse]


class SharedQuestionResponse(ApiModel):
    share_id: str
    question_id: str
    title: str
    question_type: QuestionType
    expires_at: datetime | None
    versions: list[LibraryVersionResponse]


class SharedImportResponse(ApiModel):
    import_id: str
    local_question: LibraryQuestionDetailResponse


class ShareInboxItemResponse(ApiModel):
    id: str
    imported_at: datetime
    source_question_id: str
    source_question_title: str
    source_version_number: int
    source_share_active: bool
    source_share_expires_at: datetime | None
    local_question: LibraryQuestionSummaryResponse


class ShareInboxResponse(ApiModel):
    items: list[ShareInboxItemResponse]
    page: int
    page_size: int
    total: int


class QuestionUsageSurveyResponse(ApiModel):
    survey_id: str
    title: str
    status: Literal["draft", "published", "closed", "expired"]
    version_numbers: list[int]
    response_count: int
    latest_used_at: datetime


class QuestionUsageResponse(ApiModel):
    question_id: str
    total_surveys: int
    surveys: list[QuestionUsageSurveyResponse]


class LibraryOptionStatisticResponse(ApiModel):
    option_id: str
    label: str
    count: int
    percentage: float
    historical: bool = False


class LibraryNumericStatisticResponse(ApiModel):
    count: int
    average: float | None
    minimum: float | None
    maximum: float | None


class LibraryVersionStatisticsResponse(ApiModel):
    version_id: str
    version_number: int
    title: str
    answered_count: int
    options: list[LibraryOptionStatisticResponse] = Field(default_factory=list)
    numeric: LibraryNumericStatisticResponse | None = None
    text_value_count: int = 0


class LibraryQuestionStatisticsResponse(ApiModel):
    question_id: str
    title: str
    question_type: QuestionType
    version_count: int
    used_survey_count: int
    answered_count: int
    options: list[LibraryOptionStatisticResponse] = Field(default_factory=list)
    numeric: LibraryNumericStatisticResponse | None = None
    text_value_count: int = 0
    versions: list[LibraryVersionStatisticsResponse]


class LibraryTextValueResponse(ApiModel):
    value: str
    survey_id: str
    survey_title: str
    survey_version_number: int
    question_version_number: int
    submitted_at: datetime


class LibraryTextValuesResponse(ApiModel):
    items: list[LibraryTextValueResponse]
    page: int
    page_size: int
    total: int
