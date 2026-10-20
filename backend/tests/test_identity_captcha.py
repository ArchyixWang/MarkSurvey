import base64
from collections.abc import Callable

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.database import Database

from tests.conftest import CapturingEmailSender


def test_captcha_images_are_server_generated_and_position_is_hidden(
    client: TestClient, mongo_database: Database
) -> None:
    response = client.post("/api/v1/auth/captcha-challenges")

    assert response.status_code == 200
    payload = response.json()
    assert payload["image_width"] == 320
    assert payload["image_height"] == 160
    assert payload["piece_size"] == 44
    assert "target_x" not in payload
    for field in ("background_image", "piece_image"):
        assert payload[field].startswith("data:image/png;base64,")
        image = base64.b64decode(payload[field].split(",", 1)[1])
        assert image.startswith(b"\x89PNG\r\n\x1a\n")

    challenge = mongo_database.captcha_challenges.find_one(
        {"_id": ObjectId(payload["challenge_id"])}
    )
    assert challenge is not None
    assert 0 < challenge["target_x"] < 320


def test_captcha_failure_consumes_attempt_and_success_is_single_use(
    client: TestClient, mongo_database: Database
) -> None:
    challenge_response = client.post("/api/v1/auth/captcha-challenges")
    challenge_id = challenge_response.json()["challenge_id"]
    document = mongo_database.captcha_challenges.find_one({"_id": ObjectId(challenge_id)})
    assert document is not None

    wrong_response = client.post(
        f"/api/v1/auth/captcha-challenges/{challenge_id}/verify",
        json={"offset": document["target_x"] + 20},
    )
    assert wrong_response.status_code == 400
    assert wrong_response.json()["error"]["code"] == "CAPTCHA_POSITION_INVALID"
    after_wrong = mongo_database.captcha_challenges.find_one({"_id": ObjectId(challenge_id)})
    assert after_wrong is not None
    assert after_wrong["attempts_remaining"] == 2

    success_response = client.post(
        f"/api/v1/auth/captcha-challenges/{challenge_id}/verify",
        json={"offset": document["target_x"]},
    )
    assert success_response.status_code == 200
    assert len(success_response.json()["captcha_token"]) >= 20

    replay_response = client.post(
        f"/api/v1/auth/captcha-challenges/{challenge_id}/verify",
        json={"offset": document["target_x"]},
    )
    assert replay_response.status_code == 409
    assert replay_response.json()["error"]["code"] == "CAPTCHA_ALREADY_VERIFIED"


def test_captcha_token_is_single_use(client: TestClient, solve_captcha: Callable[..., str]) -> None:
    token = solve_captcha()
    first_response = client.post(
        "/api/v1/auth/email-codes",
        json={
            "email": "captcha-once@example.com",
            "purpose": "register",
            "captcha_token": token,
        },
    )
    assert first_response.status_code == 202

    replay_response = client.post(
        "/api/v1/auth/email-codes",
        json={
            "email": "captcha-once@example.com",
            "purpose": "register",
            "captcha_token": token,
        },
    )
    assert replay_response.status_code == 400
    assert replay_response.json()["error"]["code"] == "CAPTCHA_TOKEN_INVALID"


def test_email_code_request_does_not_reveal_missing_account(
    client: TestClient,
    solve_captcha: Callable[..., str],
    email_sender: CapturingEmailSender,
) -> None:
    response = client.post(
        "/api/v1/auth/email-codes",
        json={
            "email": "missing@example.com",
            "purpose": "email_login",
            "captcha_token": solve_captcha(),
        },
    )

    assert response.status_code == 202
    assert response.json() == {"retry_after": 60}
    assert email_sender.messages == []


def test_email_code_request_sends_for_registration_and_enforces_cooldown(
    client: TestClient,
    solve_captcha: Callable[..., str],
    email_sender: CapturingEmailSender,
) -> None:
    payload = {
        "email": "cooldown@example.com",
        "purpose": "register",
        "captcha_token": solve_captcha(),
    }
    first_response = client.post("/api/v1/auth/email-codes", json=payload)
    assert first_response.status_code == 202
    assert email_sender.latest_code("cooldown@example.com", "register").isdigit()

    payload["captcha_token"] = solve_captcha()
    cooldown_response = client.post("/api/v1/auth/email-codes", json=payload)
    assert cooldown_response.status_code == 429
    assert cooldown_response.json()["error"]["code"] == "EMAIL_CODE_COOLDOWN"
    assert int(cooldown_response.headers["Retry-After"]) > 0


def test_email_send_failure_returns_service_error_without_code(
    client: TestClient,
    solve_captcha: Callable[..., str],
    email_sender: CapturingEmailSender,
) -> None:
    email_sender.fail_next = True
    response = client.post(
        "/api/v1/auth/email-codes",
        json={
            "email": "smtp-failure@example.com",
            "purpose": "register",
            "captcha_token": solve_captcha(),
        },
    )

    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "EMAIL_SEND_FAILED"
    assert "123456" not in error["message"]
