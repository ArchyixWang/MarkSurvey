from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        field_errors: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field_errors = field_errors or {}
        self.headers = headers or {}


def error_payload(
    code: str,
    message: str,
    field_errors: dict[str, str] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if field_errors:
        error["field_errors"] = field_errors
    return {"error": error}


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(exc.code, exc.message, exc.field_errors),
        headers=exc.headers,
    )


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors: dict[str, str] = {}
    for error in exc.errors():
        location = error.get("loc", ())
        field = next(
            (str(part) for part in reversed(location) if isinstance(part, str) and part != "body"),
            "request",
        )
        field_errors[field] = str(error.get("msg", "Invalid value"))

    return JSONResponse(
        status_code=422,
        content=error_payload("VALIDATION_ERROR", "请求参数不正确", field_errors),
    )


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "请求失败"
    return JSONResponse(
        status_code=exc.status_code,
        content=error_payload(f"HTTP_{exc.status_code}", message),
        headers=exc.headers,
    )
