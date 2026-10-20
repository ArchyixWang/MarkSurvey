from fastapi import APIRouter, Depends, Request, Response, status

from app.modules.identity.dependencies import (
    get_auth_context,
    get_identity_service,
    require_csrf,
)
from app.modules.identity.models import AuthContext
from app.modules.identity.schemas import (
    AuthSessionResponse,
    CaptchaChallengeResponse,
    CaptchaVerifyRequest,
    CaptchaVerifyResponse,
    EmailCodeRequest,
    EmailCodeResponse,
    EmailLoginRequest,
    PasswordLoginRequest,
    PasswordResetRequest,
    RegisterRequest,
)
from app.modules.identity.service import IdentityService, IssuedSession

router = APIRouter(prefix="/auth")


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookies(
    response: Response, issued: IssuedSession, service: IdentityService
) -> None:
    settings = service.settings
    max_age = settings.session_ttl_hours * 60 * 60
    response.set_cookie(
        key=settings.session_cookie_name,
        value=issued.session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=settings.csrf_cookie_name,
        value=issued.csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def _clear_session_cookies(response: Response, service: IdentityService) -> None:
    settings = service.settings
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        secure=settings.secure_cookies,
        samesite="lax",
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        path="/",
        secure=settings.secure_cookies,
        samesite="lax",
    )


@router.post(
    "/captcha-challenges",
    response_model=CaptchaChallengeResponse,
    summary="创建滑块挑战",
)
async def create_captcha_challenge(
    response: Response,
    service: IdentityService = Depends(get_identity_service),
) -> CaptchaChallengeResponse:
    response.headers["Cache-Control"] = "no-store"
    return await service.create_captcha_challenge()


@router.post(
    "/captcha-challenges/{challenge_id}/verify",
    response_model=CaptchaVerifyResponse,
    summary="验证滑块位置",
)
async def verify_captcha_challenge(
    challenge_id: str,
    payload: CaptchaVerifyRequest,
    service: IdentityService = Depends(get_identity_service),
) -> CaptchaVerifyResponse:
    return await service.verify_captcha(challenge_id, payload)


@router.post(
    "/email-codes",
    response_model=EmailCodeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="发送邮箱验证码",
)
async def request_email_code(
    payload: EmailCodeRequest,
    request: Request,
    service: IdentityService = Depends(get_identity_service),
) -> EmailCodeResponse:
    retry_after = await service.request_email_code(payload, _client_ip(request))
    return EmailCodeResponse(retry_after=retry_after)


@router.post(
    "/register",
    response_model=AuthSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="注册并建立会话",
)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    service: IdentityService = Depends(get_identity_service),
) -> AuthSessionResponse:
    issued = await service.register(payload, _client_ip(request))
    _set_session_cookies(response, issued, service)
    response.headers["Cache-Control"] = "no-store"
    return issued.auth


@router.post(
    "/login/password",
    response_model=AuthSessionResponse,
    summary="账号或邮箱密码登录",
)
async def login_with_password(
    payload: PasswordLoginRequest,
    request: Request,
    response: Response,
    service: IdentityService = Depends(get_identity_service),
) -> AuthSessionResponse:
    issued = await service.login_password(payload, _client_ip(request))
    _set_session_cookies(response, issued, service)
    response.headers["Cache-Control"] = "no-store"
    return issued.auth


@router.post(
    "/login/email",
    response_model=AuthSessionResponse,
    summary="邮箱验证码登录",
)
async def login_with_email_code(
    payload: EmailLoginRequest,
    response: Response,
    service: IdentityService = Depends(get_identity_service),
) -> AuthSessionResponse:
    issued = await service.login_email(payload)
    _set_session_cookies(response, issued, service)
    response.headers["Cache-Control"] = "no-store"
    return issued.auth


@router.post(
    "/password-reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="通过邮箱验证码重置密码",
)
async def reset_password(
    payload: PasswordResetRequest,
    service: IdentityService = Depends(get_identity_service),
) -> Response:
    await service.reset_password(payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/session", response_model=AuthSessionResponse, summary="读取当前会话")
async def get_session(
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    service: IdentityService = Depends(get_identity_service),
) -> AuthSessionResponse:
    response.headers["Cache-Control"] = "no-store"
    return service.to_auth_session(context)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="退出当前会话",
)
async def logout(
    context: AuthContext = Depends(require_csrf),
    service: IdentityService = Depends(get_identity_service),
) -> Response:
    await service.logout(context)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_session_cookies(response, service)
    return response
