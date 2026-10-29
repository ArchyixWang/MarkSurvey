import {
  BarChartOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { errorMessage } from '../features/auth/formErrors';
import {
  createLibraryQuestion,
  getShareInbox,
  listLibraryQuestions,
} from '../features/questionLibrary/api';
import { QuestionContentModal } from '../features/questionLibrary/components/QuestionContentModal';
import type {
  LibraryQuestionContent,
  LibraryQuestionSummary,
  ShareInboxItem,
} from '../features/questionLibrary/types';
import { ownerStatusLabel } from '../features/questionLibrary/utils';
import type { QuestionType } from '../features/surveys/types';
import { formatDateTime, questionTypeLabels } from '../features/surveys/utils';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './QuestionLibraryPage.module.css';

const { Text } = Typography;

type ArchiveFilter = 'active' | 'archived';

export function QuestionLibraryPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'mine' | 'inbox'>('mine');
  const [items, setItems] = useState<LibraryQuestionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [type, setType] = useState<QuestionType | 'all'>('all');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inboxItems, setInboxItems] = useState<ShareInboxItem[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxPageSize, setInboxPageSize] = useState(20);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (activeTab !== 'mine') {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listLibraryQuestions({
      page,
      page_size: pageSize,
      search: debouncedQuery,
      question_type: type === 'all' ? undefined : type,
      archived: archiveFilter === 'archived',
    })
      .then((response) => {
        if (active) {
          setItems(response.items);
          setTotal(response.total);
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
  }, [activeTab, archiveFilter, debouncedQuery, page, pageSize, refreshKey, type]);

  useEffect(() => {
    if (activeTab !== 'inbox') {
      return;
    }
    let active = true;
    setInboxLoading(true);
    setInboxError(null);
    getShareInbox(inboxPage, inboxPageSize)
      .then((response) => {
        if (active) {
          setInboxItems(response.items);
          setInboxTotal(response.total);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setInboxError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setInboxLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeTab, inboxPage, inboxPageSize, refreshKey]);

  const handleCreate = async (content: LibraryQuestionContent) => {
    setCreating(true);
    try {
      const created = await createLibraryQuestion(content);
      setCreateOpen(false);
      message.success('题目已创建');
      navigate(`/workspace/questions/${created.id}`);
    } catch (requestError) {
      message.error(errorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  const refresh = () => setRefreshKey((value) => value + 1);

  const myColumns: ColumnsType<LibraryQuestionSummary> = [
    {
      title: '题目',
      dataIndex: 'title',
      key: 'title',
      width: 300,
      render: (_, item) => (
        <div className={styles.titleCell}>
          <Button
            type="link"
            className={styles.titleLink}
            onClick={() => navigate(`/workspace/questions/${item.id}`)}
          >
            <Text strong ellipsis={{ tooltip: item.title }}>
              {item.title}
            </Text>
          </Button>
          {item.source && (
            <Text type="secondary" ellipsis={{ tooltip: item.source.question_title }} className={styles.meta}>
              {item.source.kind === 'derived' ? '派生自' : '复制自'} {item.source.question_title}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'question_type',
      key: 'type',
      width: 100,
      render: (value: QuestionType) => questionTypeLabels[value],
    },
    {
      title: '状态',
      dataIndex: 'archived',
      key: 'archived',
      width: 92,
      render: (archived: boolean) => (
        <Tag variant="filled" color={archived ? 'default' : 'green'}>
          {ownerStatusLabel(archived)}
        </Tag>
      ),
    },
    {
      title: '最新版本',
      dataIndex: 'latest_version_number',
      key: 'version',
      width: 94,
      render: (value: number) => `v${value}`,
    },
    {
      title: '使用问卷',
      dataIndex: 'usage_survey_count',
      key: 'usage',
      width: 92,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 138,
      fixed: 'right',
      render: (_, item) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => navigate(`/workspace/questions/${item.id}`)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BarChartOutlined />}
            onClick={() => navigate(`/workspace/questions/${item.id}/statistics`)}
          >
            统计
          </Button>
        </Space>
      ),
    },
  ];

  const inboxColumns: ColumnsType<ShareInboxItem> = [
    {
      title: '副本',
      dataIndex: 'local_question',
      key: 'local',
      ellipsis: true,
      render: (_, item) => (
        <div className={styles.titleCell}>
          <Text strong ellipsis={{ tooltip: item.local_question.title }}>
            {item.local_question.title}
          </Text>
          <Text type="secondary" className={styles.meta}>
            我的题库 · v{item.local_question.latest_version_number}
          </Text>
        </div>
      ),
    },
    {
      title: '来源题目',
      dataIndex: 'source_question_title',
      key: 'source',
      ellipsis: true,
      render: (value: string, item) => (
        <div className={styles.titleCell}>
          <Text ellipsis={{ tooltip: value }}>{value}</Text>
          <Text type="secondary" className={styles.meta}>
            来源 v{item.source_version_number}
          </Text>
        </div>
      ),
    },
    {
      title: '分享状态',
      key: 'share',
      width: 110,
      render: (_, item) => (
        <Tag variant="filled" color={item.source_share_active ? 'green' : 'default'}>
          {item.source_share_active ? '可用' : '已失效'}
        </Tag>
      ),
    },
    {
      title: '复制时间',
      dataIndex: 'imported_at',
      key: 'imported',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 92,
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          onClick={() => navigate(`/workspace/questions/${item.local_question.id}`)}
        >
          打开
        </Button>
      ),
    },
  ];

  return (
    <WorkspacePageFrame
      breadcrumbs={[{ title: '工作台' }, { title: '题目库' }]}
      kicker="QUESTION LIBRARY"
      title="题目库"
      actions={
        <>
          <Tooltip title="刷新列表">
            <Button icon={<ReloadOutlined />} aria-label="刷新列表" onClick={refresh} />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建题目
          </Button>
        </>
      }
    >
      <Tabs
        className={styles.tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'mine' | 'inbox')}
        items={[
          {
            key: 'mine',
            label: '我的题目',
            children: (
              <div className={styles.tabPanel}>
                <div className={styles.toolbar}>
                  <Input.Search
                    allowClear
                    value={query}
                    placeholder="搜索题目"
                    aria-label="搜索题目"
                    className={styles.search}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                  />
                  <Select<QuestionType | 'all'>
                    value={type}
                    aria-label="筛选题型"
                    className={styles.typeFilter}
                    options={[
                      { value: 'all', label: '全部题型' },
                      ...(Object.keys(questionTypeLabels) as QuestionType[]).map((key) => ({
                        value: key,
                        label: questionTypeLabels[key],
                      })),
                    ]}
                    onChange={(value) => {
                      setType(value);
                      setPage(1);
                    }}
                  />
                  <Segmented<ArchiveFilter>
                    value={archiveFilter}
                    options={[
                      { value: 'active', label: '使用中' },
                      { value: 'archived', label: '已归档' },
                    ]}
                    onChange={(value) => {
                      setArchiveFilter(value);
                      setPage(1);
                    }}
                  />
                  <span className={styles.total}>共 {total} 道</span>
                </div>

                {error && (
                  <Alert
                    type="error"
                    showIcon
                    message={error}
                    action={<Button size="small" onClick={refresh}>重试</Button>}
                  />
                )}

                <div className={styles.tablePanel}>
                  <Table<LibraryQuestionSummary>
                    rowKey="id"
                    size="middle"
                    columns={myColumns}
                    dataSource={items}
                    loading={loading}
                    tableLayout="fixed"
                    scroll={{ x: 1060, y: 'calc(100dvh - 340px)' }}
                    pagination={{
                      current: page,
                      pageSize,
                      total,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: [10, 20, 50],
                      showTotal: (count) => `共 ${count} 条`,
                      placement: ['bottomEnd'],
                      onChange: (nextPage, nextPageSize) => {
                        setPage(nextPage);
                        setPageSize(nextPageSize);
                      },
                    }}
                    locale={{
                      emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无题目" />,
                    }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'inbox',
            label: (
              <Space size={6}>
                <ShareAltOutlined />
                共享区
              </Space>
            ),
            children: (
              <div className={styles.tabPanel}>
                {inboxError && (
                  <Alert
                    type="error"
                    showIcon
                    message={inboxError}
                    action={<Button size="small" onClick={refresh}>重试</Button>}
                  />
                )}
                <div className={styles.tablePanel}>
                  <Table<ShareInboxItem>
                    rowKey="id"
                    size="middle"
                    columns={inboxColumns}
                    dataSource={inboxItems}
                    loading={inboxLoading}
                    tableLayout="fixed"
                    scroll={{ x: 820, y: 'calc(100dvh - 340px)' }}
                    pagination={{
                      current: inboxPage,
                      pageSize: inboxPageSize,
                      total: inboxTotal,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: [10, 20, 50],
                      showTotal: (count) => `共 ${count} 条`,
                      placement: ['bottomEnd'],
                      onChange: (nextPage, nextPageSize) => {
                        setInboxPage(nextPage);
                        setInboxPageSize(nextPageSize);
                      },
                    }}
                    locale={{
                      emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无共享题目" />,
                    }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

      <QuestionContentModal
        open={createOpen}
        title="创建题目"
        okText="创建"
        submitting={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </WorkspacePageFrame>
  );
}

