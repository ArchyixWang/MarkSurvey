import type { LibraryVersionOrigin } from './types';

export const versionOriginLabels: Record<LibraryVersionOrigin, string> = {
  initial: '初始版本',
  edited: '内容更新',
  restored: '恢复历史',
  shared_copy: '共享复制',
  derived_initial: '派生新题',
};

export function ownerStatusLabel(archived: boolean): string {
  return archived ? '已归档' : '使用中';
}

