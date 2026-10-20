import type { FormInstance } from 'antd';

import { ApiError } from '../../shared/api/client';

export function applyServerFieldErrors(error: unknown, form: FormInstance): boolean {
  if (!(error instanceof ApiError) || Object.keys(error.fieldErrors).length === 0) {
    return false;
  }

  form.setFields(
    Object.entries(error.fieldErrors).map(([name, message]) => ({
      name,
      errors: [message],
    })),
  );
  return true;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}
