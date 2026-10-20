import logging
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from app.core.config import Settings

logger = logging.getLogger(__name__)


class EmailSender(Protocol):
    async def send_verification_code(self, email: str, code: str, purpose: str) -> None: ...


class ConsoleEmailSender:
    async def send_verification_code(self, email: str, code: str, purpose: str) -> None:
        logger.warning(
            "MarkSurvey development verification code for %s (%s): %s",
            email,
            purpose,
            code,
        )


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def send_verification_code(self, email: str, code: str, purpose: str) -> None:
        message = EmailMessage()
        message["From"] = self.settings.smtp_from
        message["To"] = email
        message["Subject"] = "MarkSurvey 邮箱验证码"
        message.set_content(
            f"你的 MarkSurvey 验证码是 {code}，10 分钟内有效。如果这不是你的操作，请忽略此邮件。"
        )

        kwargs: dict[str, object] = {
            "hostname": self.settings.smtp_host,
            "port": self.settings.smtp_port,
            "timeout": 15,
        }
        if self.settings.smtp_username:
            kwargs["username"] = self.settings.smtp_username
        if self.settings.smtp_password:
            kwargs["password"] = self.settings.smtp_password.get_secret_value()

        if self.settings.smtp_tls == "ssl":
            kwargs["use_tls"] = True
        elif self.settings.smtp_tls == "starttls":
            kwargs["start_tls"] = True

        await aiosmtplib.send(message, **kwargs)


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.email_backend == "smtp":
        return SmtpEmailSender(settings)
    return ConsoleEmailSender()
