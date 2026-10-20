import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NoReturn

from app.core.config import Settings
from app.core.errors import ApiError
from app.modules.identity.captcha import (
    IMAGE_HEIGHT,
    IMAGE_WIDTH,
    PIECE_SIZE,
    generate_captcha_image,
)
from app.modules.identity.email import EmailSender
from app.modules.identity.models import AuthContext, TenantRecord, UserRecord
from app.modules.identity.repository import DuplicateUserError, IdentityRepository
from app.modules.identity.schemas import (
    AuthSessionResponse,
    CaptchaChallengeResponse,
    CaptchaVerifyRequest,
    CaptchaVerifyResponse,
    EmailCodeRequest,
    EmailLoginRequest,
    PasswordLoginRequest,
    PasswordResetRequest,
    RegisterRequest,
    TenantResponse,
    UserResponse,
)
from app.modules.identity.security import (
    generate_code,
    generate_token,
    hash_code,
    hash_password,
    hash_token,
    normalize_account,
    normalize_email,
    utc_now,
    verify_hash,
    verify_password,
)

logger = logging.getLogger(__name__)

CAPTCHA_MAX_ATTEMPTS = 3
EMAIL_CODE_EMAIL_LIMIT = 5
EMAIL_CODE_IP_LIMIT = 20
EMAIL_CODE_RATE_WINDOW_SECONDS = 60 * 60
LOGIN_IDENTIFIER_LIMIT = 5
LOGIN_IP_LIMIT = 20
LOGIN_RATE_WINDOW_SECONDS = 15 * 60


@dataclass(frozen=True, slots=True)
class IssuedSession:
    auth: AuthSessionResponse
    session_token: str
    csrf_token: str


@dataclass(frozen=True, slots=True)
class RateLimitState:
    limit_id: str
    window_start: datetime
    expires_at: datetime


class IdentityService:
    def __init__(
        self,
        *,
        settings: Settings,
        repository: IdentityRepository,
        email_sender: EmailSender,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.email_sender = email_sender

    def _window(self, now: datetime, seconds: int) -> tuple[datetime, datetime]:
        timestamp = int(now.timestamp())
        start_timestamp = timestamp - (timestamp % seconds)
        start = datetime.fromtimestamp(start_timestamp, tz=UTC)
        return start, start + timedelta(seconds=seconds)

    def _rate_limit_state(
        self, *, action: str, scope: str, key: str, seconds: int, now: datetime
    ) -> RateLimitState:
        window_start, expires_at = self._window(now, seconds)
        identifier = f"{action}|{scope}|{key}|{int(window_start.timestamp())}"
        return RateLimitState(
            limit_id=hash_token(identifier),
            window_start=window_start,
            expires_at=expires_at,
        )

    @staticmethod
    def _retry_after_headers(expires_at: datetime, now: datetime) -> dict[str, str]:
        remaining = max(1, math.ceil((expires_at - now).total_seconds()))
        return {"Retry-After": str(remaining)}

    async def _raise_rate_limit(self, expires_at: datetime, now: datetime) -> None:
        headers = self._retry_after_headers(expires_at, now)
        raise ApiError(
            429,
            "RATE_LIMITED",
            f"操作过于频繁，请在 {headers['Retry-After']} 秒后重试",
            headers=headers,
        )

    async def _hit_limit(
        self,
        *,
        action: str,
        scope: str,
        key: str,
        limit: int,
        seconds: int,
        now: datetime,
    ) -> bool:
        state = self._rate_limit_state(
            action=action, scope=scope, key=key, seconds=seconds, now=now
        )
        count = await self.repository.hit_rate_limit(
            limit_id=state.limit_id,
            action=action,
            scope=scope,
            key=key,
            window_start=state.window_start,
            expires_at=state.expires_at,
            now=now,
        )
        if count > limit:
            await self._raise_rate_limit(state.expires_at, now)
        return count == limit

    async def _ensure_limit_available(
        self,
        *,
        action: str,
        scope: str,
        key: str,
        limit: int,
        seconds: int,
        now: datetime,
    ) -> RateLimitState:
        state = self._rate_limit_state(
            action=action, scope=scope, key=key, seconds=seconds, now=now
        )
        count = await self.repository.get_rate_limit_count(state.limit_id)
        if count >= limit:
            await self._raise_rate_limit(state.expires_at, now)
        return state

    async def create_captcha_challenge(self) -> CaptchaChallengeResponse:
        now = utc_now()
        image_pair = generate_captcha_image()
        expires_at = now + timedelta(seconds=self.settings.captcha_ttl_seconds)
        challenge_id = await self.repository.create_captcha_challenge(
            target_x=image_pair.target_x,
            tolerance=self.settings.captcha_tolerance_px,
            attempts_remaining=CAPTCHA_MAX_ATTEMPTS,
            expires_at=expires_at,
            now=now,
        )
        return CaptchaChallengeResponse(
            challenge_id=challenge_id,
            background_image=image_pair.background,
            piece_image=image_pair.piece,
            image_width=IMAGE_WIDTH,
            image_height=IMAGE_HEIGHT,
            piece_size=PIECE_SIZE,
            expires_in=self.settings.captcha_ttl_seconds,
        )

    async def verify_captcha(
        self, challenge_id: str, request: CaptchaVerifyRequest
    ) -> CaptchaVerifyResponse:
        now = utc_now()
        challenge = await self.repository.find_captcha_challenge(challenge_id)
        if not challenge or challenge.challenge_expires_at <= now:
            raise ApiError(400, "CAPTCHA_EXPIRED", "滑块验证已过期，请重试")
        if challenge.verification_token_hash:
            raise ApiError(409, "CAPTCHA_ALREADY_VERIFIED", "滑块验证已完成，请重新获取")
        if challenge.consumed_at or challenge.attempts_remaining <= 0:
            raise ApiError(400, "CAPTCHA_ATTEMPTS_EXHAUSTED", "滑块尝试次数已用完，请刷新")

        updated = await self.repository.decrement_captcha_attempt(challenge.id, now)
        if not updated:
            raise ApiError(400, "CAPTCHA_ATTEMPTS_EXHAUSTED", "滑块尝试次数已用完，请刷新")

        if abs(request.offset - updated.target_x) > updated.tolerance:
            raise ApiError(400, "CAPTCHA_POSITION_INVALID", "拼图未对齐，请重试")

        token = generate_token()
        token_expires_at = now + timedelta(seconds=self.settings.captcha_token_ttl_seconds)
        marked = await self.repository.mark_captcha_verified(
            challenge_id=challenge_id,
            token_hash=hash_token(token),
            token_expires_at=token_expires_at,
            now=now,
        )
        if not marked:
            raise ApiError(409, "CAPTCHA_ALREADY_VERIFIED", "滑块验证已完成，请重新获取")
        return CaptchaVerifyResponse(
            captcha_token=token,
            expires_in=self.settings.captcha_token_ttl_seconds,
        )

    async def _consume_captcha_token(self, token: str) -> None:
        consumed = await self.repository.consume_captcha_token(hash_token(token), utc_now())
        if not consumed:
            raise ApiError(400, "CAPTCHA_TOKEN_INVALID", "滑块验证无效或已过期，请重试")

    async def _verify_email_code(self, email: str, purpose: str, code: str) -> None:
        now = utc_now()
        record = await self.repository.find_active_email_code(email, purpose, now)
        if not record:
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")

        updated = await self.repository.decrement_email_code_attempt(record.id, now)
        if not updated:
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")

        expected = hash_code(self.settings.auth_secret.get_secret_value(), email, purpose, code)
        if not verify_hash(expected, updated.code_hash):
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")

        consumed = await self.repository.consume_email_code(updated.id, now)
        if not consumed:
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")

    async def request_email_code(self, request: EmailCodeRequest, client_ip: str) -> int:
        now = utc_now()
        email = normalize_email(str(request.email))
        await self._consume_captcha_token(request.captcha_token)

        latest = await self.repository.find_latest_email_code(email, request.purpose)
        if latest:
            available_at = latest.created_at + timedelta(
                seconds=self.settings.email_code_resend_seconds
            )
            if available_at > now:
                headers = self._retry_after_headers(available_at, now)
                raise ApiError(
                    429,
                    "EMAIL_CODE_COOLDOWN",
                    f"请在 {headers['Retry-After']} 秒后重新获取验证码",
                    headers=headers,
                )

        await self._hit_limit(
            action="email_code",
            scope="email",
            key=f"{email}:{request.purpose}",
            limit=EMAIL_CODE_EMAIL_LIMIT,
            seconds=EMAIL_CODE_RATE_WINDOW_SECONDS,
            now=now,
        )
        await self._hit_limit(
            action="email_code",
            scope="ip",
            key=client_ip,
            limit=EMAIL_CODE_IP_LIMIT,
            seconds=EMAIL_CODE_RATE_WINDOW_SECONDS,
            now=now,
        )

        should_send = request.purpose == "register"
        if request.purpose != "register":
            should_send = await self.repository.find_user_by_email(email) is not None

        code = generate_code()
        await self.repository.invalidate_email_codes(email, request.purpose, now)
        await self.repository.create_email_code(
            email=email,
            purpose=request.purpose,
            code_hash=hash_code(
                self.settings.auth_secret.get_secret_value(),
                email,
                request.purpose,
                code,
            ),
            expires_at=now + timedelta(minutes=self.settings.email_code_ttl_minutes),
            attempts_remaining=self.settings.email_code_max_attempts,
            now=now,
        )

        if should_send:
            try:
                await self.email_sender.send_verification_code(email, code, request.purpose)
            except Exception as exc:
                logger.exception("Failed to send verification email to %s", email)
                code_record = await self.repository.find_active_email_code(
                    email, request.purpose, now
                )
                if code_record:
                    await self.repository.consume_email_code(code_record.id, utc_now())
                raise ApiError(
                    502,
                    "EMAIL_SEND_FAILED",
                    "验证码邮件发送失败，请稍后重试",
                ) from exc

        return self.settings.email_code_resend_seconds

    async def register(self, request: RegisterRequest, client_ip: str) -> IssuedSession:
        del client_ip
        now = utc_now()
        account = normalize_account(request.account)
        email = normalize_email(str(request.email))
        conflicts = await self.repository.find_user_conflicts(account, email)
        if conflicts:
            self._raise_registration_conflict(conflicts)

        await self._verify_email_code(email, "register", request.email_code)

        tenant = await self.repository.create_tenant(f"{request.username}的工作空间", now)
        try:
            user = await self.repository.create_user(
                tenant_id=tenant.id,
                username=request.username,
                account=account,
                email=email,
                password_hash=hash_password(request.password),
                role="owner",
                now=now,
            )
        except DuplicateUserError as exc:
            await self.repository.delete_tenant(tenant.id)
            conflicts = {exc.field} if exc.field in {"account", "email"} else {"account", "email"}
            self._raise_registration_conflict(conflicts)

        return await self._issue_session(user=user, tenant=tenant)

    @staticmethod
    def _raise_registration_conflict(conflicts: set[str]) -> NoReturn:
        field_errors: dict[str, str] = {}
        if "account" in conflicts:
            field_errors["account"] = "该账号已被使用"
        if "email" in conflicts:
            field_errors["email"] = "该邮箱已被注册"
        raise ApiError(
            409,
            "REGISTRATION_CONFLICT",
            "账号或邮箱已被使用",
            field_errors=field_errors,
        )

    async def login_password(self, request: PasswordLoginRequest, client_ip: str) -> IssuedSession:
        now = utc_now()
        identifier = request.identifier.strip().lower()
        is_email = "@" in identifier
        await self._ensure_limit_available(
            action="login_failure",
            scope="identifier",
            key=identifier,
            limit=LOGIN_IDENTIFIER_LIMIT,
            seconds=LOGIN_RATE_WINDOW_SECONDS,
            now=now,
        )
        await self._ensure_limit_available(
            action="login_failure",
            scope="ip",
            key=client_ip,
            limit=LOGIN_IP_LIMIT,
            seconds=LOGIN_RATE_WINDOW_SECONDS,
            now=now,
        )
        await self._consume_captcha_token(request.captcha_token)

        user = await self.repository.find_user_by_login(identifier, is_email)
        valid = bool(user) and verify_password(request.password, user.password_hash)
        if not user or not valid:
            await self._hit_limit(
                action="login_failure",
                scope="identifier",
                key=identifier,
                limit=LOGIN_IDENTIFIER_LIMIT,
                seconds=LOGIN_RATE_WINDOW_SECONDS,
                now=now,
            )
            await self._hit_limit(
                action="login_failure",
                scope="ip",
                key=client_ip,
                limit=LOGIN_IP_LIMIT,
                seconds=LOGIN_RATE_WINDOW_SECONDS,
                now=now,
            )
            raise ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确")

        tenant = await self.repository.find_tenant(user.tenant_id)
        if not tenant:
            raise ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确")
        return await self._issue_session(user=user, tenant=tenant)

    async def login_email(self, request: EmailLoginRequest) -> IssuedSession:
        email = normalize_email(str(request.email))
        await self._verify_email_code(email, "email_login", request.email_code)
        user = await self.repository.find_user_by_email(email)
        if not user:
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")
        tenant = await self.repository.find_tenant(user.tenant_id)
        if not tenant:
            raise ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确")
        return await self._issue_session(user=user, tenant=tenant)

    async def reset_password(self, request: PasswordResetRequest) -> None:
        email = normalize_email(str(request.email))
        await self._verify_email_code(email, "password_reset", request.email_code)
        user = await self.repository.find_user_by_email(email)
        if not user:
            raise ApiError(400, "EMAIL_CODE_INVALID", "验证码无效或已过期")

        updated = await self.repository.update_user_password(
            user.id,
            user.tenant_id,
            hash_password(request.new_password),
            utc_now(),
        )
        if not updated:
            raise ApiError(500, "PASSWORD_RESET_FAILED", "密码重置失败，请稍后重试")
        await self.repository.delete_user_sessions(user.id, user.tenant_id)

    async def resolve_session(self, session_token: str | None) -> AuthContext | None:
        if not session_token:
            return None
        now = utc_now()
        session = await self.repository.find_session_by_token_hash(hash_token(session_token), now)
        if not session:
            return None

        user = await self.repository.find_user_in_tenant(session.user_id, session.tenant_id)
        tenant = await self.repository.find_tenant(session.tenant_id)
        if not user or not tenant:
            await self.repository.delete_session(session.id)
            return None
        return AuthContext(session=session, user=user, tenant=tenant)

    async def logout(self, context: AuthContext) -> None:
        await self.repository.delete_session(context.session.id)

    async def _issue_session(self, *, user: UserRecord, tenant: TenantRecord) -> IssuedSession:
        now = utc_now()
        expires_at = now + timedelta(hours=self.settings.session_ttl_hours)
        session_token = generate_token()
        csrf_token = generate_token()
        await self.repository.create_session(
            token_hash=hash_token(session_token),
            csrf_token_hash=hash_token(csrf_token),
            user_id=user.id,
            tenant_id=tenant.id,
            expires_at=expires_at,
            now=now,
        )
        return IssuedSession(
            auth=AuthSessionResponse(
                user=UserResponse(
                    id=user.id,
                    username=user.username,
                    account=user.account,
                    email=user.email,
                    role=user.role,
                ),
                tenant=TenantResponse(id=tenant.id, name=tenant.name),
            ),
            session_token=session_token,
            csrf_token=csrf_token,
        )

    @staticmethod
    def to_auth_session(context: AuthContext) -> AuthSessionResponse:
        return AuthSessionResponse(
            user=UserResponse(
                id=context.user.id,
                username=context.user.username,
                account=context.user.account,
                email=context.user.email,
                role=context.user.role,
            ),
            tenant=TenantResponse(id=context.tenant.id, name=context.tenant.name),
        )
