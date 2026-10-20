import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  anonymousSessionFetch,
  errorResponse,
  installFetchMock,
  jsonResponse,
  renderApp,
  requestPath,
  testSession,
} from './utils';

vi.mock('../features/auth/components/SliderCaptcha', () => ({
  SliderCaptcha: ({ onVerified }: { onVerified: (token: string) => void }) => (
    <button type="button" onClick={() => onVerified('verified-captcha-token')}>
      完成滑块
    </button>
  ),
}));

describe('authentication flows', () => {
  beforeEach(() => {
    document.cookie = 'marksurvey_csrf=csrf-token; path=/';
  });

  it('switches login tabs and gates password login on the slider token', async () => {
    const fetchMock = anonymousSessionFetch((input, init) => {
      if (requestPath(input) === '/api/v1/auth/login/password' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(testSession));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: '回到你的工作空间' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '邮箱验证码登录' }));
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完成滑块' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '密码登录' }));
    await user.type(await screen.findByLabelText('账号或邮箱'), 'demo_user');
    await user.type(screen.getByLabelText('密码'), 'Survey1234');
    const submitButton = screen.getByRole('button', { name: '进入工作台' });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '完成滑块' }));
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestPath(input) === '/api/v1/auth/login/password' && init?.method === 'POST',
    );
    expect(loginCall).toBeDefined();
    const body = JSON.parse(String(loginCall?.[1]?.body)) as { captcha_token: string };
    expect(body.captcha_token).toBe('verified-captcha-token');
  });

  it('validates password confirmation before registration', async () => {
    const fetchMock = anonymousSessionFetch(() =>
      Promise.resolve(errorResponse(500, 'UNEXPECTED', 'unexpected')),
    );
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText('用户名'), '测试用户');
    await user.type(screen.getByLabelText('账号'), 'test_user');
    await user.type(screen.getByLabelText('邮箱'), 'test@example.com');
    await user.type(screen.getByLabelText('密码'), 'Survey1234');
    await user.type(screen.getByLabelText('确认密码'), 'Survey9999');
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '创建并进入工作台' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => requestPath(input) === '/api/v1/auth/register' && init?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('maps duplicate registration field errors back to the form', async () => {
    anonymousSessionFetch((input, init) => {
      if (requestPath(input) === '/api/v1/auth/register' && init?.method === 'POST') {
        return Promise.resolve(
          errorResponse(409, 'REGISTRATION_CONFLICT', '账号或邮箱已被使用', {
            account: '该账号已被使用',
          }),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText('用户名'), '测试用户');
    await user.type(screen.getByLabelText('账号'), 'test_user');
    await user.type(screen.getByLabelText('邮箱'), 'test@example.com');
    await user.type(screen.getByLabelText('密码'), 'Survey1234');
    await user.type(screen.getByLabelText('确认密码'), 'Survey1234');
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '创建并进入工作台' }));

    expect(await screen.findByText('该账号已被使用')).toBeInTheDocument();
  });

  it('redirects unauthenticated workspace visits to login', async () => {
    anonymousSessionFetch(() => Promise.resolve(errorResponse(500, 'UNEXPECTED', 'unexpected')));
    renderApp('/workspace');

    expect(await screen.findByRole('heading', { name: '回到你的工作空间' })).toBeInTheDocument();
  });

  it('logs out from the workspace with the CSRF header', async () => {
    const fetchMock = installFetchMock((input, init) => {
      const path = requestPath(input);
      if (path === '/api/v1/auth/session') {
        return Promise.resolve(jsonResponse(testSession));
      }
      if (path === '/api/v1/auth/logout' && init?.method === 'POST') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/workspace');

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(screen.getByText('暂无内容')).toBeInTheDocument();
    const userButton = screen.getByText('演示用户').closest('button');
    expect(userButton).not.toBeNull();
    await user.click(userButton as HTMLButtonElement);
    await user.click(await screen.findByText('退出登录'));
    await user.click(await screen.findByRole('button', { name: '确认退出' }));

    expect(await screen.findByRole('heading', { name: '回到你的工作空间' })).toBeInTheDocument();
    const logoutCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestPath(input) === '/api/v1/auth/logout' && init?.method === 'POST',
    );
    expect(logoutCall).toBeDefined();
    expect((logoutCall?.[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe(
      'csrf-token',
    );
  });

  it('starts the email-code countdown after the captcha is verified', async () => {
    const fetchMock = anonymousSessionFetch((input) => {
      if (requestPath(input) === '/api/v1/auth/email-codes') {
        return Promise.resolve(jsonResponse({ retry_after: 60 }, 202));
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText('邮箱'), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '完成滑块' }));

    expect(await screen.findByRole('button', { name: /秒后重发/ })).toBeDisabled();
    const emailCodeCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        requestPath(input) === '/api/v1/auth/email-codes' && init?.method === 'POST',
    );
    expect(emailCodeCall).toBeDefined();
    expect(JSON.parse(String(emailCodeCall?.[1]?.body))).toMatchObject({
      purpose: 'register',
      captcha_token: 'verified-captcha-token',
    });
  });

  it('uses Retry-After when an email-code request is rate limited', async () => {
    anonymousSessionFetch((input) => {
      if (requestPath(input) === '/api/v1/auth/email-codes') {
        return Promise.resolve(
          errorResponse(
            429,
            'EMAIL_CODE_COOLDOWN',
            '请在 42 秒后重新获取验证码',
            undefined,
            42,
          ),
        );
      }
      return Promise.resolve(errorResponse(404, 'NOT_FOUND', 'not found'));
    });
    const user = userEvent.setup();
    renderApp('/register');

    await user.type(await screen.findByLabelText('邮箱'), 'test@example.com');
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成滑块' }));

    const retryButton = await screen.findByRole('button', { name: /秒后重发/ });
    expect(retryButton).toBeDisabled();
    expect(retryButton).toHaveTextContent(/4[12] 秒后重发/);
  });
});
