from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.modules.surveys.schemas import (
    END_TARGET,
    JumpRule,
    MultiJumpCondition,
    MultipleChoiceQuestion,
    NumberJumpCondition,
    NumberQuestion,
    Question,
    SingleChoiceQuestion,
    SingleJumpCondition,
    SurveySchema,
    TextQuestion,
)


@dataclass(frozen=True, slots=True)
class SubmissionValidation:
    answers: dict[str, Any]
    path_question_ids: list[str]
    errors: dict[str, str]


def _option_ids(question: Question) -> set[str]:
    if isinstance(question, (SingleChoiceQuestion, MultipleChoiceQuestion)):
        return {option.id for option in question.options}
    return set()


def _multi_limits(question: MultipleChoiceQuestion) -> tuple[int, int]:
    minimum = question.min_selected
    if minimum is None:
        minimum = 1 if question.required else 0
    elif question.required:
        minimum = max(1, minimum)
    maximum = question.max_selected
    if maximum is None:
        maximum = len(question.options)
    return minimum, maximum


def answer_is_complete(question: Question, value: Any) -> bool:
    if value is None:
        return False
    if isinstance(question, SingleChoiceQuestion):
        return isinstance(value, str) and value in _option_ids(question)
    if isinstance(question, MultipleChoiceQuestion):
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            return False
        selected = set(value)
        if len(selected) != len(value) or not selected.issubset(_option_ids(question)):
            return False
        minimum, maximum = _multi_limits(question)
        return minimum <= len(selected) <= maximum
    if isinstance(question, TextQuestion):
        if not isinstance(value, str):
            return False
        if question.required and not value.strip():
            return False
        if question.min_length is not None and len(value) < question.min_length:
            return False
        return not (question.max_length is not None and len(value) > question.max_length)
    if isinstance(question, NumberQuestion):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        numeric = float(value)
        if not math.isfinite(numeric):
            return False
        if question.integer_only and not numeric.is_integer():
            return False
        if question.min_value is not None and numeric < question.min_value:
            return False
        return not (question.max_value is not None and numeric > question.max_value)
    return False


def _number_condition_matches(condition: NumberJumpCondition, value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    numeric = float(value)
    if condition.min_value is not None:
        if condition.min_inclusive:
            if numeric < condition.min_value:
                return False
        elif numeric <= condition.min_value:
            return False
    if condition.max_value is not None:
        if condition.max_inclusive:
            if numeric > condition.max_value:
                return False
        elif numeric >= condition.max_value:
            return False
    return True


def rule_matches(rule: JumpRule, question: Question, value: Any) -> bool:
    condition = rule.condition
    if isinstance(condition, SingleJumpCondition):
        return isinstance(value, str) and value == condition.option_id
    if isinstance(condition, MultiJumpCondition):
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            return False
        selected = set(value)
        condition_options = set(condition.option_ids)
        if condition.operator == "any":
            return bool(selected & condition_options)
        if condition.operator == "all":
            return condition_options.issubset(selected)
        return not bool(selected & condition_options)
    if isinstance(condition, NumberJumpCondition):
        return isinstance(question, NumberQuestion) and _number_condition_matches(condition, value)
    return False


def _matching_rules(question: Question, value: Any) -> list[JumpRule]:
    if not answer_is_complete(question, value):
        return []
    return [rule for rule in question.jump_rules if rule_matches(rule, question, value)]


def resolve_next_target(question: Question, value: Any) -> str | None:
    matches = _matching_rules(question, value)
    targets = {rule.target_question_id for rule in matches}
    if len(targets) != 1:
        return None
    return next(iter(targets))


def compute_path(schema: SurveySchema, answers: dict[str, Any]) -> list[Question]:
    if not schema.questions:
        return []
    positions = {question.id: index for index, question in enumerate(schema.questions)}
    path: list[Question] = []
    index = 0
    visited: set[int] = set()
    while 0 <= index < len(schema.questions) and index not in visited:
        visited.add(index)
        question = schema.questions[index]
        path.append(question)
        target = resolve_next_target(question, answers.get(question.id))
        if target == END_TARGET:
            break
        index = positions[target] if target is not None else index + 1
    return path


def validate_draft_answers(schema: SurveySchema, answers: dict[str, Any]) -> dict[str, str]:
    question_map = {question.id: question for question in schema.questions}
    errors: dict[str, str] = {}
    for question_id, value in answers.items():
        question = question_map.get(question_id)
        if question is None:
            errors[question_id] = "题目不存在"
            continue
        if isinstance(question, SingleChoiceQuestion):
            if not isinstance(value, str) or value not in _option_ids(question):
                errors[question_id] = "选项无效"
        elif isinstance(question, MultipleChoiceQuestion):
            if (
                not isinstance(value, list)
                or any(not isinstance(item, str) for item in value)
                or len(value) != len(set(value))
                or not set(value).issubset(_option_ids(question))
            ):
                errors[question_id] = "选项无效"
        elif isinstance(question, TextQuestion):
            if not isinstance(value, str):
                errors[question_id] = "答案格式不正确"
        elif isinstance(question, NumberQuestion) and (
            isinstance(value, bool) or not isinstance(value, (int, float))
        ):
            errors[question_id] = "答案格式不正确"
    return errors


def validate_submission(schema: SurveySchema, answers: dict[str, Any]) -> SubmissionValidation:
    draft_errors = validate_draft_answers(schema, answers)
    path = compute_path(schema, answers)
    path_ids = [question.id for question in path]
    filtered = {
        question_id: answers[question_id] for question_id in path_ids if question_id in answers
    }
    errors: dict[str, str] = {}
    for question in path:
        value = filtered.get(question.id)
        if value is None:
            if question.required:
                errors[question.id] = "此题为必答题"
            continue
        if question.id in draft_errors:
            errors[question.id] = draft_errors[question.id]
        elif not answer_is_complete(question, value):
            errors[question.id] = _answer_error(question)
    return SubmissionValidation(
        answers=filtered,
        path_question_ids=path_ids,
        errors=errors,
    )


def _answer_error(question: Question) -> str:
    if isinstance(question, MultipleChoiceQuestion):
        minimum, maximum = _multi_limits(question)
        if minimum == maximum:
            return f"必须选择 {minimum} 个选项"
        return f"请选择 {minimum}–{maximum} 个选项"
    if isinstance(question, NumberQuestion):
        return "请输入范围内的整数" if question.integer_only else "请输入范围内的数字"
    if isinstance(question, TextQuestion):
        return "输入内容不符合长度要求"
    return "请选择有效选项"


def _multi_condition_satisfiable(
    first: MultiJumpCondition,
    second: MultiJumpCondition,
    question: MultipleChoiceQuestion,
) -> bool:
    forbidden = set(first.option_ids) if first.operator == "none" else set()
    forbidden |= set(second.option_ids) if second.operator == "none" else set()
    required = set(first.option_ids) if first.operator == "all" else set()
    required |= set(second.option_ids) if second.operator == "all" else set()
    if required & forbidden:
        return False
    selectable = _option_ids(question) - forbidden
    if not required.issubset(selectable):
        return False
    remaining_groups = [
        set(condition.option_ids)
        for condition in (first, second)
        if condition.operator == "any" and not set(condition.option_ids) & required
    ]
    if any(not group & selectable for group in remaining_groups):
        return False

    extra = 0
    if len(remaining_groups) == 1:
        extra = 1
    elif len(remaining_groups) == 2:
        extra = 1 if remaining_groups[0] & remaining_groups[1] & selectable else 2

    minimum_needed = len(required) + extra
    minimum_allowed, maximum_allowed = _multi_limits(question)
    maximum_possible = len(selectable)
    return max(minimum_needed, minimum_allowed) <= min(maximum_allowed, maximum_possible)


def _number_conditions_overlap(
    first: NumberJumpCondition,
    second: NumberJumpCondition,
    integer_only: bool,
) -> bool:
    first_min = first.min_value if first.min_value is not None else -math.inf
    first_max = first.max_value if first.max_value is not None else math.inf
    second_min = second.min_value if second.min_value is not None else -math.inf
    second_max = second.max_value if second.max_value is not None else math.inf
    lower = max(first_min, second_min)
    upper = min(first_max, second_max)
    lower_inclusive = True
    upper_inclusive = True
    if lower == first_min:
        lower_inclusive &= first.min_inclusive
    if lower == second_min:
        lower_inclusive &= second.min_inclusive
    if upper == first_max:
        upper_inclusive &= first.max_inclusive
    if upper == second_max:
        upper_inclusive &= second.max_inclusive
    if lower > upper or (lower == upper and not (lower_inclusive and upper_inclusive)):
        return False
    if not integer_only:
        return True
    if math.isinf(lower) or math.isinf(upper):
        return True
    minimum_integer = math.ceil(lower) if lower_inclusive else math.floor(lower) + 1
    maximum_integer = math.floor(upper) if upper_inclusive else math.ceil(upper) - 1
    return minimum_integer <= maximum_integer


def _rules_conflict(first: JumpRule, second: JumpRule, question: Question) -> bool:
    if first.target_question_id == second.target_question_id:
        return False
    first_condition = first.condition
    second_condition = second.condition
    if isinstance(question, SingleChoiceQuestion):
        return (
            isinstance(first_condition, SingleJumpCondition)
            and isinstance(second_condition, SingleJumpCondition)
            and first_condition.option_id == second_condition.option_id
        )
    if isinstance(question, MultipleChoiceQuestion):
        return (
            isinstance(first_condition, MultiJumpCondition)
            and isinstance(second_condition, MultiJumpCondition)
            and _multi_condition_satisfiable(first_condition, second_condition, question)
        )
    if isinstance(question, NumberQuestion):
        return (
            isinstance(first_condition, NumberJumpCondition)
            and isinstance(second_condition, NumberJumpCondition)
            and _number_conditions_overlap(
                first_condition,
                second_condition,
                question.integer_only,
            )
        )
    return False


def rule_conflicts(schema: SurveySchema) -> list[tuple[str, str, str]]:
    conflicts: list[tuple[str, str, str]] = []
    for question in schema.questions:
        for index, first in enumerate(question.jump_rules):
            for second in question.jump_rules[index + 1 :]:
                if _rules_conflict(first, second, question):
                    conflicts.append((question.id, first.id, second.id))
    return conflicts


def has_rule_conflict(schema: SurveySchema) -> bool:
    return bool(rule_conflicts(schema))
