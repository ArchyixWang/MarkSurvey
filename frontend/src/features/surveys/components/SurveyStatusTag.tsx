import { Tag } from 'antd';

import type { SurveyStatus } from '../types';

const statusMeta: Record<SurveyStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'blue' },
  published: { label: '已发布', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
  expired: { label: '已截止', color: 'orange' },
};

export function SurveyStatusTag({ status }: { status: SurveyStatus }) {
  const meta = statusMeta[status];
  return (
    <Tag variant="filled" color={meta.color}>
      {meta.label}
    </Tag>
  );
}
