import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  libraryInboxItem,
  libraryQuestionDetail,
  libraryShare,
  libraryStatistics,
  libraryTextStatistics,
  libraryTextValues,
  libraryUsage,
  libraryVersionOne,
  libraryVersionTwo,
  libraryVersionTwoDetail,
  sharedLibraryQuestion,
} from './questionLibraryFixtures';
import {
  anonymousSessionFetch,
  authenticatedSessionFetch,
  errorResponse,
  jsonResponse,
  renderApp,
  requestPath,
} from './utils';

function requestUrl(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return raw;
}

describe('question library pages', () => {
  beforeEach(() => {
    document.cookie = 'marksurvey_csrf=csrf-token; path=/';
  });

  it('filters my questions by archive state and shows shared imports', async () => {
    const fetchMock = authenticatedSessionFetch((input) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions') {
        return Promise.resolve(
          jsonResponse({ items: [libraryQuestionDetail], page: 1, page_size: 20, total: 1 }),
        );
      }
      if (path === '/api/v1/question-library/shares/inbox') {
        return Promise.resolve(
          jsonResponse({ items: [libraryInboxItem], page: 1, page_size: 20, total: 1 }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/questions');

    expect(await screen.findByRole('heading', { name: '题目库' })).toBeInTheDocument();
    expect(await screen.findByText('常用选择题')).toBeInTheDocument();
    await user.click(screen.getByText('已归档'));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('archived=true')),
      ).toBe(true);
    });

    await user.click(screen.getByRole('tab', { name: /共享区/ }));
    expect(await screen.findByText('复制后的题目')).toBeInTheDocument();
    expect(screen.getByText('同事的题目')).toBeInTheDocument();
  });

  it('creates a question from the library list', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail, 201));
      }
      if (path === '/api/v1/question-library/questions') {
        return Promise.resolve(
          jsonResponse({ items: [], page: 1, page_size: 20, total: 0 }),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail));
      }
      if (path === '/api/v1/question-library/questions/lib-1/versions') {
        return Promise.resolve(jsonResponse([libraryVersionOne]));
      }
      if (path === '/api/v1/question-library/questions/lib-1/shares') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (path === '/api/v1/question-library/questions/lib-1/usage') {
        return Promise.resolve(jsonResponse(libraryUsage));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/questions');

    await user.click(await screen.findByRole('button', { name: /创建题目/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('标题'), '团队常用题目');
    await user.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/question-library/questions' && init?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as {
        content: { title: string; required_by_default: boolean };
      };
      expect(body.content).toMatchObject({
        title: '团队常用题目',
        required_by_default: false,
      });
    });
    expect(await screen.findByRole('heading', { name: '常用选择题' })).toBeInTheDocument();
  });

  it('shows question usage and creates a share link', async () => {
    let shareCreated = false;
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions/lib-1') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail));
      }
      if (path === '/api/v1/question-library/questions/lib-1/versions') {
        return Promise.resolve(jsonResponse([libraryVersionOne]));
      }
      if (path === '/api/v1/question-library/questions/lib-1/shares' && init?.method === 'POST') {
        shareCreated = true;
        return Promise.resolve(
          jsonResponse(
            {
              share: libraryShare,
              token: 'shared-token',
              url: 'http://localhost/shared/questions/shared-token',
            },
            201,
          ),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1/shares') {
        return Promise.resolve(jsonResponse({ items: shareCreated ? [libraryShare] : [] }));
      }
      if (path === '/api/v1/question-library/questions/lib-1/usage') {
        return Promise.resolve(jsonResponse(libraryUsage));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/questions/lib-1');

    await user.click(await screen.findByRole('tab', { name: /使用问卷/ }));
    expect(await screen.findByText('满意度调查')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /分享/ }));
    await user.click(screen.getByRole('button', { name: /创建分享/ }));
    const shareDialog = await screen.findByRole('dialog');
    await user.click(within(shareDialog).getByRole('button', { name: /创\s*建/ }));

    expect(
      await screen.findByDisplayValue('http://localhost/shared/questions/shared-token'),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          requestPath(input) === '/api/v1/question-library/questions/lib-1/shares'
          && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('creates a new immutable question version', async () => {
    let versionCreated = false;
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions/lib-1/versions' && init?.method === 'POST') {
        versionCreated = true;
        return Promise.resolve(jsonResponse(libraryVersionTwoDetail, 201));
      }
      if (path === '/api/v1/question-library/questions/lib-1/versions') {
        return Promise.resolve(
          jsonResponse(versionCreated ? [libraryVersionTwo, libraryVersionOne] : [libraryVersionOne]),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1') {
        return Promise.resolve(
          jsonResponse(versionCreated ? libraryVersionTwoDetail : libraryQuestionDetail),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1/shares') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (path === '/api/v1/question-library/questions/lib-1/usage') {
        return Promise.resolve(jsonResponse(libraryUsage));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/questions/lib-1');

    await user.click(await screen.findByRole('button', { name: /保存新版本/ }));
    const dialog = await screen.findByRole('dialog');
    const titleInput = within(dialog).getByLabelText('标题');
    await user.clear(titleInput);
    await user.type(titleInput, '常用选择题 v2');
    await user.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/question-library/questions/lib-1/versions'
          && init?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as {
        base_version_number: number;
        content: { title: string };
      };
      expect(body.base_version_number).toBe(1);
      expect(body.content.title).toBe('常用选择题 v2');
    });
  });

  it('copies a shared question into the recipient library', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/shared/shared-token' && init?.method !== 'POST') {
        return Promise.resolve(jsonResponse(sharedLibraryQuestion));
      }
      if (
        path === '/api/v1/question-library/shared/shared-token/imports'
        && init?.method === 'POST'
      ) {
        return Promise.resolve(
          jsonResponse(
            { import_id: 'import-1', local_question: libraryQuestionDetail },
            201,
          ),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail));
      }
      if (path === '/api/v1/question-library/questions/lib-1/versions') {
        return Promise.resolve(jsonResponse([libraryVersionOne]));
      }
      if (path === '/api/v1/question-library/questions/lib-1/shares') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (path === '/api/v1/question-library/questions/lib-1/usage') {
        return Promise.resolve(jsonResponse(libraryUsage));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/shared/questions/shared-token');

    expect(await screen.findByRole('heading', { name: '常用选择题' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /复制到我的题库/ }));

    await waitFor(() => {
      const importCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/question-library/shared/shared-token/imports'
          && init?.method === 'POST',
      );
      expect(importCall).toBeDefined();
      expect(JSON.parse(String(importCall?.[1]?.body))).toEqual({ version_id: 'qver-2' });
    });
  });

  it('requires login before opening a shared question', async () => {
    anonymousSessionFetch(() => Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found')));
    renderApp('/shared/questions/shared-token');

    expect(await screen.findByRole('heading', { name: '回到你的工作空间' })).toBeInTheDocument();
  });

  it('renders cross-survey choice statistics and text answers', async () => {
    const choiceFetch = authenticatedSessionFetch((input) => {
      if (requestPath(input) === '/api/v1/question-library/questions/lib-1/statistics') {
        return Promise.resolve(jsonResponse(libraryStatistics));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const firstRender = renderApp('/workspace/questions/lib-1/statistics');

    expect(await screen.findByText('历史选项')).toBeInTheDocument();
    expect(screen.getByText('62.50%')).toBeInTheDocument();
    firstRender.unmount();
    choiceFetch.mockClear();

    authenticatedSessionFetch((input) => {
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions/lib-text/statistics') {
        return Promise.resolve(jsonResponse(libraryTextStatistics));
      }
      if (path === '/api/v1/question-library/questions/lib-text/statistics/text-values') {
        return Promise.resolve(jsonResponse(libraryTextValues));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/questions/lib-text/statistics');

    await user.click(await screen.findByRole('button', { name: /查看答案/ }));
    expect(await screen.findByText('整体体验很好')).toBeInTheDocument();
    expect(screen.getByText('问卷 v2 · 题目 v1')).toBeInTheDocument();
  });
});

