import pytest
from pydantic import ValidationError

from app.modules.surveys.flow import (
    compute_path,
    rule_conflicts,
    validate_draft_answers,
    validate_submission,
)
from app.modules.surveys.schemas import SurveySchema


def option(option_id: str, label: str | None = None) -> dict[str, str]:
    return {"id": option_id, "label": label or option_id}


def single_choice(
    question_id: str,
    *,
    rules: list[dict] | None = None,
    required: bool = False,
) -> dict:
    return {
        "id": question_id,
        "type": "single_choice",
        "title": question_id,
        "required": required,
        "options": [option("a"), option("b")],
        "jump_rules": rules or [],
    }


def multiple_choice(
    question_id: str,
    *,
    rules: list[dict] | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> dict:
    return {
        "id": question_id,
        "type": "multiple_choice",
        "title": question_id,
        "options": [option("a"), option("b"), option("c")],
        "min_selected": minimum,
        "max_selected": maximum,
        "jump_rules": rules or [],
    }


def number_question(question_id: str, *, rules: list[dict] | None = None) -> dict:
    return {
        "id": question_id,
        "type": "number",
        "title": question_id,
        "integer_only": True,
        "jump_rules": rules or [],
    }


def text_question(question_id: str, *, required: bool = False) -> dict:
    return {
        "id": question_id,
        "type": "text",
        "title": question_id,
        "required": required,
        "min_length": 2,
        "max_length": 4,
    }


def schema_with(*questions: dict) -> SurveySchema:
    return SurveySchema.model_validate(
        {
            "title": "测试问卷",
            "questions": list(questions),
            "presentation": {"mode": "continuous"},
        }
    )


def test_rule_conflicts_detect_overlapping_targets_and_respect_selection_limits() -> None:
    conflicting = schema_with(
        single_choice(
            "q1",
            rules=[
                {
                    "id": "r1",
                    "target_question_id": "q2",
                    "condition": {"kind": "single", "option_id": "a"},
                },
                {
                    "id": "r2",
                    "target_question_id": "q3",
                    "condition": {"kind": "single", "option_id": "a"},
                },
            ],
        ),
        single_choice("q2"),
        single_choice("q3"),
    )
    assert rule_conflicts(conflicting)

    impossible_multi = schema_with(
        multiple_choice(
            "q1",
            minimum=1,
            maximum=1,
            rules=[
                {
                    "id": "r1",
                    "target_question_id": "q2",
                    "condition": {"kind": "multi", "operator": "any", "option_ids": ["a"]},
                },
                {
                    "id": "r2",
                    "target_question_id": "q3",
                    "condition": {"kind": "multi", "operator": "any", "option_ids": ["b"]},
                },
            ],
        ),
        single_choice("q2"),
        single_choice("q3"),
    )
    assert rule_conflicts(impossible_multi) == []

    overlapping_multi = impossible_multi.model_copy(deep=True)
    overlapping_multi.questions[0].max_selected = 2
    assert rule_conflicts(overlapping_multi)


def test_integer_rule_intervals_require_an_integer_value() -> None:
    rules = [
        {
            "id": "r1",
            "target_question_id": "q2",
            "condition": {"kind": "number", "min_value": 0.2, "max_value": 0.8},
        },
        {
            "id": "r2",
            "target_question_id": "q3",
            "condition": {"kind": "number", "min_value": 0.2, "max_value": 0.8},
        },
    ]
    integer_schema = schema_with(
        number_question("q1", rules=rules),
        single_choice("q2"),
        single_choice("q3"),
    )
    assert rule_conflicts(integer_schema) == []

    decimal_question = number_question("q1", rules=rules)
    decimal_question["integer_only"] = False
    decimal_schema = schema_with(
        decimal_question,
        single_choice("q2"),
        single_choice("q3"),
    )
    assert rule_conflicts(decimal_schema)


def test_path_skips_required_questions_and_submission_keeps_only_active_path() -> None:
    schema = schema_with(
        single_choice(
            "q1",
            rules=[
                {
                    "id": "r1",
                    "target_question_id": "q3",
                    "condition": {"kind": "single", "option_id": "a"},
                }
            ],
        ),
        single_choice("q2", required=True),
        text_question("q3", required=True),
    )
    answers = {"q1": "a", "q2": "ignored", "q3": "答案"}
    assert [question.id for question in compute_path(schema, answers)] == ["q1", "q3"]

    validation = validate_submission(schema, answers)
    assert validation.errors == {}
    assert validation.answers == {"q1": "a", "q3": "答案"}
    assert validation.path_question_ids == ["q1", "q3"]


def test_text_length_uses_unicode_code_points_and_draft_validation_is_strict() -> None:
    schema = schema_with(text_question("q1"))
    assert validate_draft_answers(schema, {"q1": "😀😀"}) == {}
    assert validate_draft_answers(schema, {"q1": "😀"}) == {}
    assert "q1" in validate_submission(schema, {"q1": "😀"}).errors
    assert "missing" in validate_draft_answers(schema, {"missing": "value"})

    multi = schema_with(multiple_choice("q1"))
    assert "q1" in validate_draft_answers(multi, {"q1": ["a", "a"]})
    assert "q1" in validate_draft_answers(multi, {"q1": ["unknown"]})


def test_paged_schema_requires_ordered_complete_page_assignment() -> None:
    base = {
        "title": "分页问卷",
        "presentation": {"mode": "paged"},
        "questions": [single_choice("q1"), single_choice("q2")],
        "pages": [
            {"id": "p1", "title": "第一页", "question_ids": ["q1"]},
            {"id": "p2", "title": "第二页", "question_ids": ["q2"]},
        ],
    }
    assert SurveySchema.model_validate(base).pages[1].title == "第二页"
    base["pages"] = [
        {"id": "p1", "title": "第一页", "question_ids": ["q2"]},
        {"id": "p2", "title": "第二页", "question_ids": ["q1"]},
    ]
    with pytest.raises(ValidationError):
        SurveySchema.model_validate(base)
