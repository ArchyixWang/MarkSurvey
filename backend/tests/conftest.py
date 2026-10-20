from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import Settings
from app.main import create_app

TEST_DATABASE = "marksurvey_test"
TEST_SECRET = "test-only-secret-with-at-least-thirty-two-characters"


@dataclass
class SentEmail:
    email: str
    code: str
    purpose: str


@dataclass
class CapturingEmailSender:
    messages: list[SentEmail] = field(default_factory=list)
    fail_next: bool = False

    async def send_verification_code(self, email: str, code: str, purpose: str) -> None:
        if self.fail_next:
            self.fail_next = False
            raise RuntimeError("simulated SMTP outage")
        self.messages.append(SentEmail(email=email, code=code, purpose=purpose))

    def latest_code(self, email: str, purpose: str) -> str:
        for message in reversed(self.messages):
            if message.email == email.lower() and message.purpose == purpose:
                return message.code
        raise AssertionError(f"No {purpose} code sent to {email}")


@pytest.fixture(scope="session")
def mongo_client() -> Iterator[MongoClient]:
    client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=3000)
    client.admin.command("ping")
    yield client
    client.close()


@pytest.fixture(scope="session")
def mongo_database(mongo_client: MongoClient) -> Database:
    return mongo_client[TEST_DATABASE]


@pytest.fixture(scope="session")
def email_sender() -> CapturingEmailSender:
    return CapturingEmailSender()


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        mongodb_database=TEST_DATABASE,
        auth_secret=TEST_SECRET,
        cookie_secure=False,
        email_backend="console",
    )


@pytest.fixture(scope="session")
def client(
    mongo_client: MongoClient,
    test_settings: Settings,
    email_sender: CapturingEmailSender,
) -> Iterator[TestClient]:
    mongo_client.drop_database(TEST_DATABASE)
    application = create_app(test_settings, email_sender)
    with TestClient(application) as test_client:
        yield test_client
    mongo_client.drop_database(TEST_DATABASE)


@pytest.fixture(autouse=True)
def clean_state(
    client: TestClient,
    mongo_database: Database,
    email_sender: CapturingEmailSender,
) -> Iterator[None]:
    for collection_name in mongo_database.list_collection_names():
        mongo_database[collection_name].delete_many({})
    email_sender.messages.clear()
    email_sender.fail_next = False
    client.cookies.clear()
    yield


@pytest.fixture
def solve_captcha(client: TestClient, mongo_database: Database) -> Callable[..., str]:
    def solve(offset: int | None = None) -> str:
        challenge_response = client.post("/api/v1/auth/captcha-challenges")
        assert challenge_response.status_code == 200
        challenge = challenge_response.json()
        document = mongo_database.captcha_challenges.find_one(
            {"_id": ObjectId(challenge["challenge_id"])}
        )
        assert document is not None
        verification_response = client.post(
            f"/api/v1/auth/captcha-challenges/{challenge['challenge_id']}/verify",
            json={"offset": document["target_x"] if offset is None else offset},
        )
        assert verification_response.status_code == 200, verification_response.text
        return verification_response.json()["captcha_token"]

    return solve


@pytest.fixture
def request_email_code(
    client: TestClient,
    solve_captcha: Callable[..., str],
    email_sender: CapturingEmailSender,
) -> Callable[[str, str], str]:
    def request(email: str, purpose: str) -> str:
        response = client.post(
            "/api/v1/auth/email-codes",
            json={
                "email": email,
                "purpose": purpose,
                "captcha_token": solve_captcha(),
            },
        )
        assert response.status_code == 202, response.text
        return email_sender.latest_code(email, purpose)

    return request


@pytest.fixture
def register_user(
    client: TestClient, request_email_code: Callable[[str, str], str]
) -> Callable[..., object]:
    def register(
        *,
        username: str = "演示用户",
        account: str = "demo_user",
        email: str = "demo@example.com",
        password: str = "Survey1234",
    ) -> object:
        code = request_email_code(email, "register")
        return client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "account": account,
                "email": email,
                "password": password,
                "password_confirm": password,
                "email_code": code,
            },
        )

    return register
