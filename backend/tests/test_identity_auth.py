from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.database import Database

from app.modules.identity.security import hash_token


def test_registration_creates_tenant_owner_and_session(
    client: TestClient,
    register_user: Callable[..., object],
    mongo_database: Database,
) -> None:
    response = register_user()

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["user"]["username"] == "演示用户"
    assert payload["user"]["account"] == "demo_user"
    assert payload["user"]["email"] == "demo@example.com"
    assert payload["user"]["role"] == "owner"
    assert payload["tenant"]["name"] == "演示用户的工作空间"
    assert "token" not in response.text
    assert "password" not in response.text

    cookies = response.headers.get_list("set-cookie")
    session_cookie = next(cookie for cookie in cookies if cookie.startswith("marksurvey_session="))
    csrf_cookie = next(cookie for cookie in cookies if cookie.startswith("marksurvey_csrf="))
    assert "HttpOnly" in session_cookie
    assert "HttpOnly" not in csrf_cookie
    assert "SameSite=lax" in session_cookie

    tenant = mongo_database.tenants.find_one({"_id": ObjectId(payload["tenant"]["id"])})
    user = mongo_database.users.find_one({"_id": ObjectId(payload["user"]["id"])})
    assert tenant is not None and user is not None
    assert str(user["tenant_id"]) == payload["tenant"]["id"]
    assert user["password_hash"].startswith("$argon2id$")
    assert "Survey1234" not in user["password_hash"]

    session_response = client.get("/api/v1/auth/session")
    assert session_response.status_code == 200
    assert session_response.json() == payload


def test_duplicate_account_and_email_return_field_errors_without_orphan_tenant(
    client: TestClient,
    register_user: Callable[..., object],
    request_email_code: Callable[[str, str], str],
    mongo_database: Database,
) -> None:
    first_response = register_user()
    assert first_response.status_code == 201

    duplicate_account_code = request_email_code("other@example.com", "register")
    duplicate_account_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "另一个用户",
            "account": "DEMO_USER",
            "email": "other@example.com",
            "password": "Another1234",
            "password_confirm": "Another1234",
            "email_code": duplicate_account_code,
        },
    )
    assert duplicate_account_response.status_code == 409
    error = duplicate_account_response.json()["error"]
    assert "account" in error["field_errors"]

    duplicate_email_code = request_email_code("second@example.com", "register")
    duplicate_email_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "第三位用户",
            "account": "third_user",
            "email": "DEMO@EXAMPLE.COM",
            "password": "Another1234",
            "password_confirm": "Another1234",
            "email_code": duplicate_email_code,
        },
    )
    assert duplicate_email_response.status_code == 409
    assert "email" in duplicate_email_response.json()["error"]["field_errors"]

    assert mongo_database.tenants.count_documents({}) == 1
    assert mongo_database.users.count_documents({}) == 1


def test_password_login_accepts_account_or_email_case_insensitively(
    client: TestClient,
    register_user: Callable[..., object],
    solve_captcha: Callable[..., str],
) -> None:
    assert register_user().status_code == 201

    for identifier in ("DEMO_USER", "DEMO@EXAMPLE.COM"):
        client.cookies.clear()
        response = client.post(
            "/api/v1/auth/login/password",
            json={
                "identifier": identifier,
                "password": "Survey1234",
                "captcha_token": solve_captcha(),
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["user"]["account"] == "demo_user"


def test_email_code_login_does_not_repeat_captcha_and_code_is_single_use(
    client: TestClient,
    register_user: Callable[..., object],
    request_email_code: Callable[[str, str], str],
) -> None:
    assert register_user().status_code == 201
    client.cookies.clear()
    code = request_email_code("demo@example.com", "email_login")

    response = client.post(
        "/api/v1/auth/login/email",
        json={"email": "DEMO@EXAMPLE.COM", "email_code": code},
    )
    assert response.status_code == 200, response.text
    assert response.json()["tenant"]["name"] == "演示用户的工作空间"

    client.cookies.clear()
    replay_response = client.post(
        "/api/v1/auth/login/email",
        json={"email": "demo@example.com", "email_code": code},
    )
    assert replay_response.status_code == 400
    assert replay_response.json()["error"]["code"] == "EMAIL_CODE_INVALID"


def test_wrong_and_expired_email_codes_are_rejected(
    client: TestClient,
    register_user: Callable[..., object],
    request_email_code: Callable[[str, str], str],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    client.cookies.clear()
    code = request_email_code("demo@example.com", "email_login")
    wrong_code = "000000" if code != "000000" else "000001"

    wrong_response = client.post(
        "/api/v1/auth/login/email",
        json={"email": "demo@example.com", "email_code": wrong_code},
    )
    assert wrong_response.status_code == 400
    record = mongo_database.email_codes.find_one(
        {"email": "demo@example.com", "purpose": "email_login"}
    )
    assert record is not None
    assert record["attempts_remaining"] == 4

    mongo_database.email_codes.update_one(
        {"_id": record["_id"]},
        {"$set": {"expires_at": datetime.now(UTC) - timedelta(seconds=1)}},
    )
    expired_response = client.post(
        "/api/v1/auth/login/email",
        json={"email": "demo@example.com", "email_code": code},
    )
    assert expired_response.status_code == 400
    assert expired_response.json()["error"]["code"] == "EMAIL_CODE_INVALID"


def test_password_login_failures_are_rate_limited(
    client: TestClient,
    register_user: Callable[..., object],
    solve_captcha: Callable[..., str],
) -> None:
    assert register_user().status_code == 201
    client.cookies.clear()

    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login/password",
            json={
                "identifier": "demo_user",
                "password": "Wrong1234",
                "captcha_token": solve_captcha(),
            },
        )
        assert response.status_code == 401
        assert response.json()["error"] == {
            "code": "INVALID_CREDENTIALS",
            "message": "账号或密码不正确",
        }

    limited_response = client.post(
        "/api/v1/auth/login/password",
        json={
            "identifier": "demo_user",
            "password": "Survey1234",
            "captcha_token": solve_captcha(),
        },
    )
    assert limited_response.status_code == 429
    assert limited_response.json()["error"]["code"] == "RATE_LIMITED"
    assert int(limited_response.headers["Retry-After"]) > 0


def test_password_reset_revokes_all_sessions_and_allows_new_password(
    client: TestClient,
    register_user: Callable[..., object],
    request_email_code: Callable[[str, str], str],
    solve_captcha: Callable[..., str],
    mongo_database: Database,
) -> None:
    assert register_user().status_code == 201
    client.cookies.clear()
    login_response = client.post(
        "/api/v1/auth/login/password",
        json={
            "identifier": "demo@example.com",
            "password": "Survey1234",
            "captcha_token": solve_captcha(),
        },
    )
    assert login_response.status_code == 200
    assert mongo_database.sessions.count_documents({}) == 2

    reset_code = request_email_code("demo@example.com", "password_reset")
    reset_response = client.post(
        "/api/v1/auth/password-reset",
        json={
            "email": "demo@example.com",
            "email_code": reset_code,
            "new_password": "Changed5678",
            "password_confirm": "Changed5678",
        },
    )
    assert reset_response.status_code == 204
    assert "marksurvey_session=" not in reset_response.headers.get("set-cookie", "")
    assert mongo_database.sessions.count_documents({}) == 0
    assert client.get("/api/v1/auth/session").status_code == 401

    client.cookies.clear()
    old_login = client.post(
        "/api/v1/auth/login/password",
        json={
            "identifier": "demo_user",
            "password": "Survey1234",
            "captcha_token": solve_captcha(),
        },
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login/password",
        json={
            "identifier": "demo_user",
            "password": "Changed5678",
            "captcha_token": solve_captcha(),
        },
    )
    assert new_login.status_code == 200


def test_logout_requires_matching_csrf_and_clears_session(
    client: TestClient, register_user: Callable[..., object]
) -> None:
    assert register_user().status_code == 201
    csrf_cookie = client.cookies.get("marksurvey_csrf")
    assert csrf_cookie

    no_header_response = client.post("/api/v1/auth/logout")
    assert no_header_response.status_code == 403
    assert no_header_response.json()["error"]["code"] == "CSRF_INVALID"

    wrong_header_response = client.post(
        "/api/v1/auth/logout", headers={"X-CSRF-Token": "not-the-cookie"}
    )
    assert wrong_header_response.status_code == 403

    logout_response = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf_cookie})
    assert logout_response.status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401


def test_session_is_bound_to_its_user_and_tenant(
    client: TestClient,
    register_user: Callable[..., object],
    mongo_database: Database,
) -> None:
    first_response = register_user()
    assert first_response.status_code == 201
    first_payload = first_response.json()
    client.cookies.clear()

    second_response = register_user(
        username="第二用户",
        account="second_user",
        email="second@example.com",
        password="Second1234",
    )
    assert second_response.status_code == 201
    second_token = client.cookies.get("marksurvey_session")
    assert second_token

    mongo_database.sessions.update_one(
        {"token_hash": hash_token(second_token)},
        {"$set": {"tenant_id": ObjectId(first_payload["tenant"]["id"])}},
    )

    response = client.get("/api/v1/auth/session")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"
    assert mongo_database.sessions.count_documents({"token_hash": hash_token(second_token)}) == 0


def test_unconfirmed_password_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "测试用户",
            "account": "test_user",
            "email": "test@example.com",
            "password": "Survey1234",
            "password_confirm": "Survey9999",
            "email_code": "123456",
        },
    )

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert "field_errors" in body
