import { apiRequest } from '../../shared/api/client';
import type {
  AuthSession,
  CaptchaChallenge,
  CaptchaVerification,
  EmailCodePayload,
  EmailLoginPayload,
  PasswordLoginPayload,
  PasswordResetPayload,
  RegisterPayload,
} from './types';

export function getSession(signal?: AbortSignal): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/session', { signal });
}

export function createCaptchaChallenge(): Promise<CaptchaChallenge> {
  return apiRequest<CaptchaChallenge>('/auth/captcha-challenges', { method: 'POST' });
}

export function verifyCaptcha(
  challengeId: string,
  offset: number,
): Promise<CaptchaVerification> {
  return apiRequest<CaptchaVerification>(
    `/auth/captcha-challenges/${encodeURIComponent(challengeId)}/verify`,
    { method: 'POST', body: { offset } },
  );
}

export function requestEmailCode(payload: EmailCodePayload): Promise<{ retry_after: number }> {
  return apiRequest<{ retry_after: number }>('/auth/email-codes', {
    method: 'POST',
    body: payload,
  });
}

export function register(payload: RegisterPayload): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/register', { method: 'POST', body: payload });
}

export function loginWithPassword(payload: PasswordLoginPayload): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login/password', {
    method: 'POST',
    body: payload,
  });
}

export function loginWithEmailCode(payload: EmailLoginPayload): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login/email', {
    method: 'POST',
    body: payload,
  });
}

export function resetPassword(payload: PasswordResetPayload): Promise<void> {
  return apiRequest<void>('/auth/password-reset', { method: 'POST', body: payload });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
