import hmac

from fastapi import Depends, Request

from app.core.errors import ApiError
from app.modules.identity.models import AuthContext
from app.modules.identity.security import hash_token
from app.modules.identity.service import IdentityService


def get_identity_service(request: Request) -> IdentityService:
    return request.app.state.identity_service


async def get_auth_context(
    request: Request,
    service: IdentityService = Depends(get_identity_service),
) -> AuthContext:
    session_token = request.cookies.get(service.settings.session_cookie_name)
    context = await service.resolve_session(session_token)
    if not context:
        raise ApiError(401, "AUTH_REQUIRED", "请先登录")
    return context


async def require_csrf(
    request: Request,
    context: AuthContext = Depends(get_auth_context),
    service: IdentityService = Depends(get_identity_service),
) -> AuthContext:
    header_token = request.headers.get("X-CSRF-Token", "")
    cookie_token = request.cookies.get(service.settings.csrf_cookie_name, "")
    valid_pair = bool(header_token and cookie_token) and hmac.compare_digest(
        header_token, cookie_token
    )
    valid_session = valid_pair and hmac.compare_digest(
        hash_token(header_token), context.session.csrf_token_hash
    )
    if not valid_session:
        raise ApiError(403, "CSRF_INVALID", "安全校验失败，请刷新页面后重试")
    return context
