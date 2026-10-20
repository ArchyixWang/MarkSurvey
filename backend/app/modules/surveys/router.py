from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.modules.identity.dependencies import get_auth_context, require_csrf
from app.modules.identity.models import AuthContext
from app.modules.surveys.schemas import (
    AttemptCreateRequest,
    AttemptResponse,
    AttemptSavedResponse,
    AttemptSaveRequest,
    AttemptSubmitRequest,
    PublicSurveyResponse,
    SubmissionResponse,
    SurveyCreateRequest,
    SurveyDeadlineRequest,
    SurveyDetailResponse,
    SurveyDraftUpdateRequest,
    SurveyListResponse,
    SurveyPublishRequest,
    SurveyStatisticsResponse,
    SurveyVersionResponse,
    SurveyVersionSummaryResponse,
    TextValuesResponse,
)
from app.modules.surveys.service import SurveyService

router = APIRouter(prefix="/surveys")
public_router = APIRouter(prefix="/public/surveys")


def get_survey_service(request: Request) -> SurveyService:
    return request.app.state.survey_service


@router.post(
    "",
    response_model=SurveyDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建问卷草稿",
)
async def create_survey(
    payload: SurveyCreateRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.create_survey(payload, context)


@router.get("", response_model=SurveyListResponse, summary="列出租户问卷")
async def list_surveys(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    query: Annotated[str | None, Query(max_length=120)] = None,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyListResponse:
    return await service.list_surveys(
        context,
        page=page,
        page_size=page_size,
        status=status_filter,
        query=query,
    )


@router.get("/{survey_id}", response_model=SurveyDetailResponse, summary="读取问卷")
async def get_survey(
    survey_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.get_survey(survey_id, context)


@router.put("/{survey_id}/draft", response_model=SurveyDetailResponse, summary="保存问卷草稿")
async def save_draft(
    survey_id: str,
    payload: SurveyDraftUpdateRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.save_draft(survey_id, payload, context)


@router.post(
    "/{survey_id}/publish",
    response_model=SurveyDetailResponse,
    summary="发布问卷版本",
)
async def publish_survey(
    survey_id: str,
    payload: SurveyPublishRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.publish_survey(survey_id, payload, context)


@router.post(
    "/{survey_id}/close",
    response_model=SurveyDetailResponse,
    summary="关闭问卷",
)
async def close_survey(
    survey_id: str,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.close_survey(survey_id, context)


@router.put(
    "/{survey_id}/deadline",
    response_model=SurveyDetailResponse,
    summary="设置问卷截止时间",
)
async def set_deadline(
    survey_id: str,
    payload: SurveyDeadlineRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.set_deadline(survey_id, payload.deadline_at, context)


@router.get(
    "/{survey_id}/versions",
    response_model=list[SurveyVersionSummaryResponse],
    summary="列出版本历史",
)
async def list_versions(
    survey_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> list[SurveyVersionSummaryResponse]:
    return await service.list_versions(survey_id, context)


@router.get(
    "/{survey_id}/versions/{version_id}",
    response_model=SurveyVersionResponse,
    summary="读取不可变版本快照",
)
async def get_version(
    survey_id: str,
    version_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyVersionResponse:
    return await service.get_version(survey_id, version_id, context)


@router.post(
    "/{survey_id}/versions/{version_id}/copy-to-draft",
    response_model=SurveyDetailResponse,
    summary="复制版本到草稿",
)
async def copy_version_to_draft(
    survey_id: str,
    version_id: str,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyDetailResponse:
    return await service.copy_version_to_draft(survey_id, version_id, context)


@router.get(
    "/{survey_id}/statistics",
    response_model=SurveyStatisticsResponse,
    summary="读取问卷统计",
)
async def get_statistics(
    survey_id: str,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> SurveyStatisticsResponse:
    return await service.statistics(survey_id, context)


@router.get(
    "/{survey_id}/statistics/questions/{question_id}/text-values",
    response_model=TextValuesResponse,
    summary="分页读取文本答案",
)
async def get_text_values(
    survey_id: str,
    question_id: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> TextValuesResponse:
    return await service.text_values(
        survey_id,
        question_id,
        context,
        page=page,
        page_size=page_size,
    )


@public_router.get(
    "/{short_code}",
    response_model=PublicSurveyResponse,
    summary="读取公开问卷链接状态",
)
async def get_public_survey(
    short_code: str,
    context: AuthContext = Depends(get_auth_context),
    service: SurveyService = Depends(get_survey_service),
) -> PublicSurveyResponse:
    return await service.get_public_survey(short_code, context)


@public_router.post(
    "/{short_code}/attempts",
    response_model=AttemptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建或恢复答卷草稿",
)
async def create_attempt(
    short_code: str,
    payload: AttemptCreateRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> AttemptResponse:
    return await service.create_attempt(short_code, payload, context)


@public_router.patch(
    "/{short_code}/attempts/{attempt_id}",
    response_model=AttemptSavedResponse,
    summary="自动保存答卷草稿",
)
async def save_attempt(
    short_code: str,
    attempt_id: str,
    payload: AttemptSaveRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> AttemptSavedResponse:
    return await service.save_attempt(short_code, attempt_id, payload, context)


@public_router.post(
    "/{short_code}/attempts/{attempt_id}/submit",
    response_model=SubmissionResponse,
    summary="提交答卷",
)
async def submit_attempt(
    short_code: str,
    attempt_id: str,
    payload: AttemptSubmitRequest,
    context: AuthContext = Depends(require_csrf),
    service: SurveyService = Depends(get_survey_service),
) -> SubmissionResponse:
    return await service.submit_attempt(short_code, attempt_id, payload, context)
