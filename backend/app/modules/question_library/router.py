from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.identity.dependencies import get_auth_context, require_csrf
from app.modules.identity.models import AuthContext
from app.modules.question_library.schemas import (
    LibraryQuestionDetailResponse,
    LibraryQuestionListResponse,
    LibraryQuestionStatisticsResponse,
    LibraryTextValuesResponse,
    LibraryVersionResponse,
    QuestionCreateRequest,
    QuestionDeriveRequest,
    QuestionUsageResponse,
    ShareCreatedResponse,
    ShareCreateRequest,
    SharedImportResponse,
    SharedQuestionResponse,
    ShareImportRequest,
    ShareInboxResponse,
    ShareListResponse,
    ShareSummaryResponse,
    VersionCreateRequest,
    VersionRestoreRequest,
)
from app.modules.question_library.service import QuestionLibraryService

router = APIRouter(prefix="/question-library")


def get_question_library_service(request: Request) -> QuestionLibraryService:
    return request.app.state.question_library_service


@router.post(
    "/questions",
    response_model=LibraryQuestionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建题库题目",
)
async def create_question(
    payload: QuestionCreateRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.create_question(payload, context)


@router.get("/questions", response_model=LibraryQuestionListResponse, summary="列出题库题目")
async def list_questions(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=120)] = None,
    question_type: Annotated[
        Literal["single_choice", "multiple_choice", "text", "number"] | None,
        Query(),
    ] = None,
    archived: bool = False,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionListResponse:
    return await service.list_questions(
        context,
        page=page,
        page_size=page_size,
        search=search,
        question_type=question_type,
        archived=archived,
    )


@router.get(
    "/questions/{question_id}",
    response_model=LibraryQuestionDetailResponse,
    summary="读取题库题目",
)
async def get_question(
    question_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.get_question(question_id, context)


@router.post(
    "/questions/{question_id}/versions",
    response_model=LibraryQuestionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建题目版本",
)
async def create_version(
    question_id: str,
    payload: VersionCreateRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.create_version(question_id, payload, context)


@router.get(
    "/questions/{question_id}/versions",
    response_model=list[LibraryVersionResponse],
    summary="列出题目版本",
)
async def list_versions(
    question_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> list[LibraryVersionResponse]:
    return await service.list_versions(question_id, context)


@router.get(
    "/questions/{question_id}/versions/{version_id}",
    response_model=LibraryVersionResponse,
    summary="读取题目版本",
)
async def get_version(
    question_id: str,
    version_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryVersionResponse:
    return await service.get_version(question_id, version_id, context)


@router.post(
    "/questions/{question_id}/versions/{version_id}/restore",
    response_model=LibraryQuestionDetailResponse,
    summary="恢复题目版本",
)
async def restore_version(
    question_id: str,
    version_id: str,
    payload: VersionRestoreRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.restore_version(question_id, version_id, payload, context)


@router.post(
    "/questions/{question_id}/versions/{version_id}/derive",
    response_model=LibraryQuestionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="派生新题目",
)
async def derive_question(
    question_id: str,
    version_id: str,
    payload: QuestionDeriveRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.derive_question(question_id, version_id, payload, context)


@router.post(
    "/questions/{question_id}/archive",
    response_model=LibraryQuestionDetailResponse,
    summary="归档题目",
)
async def archive_question(
    question_id: str,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.archive_question(question_id, context)


@router.post(
    "/questions/{question_id}/unarchive",
    response_model=LibraryQuestionDetailResponse,
    summary="恢复归档题目",
)
async def unarchive_question(
    question_id: str,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionDetailResponse:
    return await service.unarchive_question(question_id, context)


@router.post(
    "/questions/{question_id}/shares",
    response_model=ShareCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建题目分享",
)
async def create_share(
    question_id: str,
    payload: ShareCreateRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> ShareCreatedResponse:
    return await service.create_share(question_id, payload, context)


@router.get(
    "/questions/{question_id}/shares",
    response_model=ShareListResponse,
    summary="列出题目分享",
)
async def list_shares(
    question_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> ShareListResponse:
    return await service.list_shares(question_id, context)


@router.post(
    "/questions/{question_id}/shares/{share_id}/revoke",
    response_model=ShareSummaryResponse,
    summary="撤销题目分享",
)
async def revoke_share(
    question_id: str,
    share_id: str,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> ShareSummaryResponse:
    return await service.revoke_share(question_id, share_id, context)


@router.get("/shares/inbox", response_model=ShareInboxResponse, summary="读取共享区")
async def share_inbox(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> ShareInboxResponse:
    return await service.share_inbox(context, page=page, page_size=page_size)


@router.get(
    "/shared/{token}",
    response_model=SharedQuestionResponse,
    summary="读取共享题目",
)
async def shared_question(
    token: str,
    _: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> SharedQuestionResponse:
    return await service.shared_question(token)


@router.post(
    "/shared/{token}/imports",
    response_model=SharedImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="复制共享题目",
)
async def import_shared_question(
    token: str,
    payload: ShareImportRequest,
    context: AuthContext = Depends(require_csrf),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> SharedImportResponse:
    return await service.import_shared_question(token, payload, context)


@router.get(
    "/questions/{question_id}/usage",
    response_model=QuestionUsageResponse,
    summary="读取题目使用情况",
)
async def question_usage(
    question_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> QuestionUsageResponse:
    return await service.question_usage(question_id, context)


@router.get(
    "/questions/{question_id}/statistics",
    response_model=LibraryQuestionStatisticsResponse,
    summary="读取题目跨问卷统计",
)
async def question_statistics(
    question_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryQuestionStatisticsResponse:
    return await service.statistics(question_id, context)


@router.get(
    "/questions/{question_id}/statistics/text-values",
    response_model=LibraryTextValuesResponse,
    summary="读取题目文本答案",
)
async def question_text_values(
    question_id: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    version_id: Annotated[str | None, Query()] = None,
    context: AuthContext = Depends(get_auth_context),
    service: QuestionLibraryService = Depends(get_question_library_service),
) -> LibraryTextValuesResponse:
    return await service.text_values(
        question_id,
        context,
        version_id=version_id,
        page=page,
        page_size=page_size,
    )
