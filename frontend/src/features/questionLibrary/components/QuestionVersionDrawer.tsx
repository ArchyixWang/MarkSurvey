import { CheckOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Empty, List, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { errorMessage } from '../../auth/formErrors';
import { formatDateTime } from '../../surveys/utils';
import { listLibraryQuestionVersions } from '../api';
import type { LibraryVersion } from '../types';
import { versionOriginLabels } from '../utils';
import styles from './QuestionVersionDrawer.module.css';

const { Text } = Typography;

interface QuestionVersionDrawerProps {
  open: boolean;
  questionId: string | null;
  currentVersionId?: string;
  onClose: () => void;
  onApply: (version: LibraryVersion) => void;
}

export function QuestionVersionDrawer({
  open,
  questionId,
  currentVersionId,
  onClose,
  onApply,
}: QuestionVersionDrawerProps) {
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !questionId) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listLibraryQuestionVersions(questionId)
      .then((response) => {
        if (active) {
          setVersions(response);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, questionId]);

  return (
    <Drawer open={open} title="切换题库版本" size={560} onClose={onClose} destroyOnHidden>
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : (
        <List
          loading={loading}
          dataSource={versions}
          rowKey="id"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本" /> }}
          renderItem={(version) => (
            <List.Item
              actions={[
                <Button
                  key="apply"
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={version.id === currentVersionId}
                  onClick={() => onApply(version)}
                >
                  {version.id === currentVersionId ? '当前' : '使用'}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8} wrap>
                    <Text strong>v{version.version_number}</Text>
                    <Tag variant="filled" color={version.id === currentVersionId ? 'blue' : 'default'}>
                      {versionOriginLabels[version.origin_kind]}
                    </Tag>
                  </Space>
                }
                description={
                  <div className={styles.description}>
                    <Text type="secondary">{formatDateTime(version.created_at)}</Text>
                    <Text ellipsis={{ tooltip: version.content.title }}>{version.content.title}</Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}

