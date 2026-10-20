import { apiRequest } from '../../shared/api/client';
import type {
  Attempt,
  AttemptSaved,
  PublicSurvey,
  Submission,
  SurveyCreatePayload,
  SurveyDetail,
  SurveyListResponse,
  SurveySchema,
  SurveyStatistics,
  SurveyStatus,
  SurveyVersion,
  SurveyVersionSummary,
  TextValues,
} from './types';

export interface SurveyListQuery {
  page: number;
  page_size: number;
  status?: SurveyStatus | 'all';
  query?: string;
}

export function createSurvey(payload: SurveyCreatePayload): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>('/surveys', { method: 'POST', body: payload });
}

export function listSurveys(query: SurveyListQuery): Promise<SurveyListResponse> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.page_size),
  });
  if (query.status && query.status !== 'all') {
    params.set('status', query.status);
  }
  if (query.query?.trim()) {
    params.set('query', query.query.trim());
  }
  return apiRequest<SurveyListResponse>(`/surveys?${params.toString()}`);
}

export function getSurvey(surveyId: string): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(`/surveys/${encodeURIComponent(surveyId)}`);
}

export function saveSurveyDraft(
  surveyId: string,
  schema: SurveySchema,
  revision: number,
): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(`/surveys/${encodeURIComponent(surveyId)}/draft`, {
    method: 'PUT',
    body: { schema, revision },
  });
}

export function publishSurvey(surveyId: string, revision: number): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(`/surveys/${encodeURIComponent(surveyId)}/publish`, {
    method: 'POST',
    body: { revision },
  });
}

export function closeSurvey(surveyId: string): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(`/surveys/${encodeURIComponent(surveyId)}/close`, {
    method: 'POST',
  });
}

export function setSurveyDeadline(
  surveyId: string,
  deadlineAt: string | null,
): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(`/surveys/${encodeURIComponent(surveyId)}/deadline`, {
    method: 'PUT',
    body: { deadline_at: deadlineAt },
  });
}

export function listSurveyVersions(surveyId: string): Promise<SurveyVersionSummary[]> {
  return apiRequest<SurveyVersionSummary[]>(
    `/surveys/${encodeURIComponent(surveyId)}/versions`,
  );
}

export function getSurveyVersion(surveyId: string, versionId: string): Promise<SurveyVersion> {
  return apiRequest<SurveyVersion>(
    `/surveys/${encodeURIComponent(surveyId)}/versions/${encodeURIComponent(versionId)}`,
  );
}

export function copyVersionToDraft(surveyId: string, versionId: string): Promise<SurveyDetail> {
  return apiRequest<SurveyDetail>(
    `/surveys/${encodeURIComponent(surveyId)}/versions/${encodeURIComponent(versionId)}/copy-to-draft`,
    { method: 'POST' },
  );
}

export function getSurveyStatistics(surveyId: string): Promise<SurveyStatistics> {
  return apiRequest<SurveyStatistics>(`/surveys/${encodeURIComponent(surveyId)}/statistics`);
}

export function getSurveyTextValues(
  surveyId: string,
  questionId: string,
  page: number,
  pageSize: number,
): Promise<TextValues> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return apiRequest<TextValues>(
    `/surveys/${encodeURIComponent(surveyId)}/statistics/questions/${encodeURIComponent(questionId)}/text-values?${params.toString()}`,
  );
}

export function getPublicSurvey(shortCode: string): Promise<PublicSurvey> {
  return apiRequest<PublicSurvey>(`/public/surveys/${encodeURIComponent(shortCode)}`);
}

export function createSurveyAttempt(shortCode: string, startNew: boolean): Promise<Attempt> {
  return apiRequest<Attempt>(`/public/surveys/${encodeURIComponent(shortCode)}/attempts`, {
    method: 'POST',
    body: { start_new: startNew },
  });
}

export function saveSurveyAttempt(
  shortCode: string,
  attemptId: string,
  revision: number,
  answers: Record<string, unknown>,
  currentQuestionId: string | null,
): Promise<AttemptSaved> {
  return apiRequest<AttemptSaved>(
    `/public/surveys/${encodeURIComponent(shortCode)}/attempts/${encodeURIComponent(attemptId)}`,
    {
      method: 'PATCH',
      body: { revision, answers, current_question_id: currentQuestionId },
    },
  );
}

export function submitSurveyAttempt(
  shortCode: string,
  attemptId: string,
  revision: number,
  answers: Record<string, unknown>,
  currentQuestionId: string | null,
): Promise<Submission> {
  return apiRequest<Submission>(
    `/public/surveys/${encodeURIComponent(shortCode)}/attempts/${encodeURIComponent(attemptId)}/submit`,
    {
      method: 'POST',
      body: { revision, answers, current_question_id: currentQuestionId },
    },
  );
}
