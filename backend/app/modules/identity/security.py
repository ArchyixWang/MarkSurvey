import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime

from pwdlib import PasswordHash

_password_hash = PasswordHash.recommended()
_account_pattern = re.compile(r"^[A-Za-z0-9_]{4,32}$")
_letter_pattern = re.compile(r"[A-Za-z]")
_digit_pattern = re.compile(r"\d")


def utc_now() -> datetime:
    return datetime.now(UTC)


def normalize_email(value: str) -> str:
    return value.strip().lower()


def normalize_account(value: str) -> str:
    return value.strip().lower()


def is_valid_account(value: str) -> bool:
    return bool(_account_pattern.fullmatch(value))


def is_valid_password(value: str) -> bool:
    return (
        8 <= len(value) <= 64
        and bool(_letter_pattern.search(value))
        and bool(_digit_pattern.search(value))
    )


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(secret: str, email: str, purpose: str, code: str) -> str:
    payload = f"{email}:{purpose}:{code}".encode()
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def verify_hash(value: str, expected_hash: str) -> bool:
    return hmac.compare_digest(value, expected_hash)
