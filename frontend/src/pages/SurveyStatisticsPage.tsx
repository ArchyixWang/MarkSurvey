import { ArrowLeftOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  Drawer,
  Empty,
  Progress,
  Result,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { errorMessage } from '../features/auth/formErrors';
import {
  getSurvey,
  getSurveyStatistics,
  getSurveyTextValues,
} from '../features/surveys/api';
import type {
  OptionStatistic,
  QuestionStatistic,
  SurveyDetail,
  SurveyStatistics,
  TextValue,
  TextValues,
} from '../features/surveys/types';
import {
  formatDateTime,
  formatPercent,
  questionTypeLabels,
} from '../features/surveys/utils';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './SurveyStatisticsPage.module.css';

const { Text } = Typography;

export function SurveyStatisticsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [statistics, setStatistics] = useState<SurveyStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [textQuestion, setTextQuestion] = useState<QuestionStatistic | null>(null);
  const [textValues, setTextValues] = useState<TextValues | null>(null);
  const [textPage, setTextPage] = useState(1);
  const [textPageSize, setTextPageSize] = useState(20);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedSurvey, loadedStatistics] = await Promise.all([
        getSurvey(id),
        getSurveyStatistics(id),
      ]);
      setSurvey(loadedSurvey);
      setStatistics(loadedStatistics);
    } catch (requestError) {
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTextValues = useCallback(
    async (questionId: string, page: number, pageSize: number) => {
      setTextLoading(true);
      setTextError(null);
      try {
        setTextValues(await getSurveyTextValues(id, questionId, page, pageSize));
      } catch (requestError) {
        setTextError(errorMessage(requestError));
      } finally {
        setTextLoading(false);
      }
    },
    [id],
  );

  const openTextValues = (question: QuestionStatistic) => {
    setTextQuestion(question);
    setTextPage(1);
    setTextValues(null);
    void loadTextValues(question.question_id, 1, textPageSize);
  };

  const optionColumns: ColumnsType<OptionStatistic> = [
    {
      title: '选项',
      dataIndex: 'label',
      key: 'label',
      ellipsis: true,
    },
    {
      title: '次数',
      dataIndex: 'count',
      key: 'count',
      width: 90,
      align: 'right',
    },
    {
      title: '占比',
      dataIndex: 'percentage',
      key: 'percentage',
      width: 220,
      render: (value: number) => (
        <div className={styles.percentage}>
          <Progress
            percent={Math.min(100, value)}
            size="small"
            showInfo={false}
            strokeColor={'var(--brand-primary)'}
          />
          <Text type="secondary">{formatPercent(value)}</Text>
        </div>
      ),
    },
  ];

  const textColumns: ColumnsType<TextValue> = [
    {
      title: '填写内容',
      dataIndex: 'value',
      key: 'value',
      ellipsis: true,
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 158,
      render: (value: string) => formatDateTime(value),
    },
  ];

  const renderQuestion = (question: QuestionStatistic) => (
    <section className={styles.questionSection} key={question.question_id}>
      <header className={styles.questionHeader}>
        <div className={styles.questionHeading}>
          <Tag variant="filled" color="blue">
            {questionTypeLabels[question.type]}
          </Tag>
          <Text strong className={styles.questionTitle}>
            {question.title}
          </Text>
        </div>
        <Text type="secondary" className={styles.answeredCount}>
          {question.answered_count} 人回答
        </Text>
      </header>

      {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
        <Table<OptionStatistic>
          rowKey="option_id"
          size="small"
          columns={optionColumns}
          dataSource={question.options}
          pagination={false}
          tableLayout="fixed"
        />
      )}

      {question.type === 'number' && question.numeric && (
        <div className={styles.numberMetrics}>
          <div>
            <span>平均值</span>
            <strong>{question.numeric.average ?? '—'}</strong>
          </div>
          <div>
            <span>最小值</span>
            <strong>{question.numeric.minimum ?? '—'}</strong>
          </div>
          <div>
            <span>最大值</span>
            <strong>{question.numeric.maximum ?? '—'}</strong>
          </div>
          <div>
            <span>回答数</span>
            <strong>{question.numeric.count}</strong>
          </div>
        </div>
      )}

      {question.type === 'text' && (
        <div className={styles.textSummary}>
          <Text type="secondary">文本答案 {question.text_value_count} 条</Text>
          <Button
            icon={<FileTextOutlined />}
            disabled={question.text_value_count === 0}
            onClick={() => openTextValues(question)}
          >
            查看文本答案
          </Button>
        </div>
      )}
    </section>
  );

  const errorCode = loadError instanceof Error && 'code' in loadError
    ? String(loadError.code)
    : null;

  return (
    <WorkspacePageFrame
      breadcrumbs={[
        { title: '工作台' },
        { title: '问卷管理', href: '/workspace/surveys' },
        { title: survey?.title ?? '统计' },
      ]}
      kicker="SURVEY ANALYTICS"
      title="问卷统计"
      actions={
        <Space size={8}>
          <Tooltip title="刷新统计">
            <Button icon={<ReloadOutlined />} aria-label="刷新统计" onClick={() => void load()} />
          </Tooltip>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/workspace/surveys/${id}/edit`)}
          >
            返回编辑
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div className={styles.centerState}>
          <Spin size="large" />
        </div>
      ) : loadError ? (
        <div className={styles.centerState}>
          <Result
            status={errorCode === 'SURVEY_NOT_PUBLISHED' ? 'info' : 'error'}
            title={errorCode === 'SURVEY_NOT_PUBLISHED' ? '问卷尚未发布' : '统计加载失败'}
            subTitle={errorMessage(loadError)}
            extra={
              <Space>
                <Button onClick={() => void load()}>重试</Button>
                <Button onClick={() => navigate(`/workspace/surveys/${id}/edit`)}>返回编辑</Button>
              </Space>
            }
          />
        </div>
      ) : statistics ? (
        <div className={styles.scrollArea}>
          <div className={styles.content}>
            <section className={styles.metrics} aria-label="统计摘要">
              <div>
                <span>已提交答卷</span>
                <strong>{statistics.submitted_responses}</strong>
              </div>
              <div>
                <span>去重参与人数</span>
                <strong>{statistics.unique_respondents}</strong>
              </div>
              <div>
                <span>在线版本</span>
                <strong>v{statistics.active_version_number}</strong>
              </div>
              <div>
                <span>题目数量</span>
                <strong>{statistics.questions.length}</strong>
              </div>
            </section>

            {statistics.questions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无题目" />
            ) : (
              <div className={styles.questionList}>
                {statistics.questions.map(renderQuestion)}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <Drawer
        open={Boolean(textQuestion)}
        title={textQuestion?.title ?? '文本答案'}
        size={640}
        onClose={() => setTextQuestion(null)}
        destroyOnHidden
        className={styles.textDrawer}
      >
        {textError && <Result status="error" title="文本答案加载失败" subTitle={textError} />}
        <Table<TextValue>
          rowKey={(record) => `${record.submitted_at}-${record.value}`}
          size="small"
          loading={textLoading}
          columns={textColumns}
          dataSource={textValues?.items ?? []}
          tableLayout="fixed"
          pagination={{
            current: textValues?.page ?? textPage,
            pageSize: textValues?.page_size ?? textPageSize,
            total: textValues?.total ?? 0,
            showQuickJumper: true,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            onChange: (nextPage, nextPageSize) => {
              setTextPage(nextPage);
              setTextPageSize(nextPageSize);
              if (textQuestion) {
                void loadTextValues(textQuestion.question_id, nextPage, nextPageSize);
              }
            },
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文本答案" />,
          }}
        />
      </Drawer>
    </WorkspacePageFrame>
  );
}
