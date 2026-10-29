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


def single_content(
    title: str = "你的年龄段",
    *,
    required_by_default: bool = True,
    options: list[dict[str, str]] | None = None,
) -> dict:
    return {
        "type": "single_choice",
        "title": title,
        "description": "请选择",
        "required_by_default": required_by_default,
        "options": options or [option("young", "18-30"), option("senior", "31-45")],
    }


def text_content(title: str = "补充说明") -> dict:
    return {
        "type": "text",
        "title": title,
        "description": "",
        "required_by_default": False,
        "min_length": 1,
        "max_length": 100,
    }


def number_content(title: str = "年龄") -> dict:
    return {
        "type": "number",
        "title": title,
        "description": "",
        "required_by_default": False,
        "min_value": 0,
        "max_value": 120,
        "integer_only": True,
    }


def create_question(client: TestClient, content: dict) -> dict:
    response = client.post(
        f"{API}/question-library/questions",
        json={"content": content},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_version(client: TestClient, question: dict, content: dict) -> dict:
    response = client.post(
        f"{API}/question-library/questions/{question['id']}/versions",
        json={
            "content": content,
            "base_version_number": question["latest_version_number"],
        },
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_survey(client: TestClient, title: str, *, allow_multiple: bool = False) -> dict:
    response = client.post(
        f"{API}/surveys",
        json={
            "title": title,
            "description": "说明",
            "allow_anonymous": False,
        },
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    survey = response.json()
    survey["allow_multiple_responses"] = allow_multiple
    return survey


def linked_question(
    question_id: str,
    library_question: dict,
    version: dict,
    *,
    required: bool | None = None,
    linked: bool = True,
    content_overrides: dict | None = None,
) -> dict:
    content = dict(version["content"])
    if content_overrides:
        content.update(content_overrides)
    return {
        "id": question_id,
        "type": content["type"],
        "title": content["title"],
        "description": content["description"],
        "required": (bool(content["required_by_default"]) if required is None else required),
        **{
            key: value
            for key, value in content.items()
            if key not in {"type", "title", "description", "required_by_default"}
        },
        "jump_rules": [],
        "library_ref": {
            "question_id": library_question["id"],
            "version_id": version["id"],
            "linked": linked,
        },
    }


def save_survey(
    client: TestClient,
    survey: dict,
    questions: list[dict],
    *,
    allow_multiple: bool = False,
) -> dict:
    schema = {
        "schema_version": 1,
        "title": survey["title"],
        "description": "说明",
        "allow_anonymous": False,
        "allow_multiple_responses": allow_multiple,
        "presentation": {"mode": "continuous"},
        "pages": [],
        "questions": questions,
    }
    response = client.put(
        f"{API}/surveys/{survey['id']}/draft",
        json={"schema": schema, "revision": survey["draft_revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def publish_survey(client: TestClient, survey: dict) -> dict:
    response = client.post(
        f"{API}/surveys/{survey['id']}/publish",
        json={"revision": survey["draft_revision"]},
        headers=csrf_headers(client),
    )
    assert response.status_code == 200, response.text
    return response.json()


def submit_answer(client: TestClient, short_code: str, answers: dict) -> dict:
    attempt = client.post(
        f"{API}/public/surveys/{short_code}/attempts",
        json={"start_new": False},
        headers=csrf_headers(client),
    )
    assert attempt.status_code in {200, 201}, attempt.text
    attempt_body = attempt.json()
    submitted = client.post(
        f"{API}/public/surveys/{short_code}/attempts/{attempt_body['attempt_id']}/submit",
        json={"revision": attempt_body["revision"], "answers": answers},
        headers=csrf_headers(client),
    )
    assert submitted.status_code == 200, submitted.text
    return submitted.json()


def login_password(
    client: TestClient,
    solve_captcha: Callable[..., str],
    account: str,
    password: str = "Survey1234",
) -> None:
    client.cookies.clear()
    response = client.post(
        f"{API}/auth/login/password",
        json={
            "identifier": account,
            "password": password,
            "captcha_token": solve_captcha(),
        },
    )
    assert response.status_code == 200, response.text


def test_question_versions_restore_derive_and_archive(
    client: TestClient,
    register_user: Callable[..., object],
) -> None:
    assert register_user().status_code == 201
    question = create_question(client, single_content())
    assert question["latest_version_number"] == 1
    assert question["required_by_default"] is True

    second = create_version(
        client,
        question,
        single_content(
            "新版年龄段",
            options=[option("young", "18-30 岁"), option("middle", "31-50 岁")],
        ),
    )
    assert second["latest_version_number"] == 2
    versions = client.get(f"{API}/question-library/questions/{question['id']}/versions").json()
    assert [item["version_number"] for item in versions] == [2, 1]

    restored = client.post(
        f"{API}/question-library/questions/{question['id']}/versions/{versions[1]['id']}/restore",
        json={"base_version_number": 2},
        headers=csrf_headers(client),
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["latest_version_number"] == 3
    versions = client.get(f"{API}/question-library/questions/{question['id']}/versions").json()
    assert versions[0]["origin_kind"] == "restored"
    assert versions[0]["restored_from_version_number"] == 1

    type_change = client.post(
        f"{API}/question-library/questions/{question['id']}/versions",
        json={"content": text_content("错误题型"), "base_version_number": 3},
        headers=csrf_headers(client),
    )
    assert type_change.status_code == 422
    assert type_change.json()["error"]["code"] == "QUESTION_LIBRARY_INVALID"

    derived = client.post(
        f"{API}/question-library/questions/{question['id']}/versions/{versions[0]['id']}/derive",
        json={"content": text_content("年龄说明")},
        headers=csrf_headers(client),
    )
    assert derived.status_code == 201, derived.text
    derived_body = derived.json()
    assert derived_body["source"]["kind"] == "derived"
    assert derived_body["latest_version"]["origin_kind"] == "derived_initial"
    assert derived_body["question_type"] == "text"

    archived = client.post(
        f"{API}/question-library/questions/{question['id']}/archive",
        headers=csrf_headers(client),
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True
    assert client.get(f"{API}/question-library/questions").json()["total"] == 1
    assert client.get(f"{API}/question-library/questions?archived=true").json()["total"] == 1
    restored_archive = client.post(
        f"{API}/question-library/questions/{question['id']}/unarchive",
        headers=csrf_headers(client),
    )
    assert restored_archive.json()["archived"] is False

    stale = client.post(
        f"{API}/question-library/questions/{question['id']}/versions",
        json={"content": single_content(), "base_version_number": 1},
        headers=csrf_headers(client),
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "QUESTION_VERSION_CONFLICT"


def test_share_requires_login_expiry_revoke_and_frozen_import(
    client: TestClient,
    register_user: Callable[..., object],
    solve_captcha: Callable[..., str],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    question = create_question(client, single_content())
    share_response = client.post(
        f"{API}/question-library/questions/{question['id']}/shares",
        json={"expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat()},
        headers=csrf_headers(client),
    )
    assert share_response.status_code == 201, share_response.text
    share = share_response.json()
    token = share["token"]

    client.cookies.clear()
    assert client.get(f"{API}/question-library/shared/{token}").status_code == 401

    assert (
        register_user(
            username="接收者", account="recipient", email="recipient@example.com"
        ).status_code
        == 201
    )
    shared = client.get(f"{API}/question-library/shared/{token}")
    assert shared.status_code == 200, shared.text
    assert shared.json()["title"] == "你的年龄段"
    imported = client.post(
        f"{API}/question-library/shared/{token}/imports",
        json={"version_id": shared.json()["versions"][0]["id"]},
        headers=csrf_headers(client),
    )
    assert imported.status_code == 201, imported.text
    local = imported.json()["local_question"]
    assert local["source"]["kind"] == "shared_copy"
    assert local["latest_version"]["origin_kind"] == "shared_copy"

    login_password(client, solve_captcha, "demo_user")
    changed = create_version(
        client,
        question,
        single_content("来源已更新"),
    )
    assert changed["latest_version_number"] == 2
    login_password(client, solve_captcha, "recipient")
    local_after = client.get(f"{API}/question-library/questions/{local['id']}").json()
    assert local_after["latest_version"]["content"]["title"] == "你的年龄段"
    inbox = client.get(f"{API}/question-library/shares/inbox").json()
    assert inbox["total"] == 1
    assert inbox["items"][0]["source_question_title"] == "来源已更新"
    assert inbox["items"][0]["local_question"]["id"] == local["id"]

    login_password(client, solve_captcha, "demo_user")
    revoked = client.post(
        f"{API}/question-library/questions/{question['id']}/shares/{share['share']['id']}/revoke",
        headers=csrf_headers(client),
    )
    assert revoked.status_code == 200
    shares = client.get(f"{API}/question-library/questions/{question['id']}/shares").json()["items"]
    assert shares[0]["active"] is False
    login_password(client, solve_captcha, "recipient")
    unavailable = client.get(f"{API}/question-library/shared/{token}")
    assert unavailable.status_code == 410
    assert unavailable.json()["error"]["code"] == "QUESTION_SHARE_UNAVAILABLE"

    other_question = client.get(f"{API}/question-library/questions/{local['id']}")
    assert other_question.status_code == 200
    login_password(client, solve_captcha, "demo_user")
    cross_tenant = client.get(f"{API}/question-library/questions/{local['id']}")
    assert cross_tenant.status_code == 404

    expiring = client.post(
        f"{API}/question-library/questions/{question['id']}/shares",
        json={},
        headers=csrf_headers(client),
    ).json()
    mongo_database.question_shares.update_one(
        {"_id": ObjectId(expiring["share"]["id"])},
        {"$set": {"expires_at": datetime.now(UTC) - timedelta(seconds=1)}},
    )
    expired = client.get(f"{API}/question-library/shared/{expiring['token']}")
    assert expired.status_code == 410


def test_publish_records_usage_and_cross_survey_statistics(
    client: TestClient,
    register_user: Callable[..., object],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    single = create_question(client, single_content())
    text = create_question(client, text_content())
    number = create_question(client, number_content())

    first_survey = create_survey(client, "第一份问卷")
    first_draft = save_survey(
        client,
        first_survey,
        [linked_question("q-single", single, single["latest_version"])],
    )
    first_publish = publish_survey(client, first_draft)
    submit_answer(client, first_publish["short_code"], {"q-single": "young"})

    second = create_version(
        client,
        single,
        single_content(
            "新版年龄段",
            options=[option("young", "18-30 岁新版"), option("middle", "31-50 岁")],
        ),
    )
    second_survey = create_survey(client, "第二份问卷")
    second_draft = save_survey(
        client,
        second_survey,
        [
            linked_question("q-single-v2", second, second["latest_version"]),
            linked_question("q-text", text, text["latest_version"]),
            linked_question("q-number", number, number["latest_version"]),
        ],
    )
    second_publish = publish_survey(client, second_draft)
    submit_answer(
        client,
        second_publish["short_code"],
        {"q-single-v2": "young", "q-text": "整体不错", "q-number": 28},
    )

    usage = client.get(f"{API}/question-library/questions/{single['id']}/usage").json()
    assert usage["total_surveys"] == 2
    assert {item["title"] for item in usage["surveys"]} == {"第一份问卷", "第二份问卷"}

    stats = client.get(f"{API}/question-library/questions/{single['id']}/statistics").json()
    assert stats["answered_count"] == 2
    assert stats["used_survey_count"] == 2
    young = next(item for item in stats["options"] if item["option_id"] == "young")
    removed = next(item for item in stats["options"] if item["option_id"] == "senior")
    assert young["label"] == "18-30 岁新版"
    assert young["count"] == 2
    assert removed["historical"] is True
    assert {item["version_number"] for item in stats["versions"]} == {1, 2}

    text_stats = client.get(f"{API}/question-library/questions/{text['id']}/statistics").json()
    assert text_stats["text_value_count"] == 1
    text_values = client.get(
        f"{API}/question-library/questions/{text['id']}/statistics/text-values"
    ).json()
    assert text_values["total"] == 1
    assert text_values["items"][0]["survey_title"] == "第二份问卷"
    assert text_values["items"][0]["value"] == "整体不错"

    number_stats = client.get(f"{API}/question-library/questions/{number['id']}/statistics").json()
    assert number_stats["numeric"]["average"] == 28

    third_survey = create_survey(client, "解除关联问卷")
    detached = linked_question(
        "q-detached",
        single,
        second["latest_version"],
        linked=False,
        content_overrides={"title": "本地改写"},
    )
    third_draft = save_survey(client, third_survey, [detached])
    third_publish = publish_survey(client, third_draft)
    submit_answer(client, third_publish["short_code"], {"q-detached": "young"})
    assert (
        client.get(f"{API}/question-library/questions/{single['id']}/usage").json()["total_surveys"]
        == 2
    )
    assert (
        mongo_database.question_usages.count_documents({"question_id": ObjectId(single["id"])}) == 2
    )


def test_survey_reference_validation_and_archived_link_rules(
    client: TestClient,
    register_user: Callable[..., object],
) -> None:
    assert register_user().status_code == 201
    question = create_question(client, single_content())
    survey = create_survey(client, "校验问卷")
    base_question = linked_question("q1", question, question["latest_version"])
    schema = {
        "schema_version": 1,
        "title": survey["title"],
        "description": "说明",
        "allow_anonymous": False,
        "allow_multiple_responses": False,
        "presentation": {"mode": "continuous"},
        "pages": [],
        "questions": [base_question],
    }

    mismatch = {**base_question, "title": "本地改写"}
    response = client.put(
        f"{API}/surveys/{survey['id']}/draft",
        json={"schema": {**schema, "questions": [mismatch]}, "revision": 1},
        headers=csrf_headers(client),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "QUESTION_REFERENCE_INVALID"

    duplicate = [
        base_question,
        {**base_question, "id": "q2"},
    ]
    response = client.put(
        f"{API}/surveys/{survey['id']}/draft",
        json={"schema": {**schema, "questions": duplicate}, "revision": 1},
        headers=csrf_headers(client),
    )
    assert response.status_code == 422
    assert response.json()["error"]["field_errors"]["q2"]

    client.post(
        f"{API}/question-library/questions/{question['id']}/archive",
        headers=csrf_headers(client),
    )
    archived_link = client.put(
        f"{API}/surveys/{survey['id']}/draft",
        json={"schema": schema, "revision": 1},
        headers=csrf_headers(client),
    )
    assert archived_link.status_code == 422
    assert archived_link.json()["error"]["code"] == "QUESTION_ARCHIVED"
