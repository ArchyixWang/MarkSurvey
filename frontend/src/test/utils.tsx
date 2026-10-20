import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { AppRoutes } from '../app/AppRoutes';
import { AppProviders } from '../app/AppProviders';
import { AuthProvider } from '../features/auth/AuthProvider';
import type { AuthSession } from '../features/auth/types';

export const testSession: AuthSession = {
  user: {
    id: 'user-1',
    username: '演示用户',
    account: 'demo_user',
    email: 'demo@example.com',
    role: 'owner',
  },
  tenant: {
    id: 'tenant-1',
    name: '演示用户的工作空间',
  },
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
  retryAfter?: number,
): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfter !== undefined) {
    headers['Retry-After'] = String(retryAfter);
  }
  return new Response(
    JSON.stringify({ error: { code, message, field_errors: fieldErrors } }),
    { status, headers },
  );
}

export function requestPath(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost').pathname;
}

export function installFetchMock(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function renderWithProviders(ui: ReactElement) {
  return render(
    <AppProviders>
      <AuthProvider>{ui}</AuthProvider>
    </AppProviders>,
  );
}

export function renderApp(route = '/') {
  return render(
    <AppProviders>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </AppProviders>,
  );
}

export function anonymousSessionFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  return installFetchMock((input, init) => {
    if (requestPath(input) === '/api/v1/auth/session') {
      return Promise.resolve(errorResponse(401, 'AUTH_REQUIRED', '请先登录'));
    }
    return handler(input, init);
  });
}
