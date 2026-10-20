import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.modules.identity.security import is_valid_account, is_valid_password

VerificationPurpose = Literal["register", "email_login", "password_reset"]


def _validate_username(value: str) -> str:
    value = value.strip()
    if not 2 <= len(value) <= 32:
        raise ValueError("用户名长度需为 2–32 个字符")
    if any(character.isspace() for character in value):
        raise ValueError("用户名不能包含空白字符")
    return value


def _validate_new_password(value: str) -> str:
    if not is_valid_password(value):
        raise ValueError("密码需为 8–64 位并同时包含字母和数字")
    return value


class RegisterRequest(BaseModel):
    username: str
    account: str
    email: EmailStr
    password: str
    password_confirm: str
    email_code: str = Field(pattern=r"^\d{6}$")

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return _validate_username(value)

    @field_validator("account")
    @classmethod
    def validate_account(cls, value: str) -> str:
        value = value.strip()
        if not is_valid_account(value):
            raise ValueError("账号需为 4–32 位字母、数字或下划线")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_new_password(value)

    @model_validator(mode="after")
    def passwords_match(self) -> "RegisterRequest":
        if self.password != self.password_confirm:
            raise ValueError("两次输入的密码不一致")
        return self


class PasswordLoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=64)
    captcha_token: str = Field(min_length=20, max_length=200)


class EmailLoginRequest(BaseModel):
    email: EmailStr
    email_code: str = Field(pattern=r"^\d{6}$")


class PasswordResetRequest(BaseModel):
    email: EmailStr
    email_code: str = Field(pattern=r"^\d{6}$")
    new_password: str
    password_confirm: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return _validate_new_password(value)

    @model_validator(mode="after")
    def passwords_match(self) -> "PasswordResetRequest":
        if self.new_password != self.password_confirm:
            raise ValueError("两次输入的密码不一致")
        return self


class EmailCodeRequest(BaseModel):
    email: EmailStr
    purpose: VerificationPurpose
    captcha_token: str = Field(min_length=20, max_length=200)


class CaptchaVerifyRequest(BaseModel):
    offset: int = Field(ge=0, le=1000)


class CaptchaChallengeResponse(BaseModel):
    challenge_id: str
    background_image: str
    piece_image: str
    image_width: int
    image_height: int
    piece_size: int
    expires_in: int


class CaptchaVerifyResponse(BaseModel):
    captcha_token: str
    expires_in: int


class EmailCodeResponse(BaseModel):
    retry_after: int


class UserResponse(BaseModel):
    id: str
    username: str
    account: str
    email: str
    role: str


class TenantResponse(BaseModel):
    id: str
    name: str


class AuthSessionResponse(BaseModel):
    user: UserResponse
    tenant: TenantResponse


def normalize_username_for_display(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
