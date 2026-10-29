import { ArrowLeftOutlined, CopyOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Empty,
  Result,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { errorMessage } from '../features/auth/formErrors';
import {
  getSharedLibraryQuestion,
  importSharedLibraryQuestion,
} from '../features/questionLibrary/api';
import { QuestionContentPreview } from '../features/questionLibrary/components/QuestionContentPreview';
import type { SharedLibraryQuestion } from '../features/questionLibrary/types';
import { formatDateTime, questionTypeLabels } from '../features/surveys/utils';
import { ApiError } from '../shared/api/client';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './SharedQuestionPage.module.css';

const { Text } = Typography;

export function SharedQuestionPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [shared, setShared] = useState<SharedLibraryQuestion | null>(null);
  const [versionId, setVersionId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getSharedLibraryQuestion(token);
      setShared(response);
      setVersionId(response.versions[0]?.id);
    } catch (requestError) {
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const importQuestion = async () => {
    if (!versionId) {
      return;
    }
    setImporting(true);
    try {
      const imported = await importSharedLibraryQuestion(token, versionId);
      message.success('题目已复制到我的题库');
      navigate(`/workspace/questions/${imported.local_question.id}`);
    } catch (requestError) {
      message.error(errorMessage(requestError));
    } finally {
      setImporting(false);
    }
  };

  const version = shared?.versions.find((item) => item.id === versionId);
  const unavailable =
    loadError instanceof ApiError && loadError.code === 'QUESTION_SHARE_UNAVAILABLE';

  return (
    <WorkspacePageFrame
      breadcrumbs={[
        { title: '工作台' },
        { title: '题目库', href: '/workspace/questions' },
        { title: '共享题目' },
      ]}
      kicker="SHARED QUESTION"
      title={shared?.title ?? '共享题目'}
      actions={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace/questions')}>
          返回题库
        </Button>
      }
    >
      {loading ? (
        <div className={styles.centerState}>
          <Spin size="large" />
        </div>
      ) : loadError ? (
        <div className={styles.centerState}>
          <Result
            status={unavailable ? 'warning' : 'error'}
            title={unavailable ? '分享不可用' : '共享题目加载失败'}
            subTitle={errorMessage(loadError)}
            extra={
              <Space>
                <Button onClick={() => void load()}>重试</Button>
                <Button onClick={() => navigate('/workspace/questions')}>返回题库</Button>
              </Space>
            }
          />
        </div>
      ) : shared ? (
        <div className={styles.scrollArea}>
          <div className={styles.content}>
            <section className={styles.summary}>
              <div className={styles.summaryMain}>
                <Space size={8} wrap>
                  <Tag variant="filled" color="blue">
                    {questionTypeLabels[shared.question_type]}
                  </Tag>
                  <Text type="secondary">{shared.versions.length} 个版本</Text>
                </Space>
                <Text strong className={styles.title}>{shared.title}</Text>
                <Text type="secondary">
                  {shared.expires_at
                    ? `有效至 ${formatDateTime(shared.expires_at)}`
                    : '长期有效'}
                </Text>
              </div>
              <div className={styles.actions}>
                <Select
                  value={versionId}
                  aria-label="选择题目版本"
                  placeholder="选择版本"
                  options={shared.versions.map((item) => ({
                    value: item.id,
                    label: `v${item.version_number}`,
                  }))}
                  onChange={setVersionId}
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  loading={importing}
                  disabled={!version}
                  onClick={() => void importQuestion()}
                >
                  复制到我的题库
                </Button>
              </div>
            </section>

            <section className={styles.preview}>
              {version ? (
                <QuestionContentPreview content={version.content} />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本" />
              )}
            </section>
          </div>
        </div>
      ) : null}
    </WorkspacePageFrame>
  );
}

