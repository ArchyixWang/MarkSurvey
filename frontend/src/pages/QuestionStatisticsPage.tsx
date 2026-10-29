import {
  ArrowLeftOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Button,
  Drawer,
  Empty,
  Progress,
  Result,
  Select,
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
  getLibraryQuestionStatistics,
  getLibraryQuestionTextValues,
} from '../features/questionLibrary/api';
import type {
  LibraryOptionStatistic,
  LibraryQuestionStatistics,
  LibraryTextValue,
  LibraryTextValues,
  LibraryVersionStatistics,
} from '../features/questionLibrary/types';
import type { QuestionType } from '../features/surveys/types';
import { formatDateTime, formatPercent, questionTypeLabels } from '../features/surveys/utils';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './QuestionStatisticsPage.module.css';

const { Text } = Typography;

export function QuestionStatisticsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [statistics, setStatistics] = useState<LibraryQuestionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textValues, setTextValues] = useState<LibraryTextValues | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [textPage, setTextPage] = useState(1);
  const [textPageSize, setTextPageSize] = useState(20);
  const [textVersionId, setTextVersionId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStatistics(await getLibraryQuestionStatistics(id));
    } catch (requestError) {
      setLoadError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTextValues = async (page: number, pageSize: number, versionId?: string) => {
    setTextLoading(true);
    setTextError(null);
    try {
      setTextValues(await getLibraryQuestionTextValues(id, page, pageSize, versionId));
    } catch (requestError) {
      setTextError(errorMessage(requestError));
    } finally {
      setTextLoading(false);
    }
  };

  const openTextValues = () => {
    setTextOpen(true);
    setTextPage(1);
    setTextVersionId(undefined);
    void loadTextValues(1, textPageSize);
  };

  const optionColumns: ColumnsType<LibraryOptionStatistic> = [
    {
      title: '选项',
      dataIndex: 'label',
      key: 'label',
      ellipsis: true,
      render: (value: string, option) => (
        <Space size={6} wrap>
          <Text ellipsis={{ tooltip: value }}>{value}</Text>
          {option.historical && (
            <Tag variant="filled" color="default">历史选项</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '次数',
      dataIndex: 'count',
      key: 'count',
      width: 80,
      align: 'right',
    },
    {
      title: '占比',
      dataIndex: 'percentage',
      key: 'percentage',
      width: 230,
      render: (value: number) => (
        <div className={styles.percentage}>
          <Progress percent={Math.min(value, 100)} showInfo={false} size="small" />
          <Text type="secondary">{formatPercent(value)}</Text>
        </div>
      ),
    },
  ];

  const versionColumns: ColumnsType<LibraryVersionStatistics> = [
    {
      title: '版本',
      dataIndex: 'version_number',
      key: 'version',
      width: 86,
      render: (value: number) => `v${value}`,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '回答数',
      dataIndex: 'answered_count',
      key: 'answered',
      width: 90,
    },
    {
      title: '结果',
      key: 'result',
      width: 220,
      render: (_, version) => {
        if (version.numeric) {
          return (
            <Text type="secondary">
              均值 {version.numeric.average ?? '—'} · {version.numeric.minimum ?? '—'}–
              {version.numeric.maximum ?? '—'}
            </Text>
          );
        }
        if (version.text_value_count > 0) {
          return <Text type="secondary">文本 {version.text_value_count} 条</Text>;
        }
        return (
          <Text type="secondary">
            {version.options.reduce((total, option) => total + option.count, 0)} 次选择
          </Text>
        );
      },
    },
  ];

  const textColumns: ColumnsType<LibraryTextValue> = [
    {
      title: '答案',
      dataIndex: 'value',
      key: 'value',
      ellipsis: true,
      render: (value: string) => <Text ellipsis={{ tooltip: value }}>{value}</Text>,
    },
    {
      title: '问卷',
      dataIndex: 'survey_title',
      key: 'survey',
      width: 190,
      ellipsis: true,
      render: (value: string, item) => (
        <div className={styles.sourceCell}>
          <Text ellipsis={{ tooltip: value }}>{value}</Text>
          <Text type="secondary">
            问卷 v{item.survey_version_number} · 题目 v{item.question_version_number}
          </Text>
        </div>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
  ];

  return (
    <WorkspacePageFrame
      breadcrumbs={[
        { title: '工作台' },
        { title: '题目库', href: '/workspace/questions' },
        { title: statistics?.title ?? '跨问卷统计', href: `/workspace/questions/${id}` },
        { title: '统计' },
      ]}
      kicker="QUESTION ANALYTICS"
      title="跨问卷统计"
      actions={
        <Space size={8}>
          <Tooltip title="刷新统计">
            <Button icon={<ReloadOutlined />} aria-label="刷新统计" onClick={() => void load()} />
          </Tooltip>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/workspace/questions/${id}`)}
          >
            返回详情
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
            status="error"
            title="统计加载失败"
            subTitle={loadError}
            extra={
              <Space>
                <Button onClick={() => void load()}>重试</Button>
                <Button onClick={() => navigate(`/workspace/questions/${id}`)}>返回详情</Button>
              </Space>
            }
          />
        </div>
      ) : statistics ? (
        <div className={styles.scrollArea}>
          <div className={styles.content}>
            <section className={styles.metrics} aria-label="统计摘要">
              <div>
                <span>已回答</span>
                <strong>{statistics.answered_count}</strong>
              </div>
              <div>
                <span>使用问卷</span>
                <strong>{statistics.used_survey_count}</strong>
              </div>
              <div>
                <span>题目版本</span>
                <strong>{statistics.version_count}</strong>
              </div>
              <div>
                <span>题型</span>
                <strong className={styles.typeValue}>
                  {questionTypeLabels[statistics.question_type as QuestionType]}
                </strong>
              </div>
            </section>

            {(statistics.question_type === 'single_choice'
              || statistics.question_type === 'multiple_choice') && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Text strong>选项分布</Text>
                  <Text type="secondary">{statistics.answered_count} 份回答</Text>
                </div>
                <Table<LibraryOptionStatistic>
                  rowKey="option_id"
                  size="small"
                  columns={optionColumns}
                  dataSource={statistics.options}
                  pagination={false}
                  tableLayout="fixed"
                  scroll={{ x: 480 }}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无回答" />,
                  }}
                />
              </section>
            )}

            {statistics.question_type === 'number' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Text strong>数字结果</Text>
                  <Text type="secondary">{statistics.numeric?.count ?? 0} 份回答</Text>
                </div>
                <div className={styles.numberMetrics}>
                  <div>
                    <span>平均值</span>
                    <strong>{statistics.numeric?.average ?? '—'}</strong>
                  </div>
                  <div>
                    <span>最小值</span>
                    <strong>{statistics.numeric?.minimum ?? '—'}</strong>
                  </div>
                  <div>
                    <span>最大值</span>
                    <strong>{statistics.numeric?.maximum ?? '—'}</strong>
                  </div>
                </div>
              </section>
            )}

            {statistics.question_type === 'text' && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Text strong>文本答案</Text>
                  <Space size={12}>
                    <Text type="secondary">{statistics.text_value_count} 条</Text>
                    <Button
                      icon={<FileTextOutlined />}
                      disabled={statistics.text_value_count === 0}
                      onClick={openTextValues}
                    >
                      查看答案
                    </Button>
                  </Space>
                </div>
              </section>
            )}

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Text strong>逐版本结果</Text>
              </div>
              <Table<LibraryVersionStatistics>
                rowKey="version_id"
                size="small"
                columns={versionColumns}
                dataSource={statistics.versions}
                pagination={false}
                tableLayout="fixed"
                scroll={{ x: 620 }}
                locale={{
                  emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本数据" />,
                }}
              />
            </section>
          </div>
        </div>
      ) : null}

      <Drawer
        open={textOpen}
        title="文本答案"
        size={720}
        onClose={() => setTextOpen(false)}
        destroyOnHidden
        className={styles.textDrawer}
      >
        <div className={styles.drawerToolbar}>
          <Select
            allowClear
            value={textVersionId}
            placeholder="全部题目版本"
            aria-label="筛选题目版本"
            options={statistics?.versions.map((version) => ({
              value: version.version_id,
              label: `题目 v${version.version_number}`,
            }))}
            onChange={(value) => {
              setTextVersionId(value);
              setTextPage(1);
              void loadTextValues(1, textPageSize, value);
            }}
          />
        </div>
        {textError ? (
          <Result status="error" title="文本答案加载失败" subTitle={textError} />
        ) : (
          <Table<LibraryTextValue>
            rowKey={(item) => `${item.survey_id}-${item.question_version_number}-${item.submitted_at}-${item.value}`}
            size="small"
            loading={textLoading}
            columns={textColumns}
            dataSource={textValues?.items ?? []}
            tableLayout="fixed"
            scroll={{ x: 620 }}
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
                void loadTextValues(nextPage, nextPageSize, textVersionId);
              },
            }}
            locale={{
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文本答案" />,
            }}
          />
        )}
      </Drawer>
    </WorkspacePageFrame>
  );
}

