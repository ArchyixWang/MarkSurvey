import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  libraryQuestionDetail,
  libraryVersionOne,
  linkedLibraryVersion,
  linkedLibraryVersionTwo,
  linkedSurveyDetail,
} from './questionLibraryFixtures';
import {
  surveyDetail,
  surveyVersion,
  versionSummary,
} from './surveyFixtures';
import {
  authenticatedSessionFetch,
  errorResponse,
  jsonResponse,
  renderApp,
  requestPath,
} from './utils';

describe('question library in survey editor', () => {
  beforeEach(() => {
    document.cookie = 'marksurvey_csrf=csrf-token; path=/';
  });

  function surveyHandler(input: RequestInfo | URL, init?: RequestInit, detail = surveyDetail) {
    const path = requestPath(input);
    if (path === '/api/v1/surveys/s1' && init?.method !== 'PUT') {
      return Promise.resolve(jsonResponse(detail));
    }
    if (path === '/api/v1/surveys/s1/versions') {
      return Promise.resolve(jsonResponse([versionSummary]));
    }
    if (path === '/api/v1/surveys/s1/versions/v1') {
      return Promise.resolve(jsonResponse({ ...surveyVersion, schema: detail.draft_schema }));
    }
    return null;
  }

  it('inserts a selected library version with its default required setting', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const handled = surveyHandler(input, init);
      if (handled) {
        return handled;
      }
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1/draft' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(surveyDetail));
      }
      if (path === '/api/v1/question-library/questions') {
        return Promise.resolve(
          jsonResponse({ items: [libraryQuestionDetail], page: 1, page_size: 10, total: 1 }),
        );
      }
      if (path === '/api/v1/question-library/questions/lib-1') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail));
      }
      if (path === '/api/v1/question-library/questions/lib-1/versions') {
        return Promise.resolve(jsonResponse([libraryVersionOne]));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/edit');

    await screen.findByRole('heading', { name: '满意度调查' });
    await user.click(screen.getByRole('tab', { name: /题目/ }));
    await user.click(screen.getByRole('button', { name: /从题库插入/ }));
    const drawer = await screen.findByRole('dialog');
    await user.click(await within(drawer).findByRole('button', { name: /选\s*择/ }));
    await user.click(await within(drawer).findByRole('button', { name: /插\s*入/ }));

    expect(await screen.findByDisplayValue('常用选择题')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存草稿/ }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/surveys/s1/draft' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body)) as {
        schema: {
          questions: Array<{
            id: string;
            title: string;
            required: boolean;
            library_ref: { question_id: string; version_id: string; linked: boolean };
          }>;
        };
      };
      const inserted = body.schema.questions.find((question) => question.title === '常用选择题');
      expect(inserted).toBeDefined();
      expect(inserted?.id).not.toBe('lib-1');
      expect(inserted?.required).toBe(true);
      expect(inserted?.library_ref).toEqual({
        question_id: 'lib-1',
        version_id: 'qver-1',
        linked: true,
      });
    });
  });

  it('keeps linked content read-only until the user unlinks it', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const handled = surveyHandler(input, init, linkedSurveyDetail);
      if (handled) {
        return handled;
      }
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1/draft' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(linkedSurveyDetail));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/edit');

    await screen.findByRole('heading', { name: '满意度调查' });
    await user.click(screen.getByRole('tab', { name: /题目/ }));
    const titleInput = await screen.findByLabelText('题目标题');
    expect(titleInput).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /解除并编辑/ }));
    expect(titleInput).toBeEnabled();
    await user.clear(titleInput);
    await user.type(titleInput, '本地修改后的题目');
    await user.click(screen.getByRole('button', { name: /保存草稿/ }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/surveys/s1/draft' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body)) as {
        schema: {
          questions: Array<{
            id: string;
            title: string;
            library_ref: { linked: boolean; question_id: string };
          }>;
        };
      };
      expect(body.schema.questions[0]).toMatchObject({
        id: 'q1',
        title: '本地修改后的题目',
        library_ref: { linked: false, question_id: 'lib-linked' },
      });
    });
  });

  it('switches a linked question version and removes invalid jump rules', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const handled = surveyHandler(input, init, linkedSurveyDetail);
      if (handled) {
        return handled;
      }
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1/draft' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(linkedSurveyDetail));
      }
      if (path === '/api/v1/question-library/questions/lib-linked/versions') {
        return Promise.resolve(
          jsonResponse([linkedLibraryVersionTwo, linkedLibraryVersion]),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/edit');

    await screen.findByRole('heading', { name: '满意度调查' });
    await user.click(screen.getByRole('tab', { name: /题目/ }));
    await user.click(await screen.findByRole('button', { name: /切换版本/ }));
    await user.click(await screen.findByRole('button', { name: /使\s*用/ }));

    expect(await screen.findByDisplayValue('选择路径新版')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存草稿/ }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/surveys/s1/draft' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body)) as {
        schema: {
          questions: Array<{
            id: string;
            title: string;
            jump_rules: unknown[];
            library_ref: { version_id: string; linked: boolean };
          }>;
        };
      };
      expect(body.schema.questions[0]).toMatchObject({
        id: 'q1',
        title: '选择路径新版',
        jump_rules: [],
        library_ref: { version_id: 'linked-ver-2', linked: true },
      });
    });
  });

  it('saves an existing survey question to the library and links it immediately', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const handled = surveyHandler(input, init);
      if (handled) {
        return handled;
      }
      const path = requestPath(input);
      if (path === '/api/v1/question-library/questions' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(libraryQuestionDetail, 201));
      }
      if (path === '/api/v1/surveys/s1/draft' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse(surveyDetail));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/edit');

    await screen.findByRole('heading', { name: '满意度调查' });
    await user.click(screen.getByRole('tab', { name: /题目/ }));
    await user.click(await screen.findByRole('button', { name: /保存到题库/ }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/question-library/questions' && init?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as {
        content: {
          title: string;
          type: string;
          required_by_default: boolean;
          options: Array<{ id: string; label: string }>;
        };
      };
      expect(body.content).toMatchObject({
        title: '选择路径',
        type: 'single_choice',
        required_by_default: false,
      });
      expect(body.content.options).toHaveLength(2);
    });

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/surveys/s1/draft' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body)) as {
        schema: {
          questions: Array<{
            id: string;
            library_ref: { question_id: string; version_id: string; linked: boolean };
          }>;
        };
      };
      expect(body.schema.questions[0].library_ref).toEqual({
        question_id: 'lib-1',
        version_id: 'qver-1',
        linked: true,
      });
    });
  });
});
