from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.database import Database

API = "/api/v1"


def csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get("marksurvey_csrf")
    assert token
    return {"X-CSRF-Token": token}


def option(option_id: str, label: str | None = None) -> dict[str, str]:
    return {"id": option_id, "label": label or option_id}


def single_question(
    question_id: str,
    *,
    required: bool = False,
    rules: list[dict] | None = None,
) -> dict:
    return {
        "id": question_id,
        "type": "single_choice",
        "title": question_id,
        "required": required,
        "options": [option("a", "选项 A"), option("b", "选项 B")],
        "jump_rules": rules or [],
    }


def text_question(question_id: str, *, required: bool = False) -> dict:
    return {
        "id": question_id,
        "type": "text",
        "title": question_id,
        "required": required,
        "min_length": 2,
        "max_length": 20,
    }


def number_question(question_id: str) -> dict:
    return {
        "id": question_id,
        "type": "number",
        "title": question_id,
        "min_value": 0,
        "max_value": 120,
        "integer_only": True,
    }


def survey_schema(
    *,
    title: str = "满意度调查",
    allow_anonymous: bool = False,
    allow_multiple: bool = False,
    questions: list[dict] | None = None,
) -> dict:
    return {
        "schema_version": 1,
        "title": title,
        "description": "说明",
        "allow_anonymous": allow_anonymous,
        "allow_multiple_responses": allow_multiple,
        "presentation": {"mode": "continuous"},
        "pages": [],
        "questions": questions or [single_question("q1", required=True)],
    }


def create_survey(client: TestClient, title: str = "满意度调查") -> dict:
    response = client.post(
        f"{API}/surveys",
        json={"title": title, "description": "说明", "allow_anonymous": False},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


def save_draft(client: TestClient, survey_id: str, schema: dict, revision: int) -> dict:
    response = client.put(
        f"{API}/surveys/{survey_id}/draft",
        json={"schema": schema, "revision": revision},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def publish(client: TestClient, survey_id: str, revision: int) -> dict:
    response = client.post(
        f"{API}/surveys/{survey_id}/publish",
        json={"revision": revision},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def login_password(
    client: TestClient,
    solve_captcha: Callable[..., str],
    *,
    identifier: str = "demo_user",
    password: str = "Survey1234",
) -> None:
    client.cookies.clear()
    response = client.post(
        f"{API}/auth/login/password",
        json={
            "identifier": identifier,
            "password": password,
            "captcha_token": solve_captcha(),
        },
    )
    assert response.status_code == 200, response.text


def test_management_listing_isolation_versions_and_revision_conflicts(
    client: TestClient,
    register_user: Callable[..., object],
) -> None:
    assert register_user().status_code == 201
    created = create_survey(client)
    assert len(created["short_code"]) == 10
    assert created["status"] == "draft"
    assert created["draft_revision"] == 1
    assert created["has_unpublished_changes"] is True
    assert created["draft_schema"]["questions"] == []

    listed = client.get(f"{API}/surveys").json()
    assert listed["total"] == 1
    assert listed["items"][0]["id"] == created["id"]

    schema = survey_schema()
    saved = save_draft(client, created["id"], schema, created["draft_revision"])
    assert saved["draft_revision"] == 2

    stale = client.put(
        f"{API}/surveys/{created['id']}/draft",
        json={"schema": schema, "revision": created["draft_revision"]},
        headers=csrf_headers(client),
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "SURVEY_REVISION_CONFLICT"

    first_publish = publish(client, created["id"], saved["draft_revision"])
    assert first_publish["status"] == "published"
    assert first_publish["active_version_number"] == 1
    assert first_publish["has_unpublished_changes"] is False
    short_code = first_publish["short_code"]

    changed_schema = survey_schema(title="满意度调查（二版）")
    second_draft = save_draft(
        client,
        created["id"],
        changed_schema,
        first_publish["draft_revision"],
    )
    second_publish = publish(client, created["id"], second_draft["draft_revision"])
    assert second_publish["active_version_number"] == 2
    assert second_publish["short_code"] == short_code

    versions = client.get(f"{API}/surveys/{created['id']}/versions")
    assert versions.status_code == 200
    version_items = versions.json()
    assert [item["version_number"] for item in version_items] == [2, 1]
    assert version_items[0]["active"] is True

    first_version = client.get(f"{API}/surveys/{created['id']}/versions/{version_items[1]['id']}")
    assert first_version.status_code == 200
    assert first_version.json()["schema"]["title"] == "满意度调查"

    copied = client.post(
        f"{API}/surveys/{created['id']}/versions/{version_items[1]['id']}/copy-to-draft",
        headers=csrf_headers(client),
    )
    assert copied.status_code == 200
    assert copied.json()["draft_schema"]["title"] == "满意度调查"
    assert copied.json()["active_version_number"] == 2
    assert copied.json()["has_unpublished_changes"] is True

    client.cookies.clear()
    assert (
        register_user(
            username="其他用户",
            account="other_user",
            email="other@example.com",
            password="Other1234",
        ).status_code
        == 201
    )
    cross_tenant = client.get(f"{API}/surveys/{created['id']}")
    assert cross_tenant.status_code == 404
    assert cross_tenant.json()["error"]["code"] == "SURVEY_NOT_FOUND"
    assert client.get(f"{API}/surveys").json()["total"] == 0


def test_fill_save_resume_jump_anonymous_submission_and_statistics(
    client: TestClient,
    register_user: Callable[..., object],
    solve_captcha: Callable[..., str],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    created = create_survey(client)
    schema = survey_schema(
        allow_anonymous=True,
        questions=[
            single_question(
                "q1",
                required=True,
                rules=[
                    {
                        "id": "rule-1",
                        "target_question_id": "q3",
                        "condition": {"kind": "single", "option_id": "a"},
                    }
                ],
            ),
            single_question("q2", required=True),
            text_question("q3", required=True),
            number_question("q4"),
        ],
    )
    draft = save_draft(client, created["id"], schema, created["draft_revision"])
    published = publish(client, created["id"], draft["draft_revision"])
    short_code = published["short_code"]

    client.cookies.clear()
    assert (
        register_user(
            username="填写者",
            account="respondent",
            email="respondent@example.com",
            password="Respond1234",
        ).status_code
        == 201
    )

    public = client.get(f"{API}/public/surveys/{short_code}")
    assert public.status_code == 200
    assert public.json()["can_fill"] is True
    assert public.json()["survey_schema"]["allow_anonymous"] is True

    attempt_response = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": False},
        headers=csrf_headers(client),
    )
    assert attempt_response.status_code == 201, attempt_response.text
    attempt = attempt_response.json()
    attempt_id = attempt["attempt_id"]
    assert attempt["revision"] == 1

    saved = client.patch(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_id}",
        json={"revision": 1, "answers": {"q1": "a"}, "current_question_id": "q3"},
        headers=csrf_headers(client),
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 2

    invalid = client.patch(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_id}",
        json={"revision": 2, "answers": {"q1": "unknown"}},
        headers=csrf_headers(client),
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "SURVEY_ANSWERS_INVALID"
    assert "q1" in invalid.json()["error"]["field_errors"]

    answers = {"q1": "a", "q2": "b", "q3": "很棒", "q4": 20}
    final_save = client.patch(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_id}",
        json={"revision": 2, "answers": answers, "current_question_id": "q4"},
        headers=csrf_headers(client),
    )
    assert final_save.status_code == 200
    assert final_save.json()["revision"] == 3

    resumed = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": False},
        headers=csrf_headers(client),
    )
    assert resumed.status_code == 201
    assert resumed.json()["attempt_id"] == attempt_id
    assert resumed.json()["answers"] == answers

    submitted = client.post(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_id}/submit",
        json={"revision": 3, "answers": answers, "current_question_id": "q4"},
        headers=csrf_headers(client),
    )
    assert submitted.status_code == 200, submitted.text
    response_id = submitted.json()["response_id"]

    stored = mongo_database.survey_responses.find_one({"_id": ObjectId(response_id)})
    assert stored is not None
    assert "owner_user_id" not in stored
    assert "respondent_user_id" not in stored
    assert stored["respondent_key_hash"]
    assert stored["answers"] == {"q1": "a", "q3": "很棒", "q4": 20}

    replayed = client.post(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_id}/submit",
        json={"revision": 3, "answers": answers, "current_question_id": "q4"},
        headers=csrf_headers(client),
    )
    assert replayed.status_code == 409
    assert replayed.json()["error"]["code"] == "SURVEY_ALREADY_SUBMITTED"
    repeat = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": True},
        headers=csrf_headers(client),
    )
    assert repeat.status_code == 409

    login_password(client, solve_captcha)
    stats = client.get(f"{API}/surveys/{created['id']}/statistics")
    assert stats.status_code == 200, stats.text
    details = stats.json()
    assert details["submitted_responses"] == 1
    assert details["unique_respondents"] == 1
    by_id = {question["question_id"]: question for question in details["questions"]}
    assert by_id["q1"]["answered_count"] == 1
    assert by_id["q1"]["options"][0]["count"] == 1
    assert by_id["q2"]["answered_count"] == 0
    assert by_id["q3"]["text_value_count"] == 1
    assert by_id["q4"]["numeric"]["average"] == 20

    text_values = client.get(f"{API}/surveys/{created['id']}/statistics/questions/q3/text-values")
    assert text_values.status_code == 200
    assert text_values.json()["items"][0]["value"] == "很棒"


def test_validation_rules_and_required_path_are_enforced_on_submit(
    client: TestClient,
    register_user: Callable[..., object],
) -> None:
    assert register_user().status_code == 201
    created = create_survey(client)
    conflicting_schema = survey_schema(
        questions=[
            single_question(
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
            single_question("q2"),
            single_question("q3"),
        ]
    )
    draft = save_draft(client, created["id"], conflicting_schema, created["draft_revision"])
    rejected = client.post(
        f"{API}/surveys/{created['id']}/publish",
        json={"revision": draft["draft_revision"]},
        headers=csrf_headers(client),
    )
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "SURVEY_RULE_CONFLICT"

    required_schema = survey_schema(
        questions=[single_question("q1", required=True), single_question("q2", required=True)]
    )
    draft = save_draft(client, created["id"], required_schema, draft["draft_revision"])
    published = publish(client, created["id"], draft["draft_revision"])
    short_code = published["short_code"]
    attempt = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": False},
        headers=csrf_headers(client),
    ).json()
    missing_required = client.post(
        f"{API}/public/surveys/{short_code}/attempts/{attempt['attempt_id']}/submit",
        json={"revision": 1, "answers": {"q1": "a"}},
        headers=csrf_headers(client),
    )
    assert missing_required.status_code == 422
    assert "q2" in missing_required.json()["error"]["field_errors"]


def test_version_switch_invalidates_draft_and_repeat_responses_are_explicit(
    client: TestClient,
    register_user: Callable[..., object],
) -> None:
    assert register_user().status_code == 201
    created = create_survey(client)
    draft = save_draft(client, created["id"], survey_schema(), created["draft_revision"])
    first = publish(client, created["id"], draft["draft_revision"])
    short_code = first["short_code"]
    attempt = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": False},
        headers=csrf_headers(client),
    ).json()

    second_draft = save_draft(
        client,
        created["id"],
        survey_schema(title="第二版"),
        first["draft_revision"],
    )
    second_publish = publish(client, created["id"], second_draft["draft_revision"])
    stale = client.patch(
        f"{API}/public/surveys/{short_code}/attempts/{attempt['attempt_id']}",
        json={"revision": 1, "answers": {"q1": "a"}},
        headers=csrf_headers(client),
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "SURVEY_VERSION_CHANGED"

    repeatable = survey_schema(allow_multiple=True, questions=[single_question("q1")])
    third_draft = save_draft(
        client,
        created["id"],
        repeatable,
        second_publish["draft_revision"],
    )
    publish(client, created["id"], third_draft["draft_revision"])
    for _ in range(2):
        new_attempt = client.post(
            f"{API}/public/surveys/{short_code}/attempts",
            json={"start_new": True},
            headers=csrf_headers(client),
        )
        assert new_attempt.status_code == 201, new_attempt.text
        body = new_attempt.json()
        submitted = client.post(
            f"{API}/public/surveys/{short_code}/attempts/{body['attempt_id']}/submit",
            json={"revision": body["revision"], "answers": {"q1": "a"}},
            headers=csrf_headers(client),
        )
        assert submitted.status_code == 200, submitted.text
    stats = client.get(f"{API}/surveys/{created['id']}/statistics").json()
    assert stats["submitted_responses"] == 2
    assert stats["unique_respondents"] == 1


def test_deadline_close_and_republish_lifecycle(
    client: TestClient,
    register_user: Callable[..., object],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    created = create_survey(client)
    draft = save_draft(client, created["id"], survey_schema(), created["draft_revision"])
    published = publish(client, created["id"], draft["draft_revision"])
    short_code = published["short_code"]

    past = datetime.now(UTC) - timedelta(minutes=1)
    rejected = client.put(
        f"{API}/surveys/{created['id']}/deadline",
        json={"deadline_at": past.isoformat()},
        headers=csrf_headers(client),
    )
    assert rejected.status_code == 422

    future = datetime.now(UTC) + timedelta(days=1)
    deadline = client.put(
        f"{API}/surveys/{created['id']}/deadline",
        json={"deadline_at": future.isoformat()},
        headers=csrf_headers(client),
    )
    assert deadline.status_code == 200
    assert deadline.json()["deadline_at"] is not None

    mongo_database.surveys.update_one(
        {"_id": ObjectId(created["id"])},
        {"$set": {"deadline_at": past}},
    )
    expired = client.get(f"{API}/public/surveys/{short_code}")
    assert expired.json()["status"] == "expired"
    assert expired.json()["can_fill"] is False

    closed = client.post(
        f"{API}/surveys/{created['id']}/close",
        headers=csrf_headers(client),
    )
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert client.get(f"{API}/public/surveys/{short_code}").json()["status"] == "closed"

    reopened = publish(client, created["id"], closed.json()["draft_revision"])
    assert reopened["status"] == "expired"
    cleared = client.put(
        f"{API}/surveys/{created['id']}/deadline",
        json={"deadline_at": None},
        headers=csrf_headers(client),
    )
    assert cleared.status_code == 200
    assert cleared.json()["status"] == "published"
