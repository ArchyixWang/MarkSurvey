from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

END_TARGET = "__end__"


def _clean_text(value: str) -> str:
    return value.strip()


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class OptionSchema(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=200)

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("选项文案不能为空")
        return value


class SingleJumpCondition(ApiModel):
    kind: Literal["single"]
    option_id: str = Field(min_length=1, max_length=64)


class MultiJumpCondition(ApiModel):
    kind: Literal["multi"]
    operator: Literal["any", "all", "none"]
    option_ids: list[str] = Field(min_length=1, max_length=20)


class NumberJumpCondition(ApiModel):
    kind: Literal["number"]
    min_value: float | None = None
    max_value: float | None = None
    min_inclusive: bool = True
    max_inclusive: bool = True

    @model_validator(mode="after")
    def validate_interval(self) -> NumberJumpCondition:
        if self.min_value is None and self.max_value is None:
            raise ValueError("数字跳转至少需要一个边界")
        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value > self.max_value
        ):
            raise ValueError("数字跳转下界不能大于上界")
        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value == self.max_value
            and (not self.min_inclusive or not self.max_inclusive)
        ):
            raise ValueError("数字跳转区间不能为空")
        return self


JumpCondition = Annotated[
    SingleJumpCondition | MultiJumpCondition | NumberJumpCondition,
    Field(discriminator="kind"),
]


class JumpRule(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    target_question_id: str = Field(min_length=1, max_length=64)
    condition: JumpCondition


class LibraryReference(ApiModel):
    question_id: str = Field(min_length=1, max_length=64)
    version_id: str = Field(min_length=1, max_length=64)
    linked: bool = True


class QuestionBase(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=1000)
    required: bool = False
    library_ref: LibraryReference | None = None

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


class SingleChoiceQuestion(QuestionBase):
    type: Literal["single_choice"]
    options: list[OptionSchema] = Field(min_length=2, max_length=20)
    jump_rules: list[JumpRule] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_single_choice(self) -> SingleChoiceQuestion:
        _validate_options(self.options)
        option_ids = {option.id for option in self.options}
        for rule in self.jump_rules:
            if not isinstance(rule.condition, SingleJumpCondition):
                raise ValueError("单选题只能使用单选跳转条件")
            if rule.condition.option_id not in option_ids:
                raise ValueError("跳转条件引用了不存在的选项")
        return self


class MultipleChoiceQuestion(QuestionBase):
    type: Literal["multiple_choice"]
    options: list[OptionSchema] = Field(min_length=2, max_length=20)
    min_selected: int | None = Field(default=None, ge=0, le=20)
    max_selected: int | None = Field(default=None, ge=0, le=20)
    jump_rules: list[JumpRule] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_multiple_choice(self) -> MultipleChoiceQuestion:
        _validate_options(self.options)
        option_ids = {option.id for option in self.options}
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
        if self.required and maximum == 0:
            raise ValueError("必答多选题不能限制为 0 项")
        for rule in self.jump_rules:
            if not isinstance(rule.condition, MultiJumpCondition):
                raise ValueError("多选题只能使用多选跳转条件")
            if any(option_id not in option_ids for option_id in rule.condition.option_ids):
                raise ValueError("跳转条件引用了不存在的选项")
        return self


class TextQuestion(QuestionBase):
    type: Literal["text"]
    min_length: int | None = Field(default=None, ge=0, le=10000)
    max_length: int | None = Field(default=None, ge=0, le=10000)
    jump_rules: list[JumpRule] = Field(default_factory=list, max_length=0)

    @model_validator(mode="after")
    def validate_text(self) -> TextQuestion:
        if (
            self.min_length is not None
            and self.max_length is not None
            and self.min_length > self.max_length
        ):
            raise ValueError("最少字数不能大于最多字数")
        return self


class NumberQuestion(QuestionBase):
    type: Literal["number"]
    min_value: float | None = None
    max_value: float | None = None
    integer_only: bool = False
    jump_rules: list[JumpRule] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_number(self) -> NumberQuestion:
        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value > self.max_value
        ):
            raise ValueError("最小值不能大于最大值")
        for rule in self.jump_rules:
            if not isinstance(rule.condition, NumberJumpCondition):
                raise ValueError("数字题只能使用数字跳转条件")
        return self


Question = Annotated[
    SingleChoiceQuestion | MultipleChoiceQuestion | TextQuestion | NumberQuestion,
    Field(discriminator="type"),
]


class PageSchema(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    question_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("页面标题不能为空")
        return value


class PresentationSchema(ApiModel):
    mode: Literal["continuous", "paged"] = "continuous"


class SurveySchema(ApiModel):
    schema_version: Literal[1] = 1
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    allow_anonymous: bool = False
    allow_multiple_responses: bool = False
    presentation: PresentationSchema = Field(default_factory=PresentationSchema)
    pages: list[PageSchema] = Field(default_factory=list, max_length=100)
    questions: list[Question] = Field(default_factory=list, max_length=100)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("问卷标题不能为空")
        return value

    @model_validator(mode="after")
    def validate_structure(self) -> SurveySchema:
        question_ids = [question.id for question in self.questions]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("题目 ID 不能重复")
        positions = {question_id: index for index, question_id in enumerate(question_ids)}
        rule_ids: list[str] = []
        for question in self.questions:
            rule_ids.extend(rule.id for rule in question.jump_rules)
            for rule in question.jump_rules:
                if rule.target_question_id == END_TARGET:
                    continue
                target_position = positions.get(rule.target_question_id)
                if target_position is None:
                    raise ValueError("跳转目标题目不存在")
                if target_position <= positions[question.id]:
                    raise ValueError("跳转目标必须位于当前题目之后")
        if len(rule_ids) != len(set(rule_ids)):
            raise ValueError("跳转规则 ID 不能重复")
        if self.presentation.mode == "continuous":
            if self.pages:
                raise ValueError("连续展示模式不能包含页面")
            return self
        if not self.questions:
            if self.pages:
                raise ValueError("空问卷不能配置页面")
            return self
        if not self.pages:
            raise ValueError("分页模式至少需要一个页面")
        page_ids = [page.id for page in self.pages]
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("页面 ID 不能重复")
        flattened = [question_id for page in self.pages for question_id in page.question_ids]
        if flattened != question_ids:
            raise ValueError("页面必须按题目顺序且不重复地包含全部题目")
        return self


class SurveyCreateRequest(ApiModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    allow_anonymous: bool = False

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("问卷标题不能为空")
        return value


class SurveyDraftUpdateRequest(ApiModel):
    schema_data: SurveySchema = Field(alias="schema")
    revision: int = Field(ge=1)


class SurveyPublishRequest(ApiModel):
    revision: int = Field(ge=1)


class SurveyDeadlineRequest(ApiModel):
    deadline_at: datetime | None = None


class AttemptCreateRequest(ApiModel):
    start_new: bool = False


class AttemptSaveRequest(ApiModel):
    revision: int = Field(ge=1)
    answers: dict[str, Any] = Field(default_factory=dict)
    current_question_id: str | None = None


class AttemptSubmitRequest(AttemptSaveRequest):
    pass


class SurveySummaryResponse(ApiModel):
    id: str
    title: str
    short_code: str
    status: Literal["draft", "published", "closed", "expired"]
    deadline_at: datetime | None
    active_version_number: int | None
    response_count: int
    has_unpublished_changes: bool
    created_at: datetime
    updated_at: datetime


class SurveyListResponse(ApiModel):
    items: list[SurveySummaryResponse]
    page: int
    page_size: int
    total: int


class SurveyVersionSummaryResponse(ApiModel):
    id: str
    version_number: int
    schema_hash: str
    created_at: datetime
    active: bool


class SurveyVersionResponse(SurveyVersionSummaryResponse):
    schema_data: SurveySchema = Field(alias="schema")


class SurveyDetailResponse(SurveySummaryResponse):
    draft_schema: SurveySchema
    draft_revision: int
    active_version_id: str | None
    published_at: datetime | None
    closed_at: datetime | None


class AttemptSummary(ApiModel):
    attempt_id: str
    version_id: str
    version_number: int
    revision: int
    answers: dict[str, Any]
    current_question_id: str | None
    updated_at: datetime


class PublicSurveyResponse(ApiModel):
    short_code: str
    title: str
    status: Literal["draft", "published", "closed", "expired"]
    deadline_at: datetime | None
    can_fill: bool
    active_version_number: int | None
    survey_schema: SurveySchema | None
    existing_attempt: AttemptSummary | None
    completed: bool
    can_start_new: bool


class AttemptResponse(AttemptSummary):
    short_code: str
    survey_schema: SurveySchema


class AttemptSavedResponse(ApiModel):
    revision: int
    updated_at: datetime


class SubmissionResponse(ApiModel):
    response_id: str
    submitted_at: datetime


class OptionStatisticResponse(ApiModel):
    option_id: str
    label: str
    count: int
    percentage: float


class NumericStatisticResponse(ApiModel):
    count: int
    average: float | None
    minimum: float | None
    maximum: float | None


class QuestionStatisticResponse(ApiModel):
    question_id: str
    title: str
    type: Literal["single_choice", "multiple_choice", "text", "number"]
    answered_count: int
    options: list[OptionStatisticResponse] = Field(default_factory=list)
    numeric: NumericStatisticResponse | None = None
    text_value_count: int = 0


class SurveyStatisticsResponse(ApiModel):
    survey_id: str
    active_version_number: int
    submitted_responses: int
    unique_respondents: int
    questions: list[QuestionStatisticResponse]


class TextValueResponse(ApiModel):
    value: str
    submitted_at: datetime


class TextValuesResponse(ApiModel):
    items: list[TextValueResponse]
    page: int
    page_size: int
    total: int
