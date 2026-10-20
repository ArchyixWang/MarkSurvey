const INTERNAL_PATH_PATTERN = /^\/(?!\/)[^\s]*$/;

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !INTERNAL_PATH_PATTERN.test(value) || value.includes('\\')) {
    return null;
  }
  return value;
}

export function loginPath(returnTo?: string): string {
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';
}

export function registerPath(returnTo?: string): string {
  return returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register';
}
