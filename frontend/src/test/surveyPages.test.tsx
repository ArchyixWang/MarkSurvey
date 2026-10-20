import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  anonymousSessionFetch,
  authenticatedSessionFetch,
  errorResponse,
  jsonResponse,
  renderApp,
  requestPath,
  testSession,
} from './utils';
import {
  publicSurvey,
  surveyDetail,
  surveyStatistics,
  surveyVersion,
  versionSummary,
} from './surveyFixtures';

vi.mock('../features/auth/components/SliderCaptcha', () => ({
  SliderCaptcha: ({ onVerified }: { onVerified: (token: string) => void }) => (
    <button type="button" onClick={() => onVerified('verified-captcha-token')}>
      完成滑块
    </button>
  ),
}));

describe('survey pages', () => {
  beforeEach(() => {
    document.cookie = 'marksurvey_csrf=csrf-token; path=/';
  });

  it('returns to the survey link after logging in from a protected fill page', async () => {
    const fetchMock = anonymousSessionFetch((input, init) => {
      if (requestPath(input) === '/api/v1/auth/login/password' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(testSession));
      }
      if (requestPath(input) === '/api/v1/public/surveys/Abc1234567') {
        return Promise.resolve(jsonResponse(publicSurvey));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/survey/Abc1234567');

    expect(await screen.findByRole('heading', { name: '回到你的工作空间' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('账号或邮箱'), 'demo_user');
    await user.type(screen.getByLabelText('密码'), 'Survey1234');
    await user.click(screen.getByRole('button', { name: '进入工作台' }));
    await user.click(await screen.findByRole('button', { name: '完成滑块' }));

    expect(await screen.findByRole('heading', { name: '满意度调查' })).toBeInTheDocument();
    expect(await screen.findByText('选择路径')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => requestPath(input) === '/api/v1/public/surveys/Abc1234567',
      ),
    ).toBe(true);
  });

  it('renders survey status, version and response count in the management table', async () => {
    authenticatedSessionFetch((input) => {
      if (requestPath(input) === '/api/v1/surveys') {
        return Promise.resolve(
          jsonResponse({
            items: [surveyDetail],
            page: 1,
            page_size: 20,
            total: 1,
          }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys');

    expect(await screen.findByRole('heading', { name: '问卷管理' })).toBeInTheDocument();
    expect(await screen.findByText('满意度调查')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('/survey/Abc1234567')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /创建问卷/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('问卷标题')).toBeInTheDocument();
    expect(screen.getByLabelText('问卷说明')).toBeInTheDocument();
  });

  it('jumps immediately after a single-choice answer and autosaves the new path', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      if (requestPath(input) === '/api/v1/public/surveys/Abc1234567' && init?.method !== 'PATCH') {
        return Promise.resolve(jsonResponse(publicSurvey));
      }
      if (
        requestPath(input) === '/api/v1/public/surveys/Abc1234567/attempts/attempt-1'
        && init?.method === 'PATCH'
      ) {
        return Promise.resolve(
          jsonResponse({ revision: 2, updated_at: '2026-10-20T09:01:00Z' }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/survey/Abc1234567');

    expect(await screen.findByText('隐藏题目')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '选项 A' }));

    await waitFor(() => {
      expect(screen.queryByText('隐藏题目')).not.toBeInTheDocument();
    });
    expect(screen.getByText('补充说明')).toBeInTheDocument();

    await waitFor(
      () => {
        const saveCall = fetchMock.mock.calls.find(
          ([input, init]) =>
            requestPath(input) === '/api/v1/public/surveys/Abc1234567/attempts/attempt-1'
            && init?.method === 'PATCH',
        );
        expect(saveCall).toBeDefined();
        const body = JSON.parse(String(saveCall?.[1]?.body)) as {
          revision: number;
          answers: Record<string, unknown>;
          current_question_id: string;
        };
        expect(body.revision).toBe(1);
        expect(body.answers.q1).toBe('a');
        expect(body.current_question_id).toBe('q3');
      },
      { timeout: 3000 },
    );
  });

  it('locks the type of a published question and saves stable IDs in the draft', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1' && init?.method !== 'PUT') {
        return Promise.resolve(jsonResponse(surveyDetail));
      }
      if (path === '/api/v1/surveys/s1/versions') {
        return Promise.resolve(jsonResponse([versionSummary]));
      }
      if (path === '/api/v1/surveys/s1/versions/v1') {
        return Promise.resolve(jsonResponse(surveyVersion));
      }
      if (path === '/api/v1/surveys/s1/draft' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as {
          schema: typeof surveyDetail.draft_schema;
        };
        return Promise.resolve(
          jsonResponse({
            ...surveyDetail,
            draft_schema: body.schema,
            draft_revision: 3,
            has_unpublished_changes: true,
          }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/edit');

    expect(await screen.findByRole('heading', { name: '满意度调查' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /题目/ }));
    const typeSelect = await screen.findByLabelText('题目类型');
    expect(typeSelect).toBeDisabled();

    const titleInput = screen.getByLabelText('题目标题');
    await user.clear(titleInput);
    await user.type(titleInput, '选择路径更新');
    await user.click(screen.getByRole('button', { name: /保存草稿/ }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([input, init]) =>
          requestPath(input) === '/api/v1/surveys/s1/draft' && init?.method === 'PUT',
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body)) as {
        revision: number;
        schema: { questions: Array<{ id: string; type: string; title: string }> };
      };
      expect(body.revision).toBe(2);
      expect(body.schema.questions[0]).toMatchObject({
        id: 'q1',
        type: 'single_choice',
        title: '选择路径更新',
      });
    });
  });

  it('adds a multiple-choice question with selection limits to the draft', async () => {
    const fetchMock = authenticatedSessionFetch((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1' && init?.method !== 'PUT') {
        return Promise.resolve(jsonResponse(surveyDetail));
      }
      if (path === '/api/v1/surveys/s1/versions') {
        return Promise.resolve(jsonResponse([versionSummary]));
      }
      if (path === '/api/v1/surveys/s1/versions/v1') {
        return Promise.resolve(jsonResponse(surveyVersion));
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
    await user.click(screen.getByRole('button', { name: /添加题目/ }));
    await user.click(await screen.findByText('多选题'));

    const titleInputs = screen.getAllByLabelText('题目标题');
    expect(titleInputs).toHaveLength(2);
    await user.clear(titleInputs[1]);
    await user.type(titleInputs[1], '水果偏好');
    await user.type(screen.getByLabelText('最少选择'), '2');
    await user.type(screen.getByLabelText('最多选择'), '3');
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
            type: string;
            title: string;
            min_selected?: number;
            max_selected?: number;
          }>;
        };
      };
      const addedQuestion = body.schema.questions.find(
        (question) => question.title === '水果偏好',
      );
      expect(addedQuestion).toMatchObject({
        type: 'multiple_choice',
        title: '水果偏好',
        min_selected: 2,
        max_selected: 3,
      });
    });
  });

  it('shows option statistics and paginated text answers', async () => {
    authenticatedSessionFetch((input) => {
      const path = requestPath(input);
      if (path === '/api/v1/surveys/s1') {
        return Promise.resolve(jsonResponse(surveyDetail));
      }
      if (path === '/api/v1/surveys/s1/statistics') {
        return Promise.resolve(jsonResponse(surveyStatistics));
      }
      if (
        path
        === '/api/v1/surveys/s1/statistics/questions/q3/text-values'
      ) {
        return Promise.resolve(
          jsonResponse({
            items: [
              { value: '整体体验很好', submitted_at: '2026-10-20T09:05:00Z' },
            ],
            page: 1,
            page_size: 20,
            total: 1,
          }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace/surveys/s1/statistics');

    expect(await screen.findByText('去重参与人数')).toBeInTheDocument();
    expect(screen.getByText('66.67%')).toBeInTheDocument();
    expect(screen.getByText('33.33%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /查看文本答案/ }));
    expect(await screen.findByText('整体体验很好')).toBeInTheDocument();
  });
});
