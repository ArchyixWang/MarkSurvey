import { apiRequest } from '../../shared/api/client';
import type {
  CreatedLibraryShare,
  LibraryImport,
  LibraryQuestionContent,
  LibraryQuestionDetail,
  LibraryQuestionListQuery,
  LibraryQuestionListResponse,
  LibraryQuestionShare,
  LibraryQuestionStatistics,
  LibraryShareList,
  LibraryTextValues,
  LibraryVersion,
  QuestionUsage,
  SharedLibraryQuestion,
  ShareInboxResponse,
} from './types';

const BASE = '/question-library';

function questionPath(questionId: string): string {
  return `${BASE}/questions/${encodeURIComponent(questionId)}`;
}

export function createLibraryQuestion(
  content: LibraryQuestionContent,
): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(`${BASE}/questions`, {
    method: 'POST',
    body: { content },
  });
}

export function listLibraryQuestions(
  query: LibraryQuestionListQuery,
): Promise<LibraryQuestionListResponse> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.page_size),
    archived: String(Boolean(query.archived)),
  });
  if (query.search?.trim()) {
    params.set('search', query.search.trim());
  }
  if (query.question_type) {
    params.set('question_type', query.question_type);
  }
  return apiRequest<LibraryQuestionListResponse>(`${BASE}/questions?${params.toString()}`);
}

export function getLibraryQuestion(questionId: string): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(questionPath(questionId));
}

export function listLibraryQuestionVersions(
  questionId: string,
): Promise<LibraryVersion[]> {
  return apiRequest<LibraryVersion[]>(`${questionPath(questionId)}/versions`);
}

export function getLibraryQuestionVersion(
  questionId: string,
  versionId: string,
): Promise<LibraryVersion> {
  return apiRequest<LibraryVersion>(
    `${questionPath(questionId)}/versions/${encodeURIComponent(versionId)}`,
  );
}

export function createLibraryQuestionVersion(
  questionId: string,
  content: LibraryQuestionContent,
  baseVersionNumber: number,
): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(`${questionPath(questionId)}/versions`, {
    method: 'POST',
    body: { content, base_version_number: baseVersionNumber },
  });
}

export function restoreLibraryQuestionVersion(
  questionId: string,
  versionId: string,
  baseVersionNumber: number,
): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(
    `${questionPath(questionId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST', body: { base_version_number: baseVersionNumber } },
  );
}

export function deriveLibraryQuestion(
  questionId: string,
  versionId: string,
  content: LibraryQuestionContent,
): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(
    `${questionPath(questionId)}/versions/${encodeURIComponent(versionId)}/derive`,
    { method: 'POST', body: { content } },
  );
}

export function archiveLibraryQuestion(questionId: string): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(`${questionPath(questionId)}/archive`, {
    method: 'POST',
  });
}

export function unarchiveLibraryQuestion(questionId: string): Promise<LibraryQuestionDetail> {
  return apiRequest<LibraryQuestionDetail>(`${questionPath(questionId)}/unarchive`, {
    method: 'POST',
  });
}

export function createLibraryShare(
  questionId: string,
  expiresAt: string | null,
): Promise<CreatedLibraryShare> {
  return apiRequest<CreatedLibraryShare>(`${questionPath(questionId)}/shares`, {
    method: 'POST',
    body: { expires_at: expiresAt },
  });
}

export function listLibraryShares(questionId: string): Promise<LibraryShareList> {
  return apiRequest<LibraryShareList>(`${questionPath(questionId)}/shares`);
}

export function revokeLibraryShare(
  questionId: string,
  shareId: string,
): Promise<LibraryQuestionShare> {
  return apiRequest<LibraryQuestionShare>(
    `${questionPath(questionId)}/shares/${encodeURIComponent(shareId)}/revoke`,
    { method: 'POST' },
  );
}

export function getShareInbox(page: number, pageSize: number): Promise<ShareInboxResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return apiRequest<ShareInboxResponse>(`${BASE}/shares/inbox?${params.toString()}`);
}

export function getSharedLibraryQuestion(token: string): Promise<SharedLibraryQuestion> {
  return apiRequest<SharedLibraryQuestion>(
    `${BASE}/shared/${encodeURIComponent(token)}`,
  );
}

export function importSharedLibraryQuestion(
  token: string,
  versionId: string,
): Promise<LibraryImport> {
  return apiRequest<LibraryImport>(
    `${BASE}/shared/${encodeURIComponent(token)}/imports`,
    { method: 'POST', body: { version_id: versionId } },
  );
}

export function getLibraryQuestionUsage(questionId: string): Promise<QuestionUsage> {
  return apiRequest<QuestionUsage>(`${questionPath(questionId)}/usage`);
}

export function getLibraryQuestionStatistics(
  questionId: string,
): Promise<LibraryQuestionStatistics> {
  return apiRequest<LibraryQuestionStatistics>(`${questionPath(questionId)}/statistics`);
}

export function getLibraryQuestionTextValues(
  questionId: string,
  page: number,
  pageSize: number,
  versionId?: string,
): Promise<LibraryTextValues> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (versionId) {
    params.set('version_id', versionId);
  }
  return apiRequest<LibraryTextValues>(
    `${questionPath(questionId)}/statistics/text-values?${params.toString()}`,
  );
}

