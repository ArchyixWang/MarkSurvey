import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { errorMessage } from '../../auth/formErrors';
import type { QuestionType } from '../../surveys/types';
import { formatDateTime, questionTypeLabels } from '../../surveys/utils';
import {
  getLibraryQuestion,
  listLibraryQuestionVersions,
  listLibraryQuestions,
} from '../api';
import type {
  LibraryQuestionDetail,
  LibraryQuestionSummary,
  LibraryVersion,
} from '../types';
import styles from './LibraryQuestionPicker.module.css';

const { Text } = Typography;

interface LibraryQuestionPickerProps {
  open: boolean;
  usedQuestionIds: string[];
  onClose: () => void;
  onInsert: (question: LibraryQuestionDetail, version: LibraryVersion) => void;
}

export function LibraryQuestionPicker({
  open,
  usedQuestionIds,
  onClose,
  onInsert,
}: LibraryQuestionPickerProps) {
  const [items, setItems] = useState<LibraryQuestionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [type, setType] = useState<QuestionType | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<LibraryQuestionDetail | null>(null);
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [versionId, setVersionId] = useState<string>();
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
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
      archived: false,
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
  }, [debouncedQuery, open, page, pageSize, refreshKey, type]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setVersions([]);
      setVersionId(undefined);
      setQuery('');
      setDebouncedQuery('');
      setPage(1);
    }
  }, [open]);

  const chooseQuestion = async (item: LibraryQuestionSummary) => {
    setDetailLoadingId(item.id);
    try {
      const [detail, loadedVersions] = await Promise.all([
        getLibraryQuestion(item.id),
        listLibraryQuestionVersions(item.id),
      ]);
      setSelected(detail);
      setVersions(loadedVersions);
      setVersionId(detail.latest_version_id);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const used = new Set(usedQuestionIds);
  const columns: ColumnsType<LibraryQuestionSummary> = [
    {
      title: '题目',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (_, item) => (
        <div className={styles.titleCell}>
          <Text strong ellipsis={{ tooltip: item.title }}>
            {item.title}
          </Text>
          <Text type="secondary" className={styles.meta}>
            更新于 {formatDateTime(item.updated_at)}
          </Text>
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
      title: '版本',
      dataIndex: 'latest_version_number',
      key: 'version',
      width: 70,
      render: (value: number) => `v${value}`,
    },
    {
      title: '',
      key: 'action',
      width: 92,
      align: 'right',
      render: (_, item) => (
        <Button
          type="link"
          size="small"
          disabled={used.has(item.id)}
          loading={detailLoadingId === item.id}
          onClick={() => void chooseQuestion(item)}
        >
          {used.has(item.id) ? '已使用' : '选择'}
        </Button>
      ),
    },
  ];

  const selectedVersion = versions.find((version) => version.id === versionId);

  return (
    <Drawer
      open={open}
      title="从题库插入"
      size={760}
      onClose={onClose}
      destroyOnHidden
      className={styles.drawer}
    >
      <div className={styles.toolbar}>
        <Input.Search
          allowClear
          value={query}
          placeholder="搜索题目"
          aria-label="搜索题库"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <Select<QuestionType | 'all'>
          value={type}
          aria-label="筛选题型"
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
        <Button
          icon={<ReloadOutlined />}
          aria-label="刷新题库"
          onClick={() => setRefreshKey((value) => value + 1)}
        />
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => setRefreshKey((value) => value + 1)}>重试</Button>}
        />
      )}

      <div className={styles.tableWrap}>
        <Table<LibraryQuestionSummary>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={items}
          loading={loading}
          tableLayout="fixed"
          scroll={{ x: 560, y: 310 }}
          pagination={{
            current: page,
            pageSize,
            total,
            size: 'small',
            showQuickJumper: true,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无题目" />,
          }}
        />
      </div>

      {selected && (
        <section className={styles.selection}>
          <div className={styles.selectionTitle}>
            <Text strong ellipsis={{ tooltip: selected.title }}>
              {selected.title}
            </Text>
            <Tag variant="filled" color="blue">
              {questionTypeLabels[selected.question_type]}
            </Tag>
          </div>
          <Space.Compact className={styles.selectionActions}>
            <Select
              value={versionId}
              aria-label="选择题库版本"
              options={versions.map((version) => ({
                value: version.id,
                label: `v${version.version_number}`,
              }))}
              onChange={setVersionId}
            />
            <Button
              type="primary"
              icon={<CheckOutlined />}
              disabled={!selectedVersion}
              onClick={() => {
                if (selectedVersion) {
                  onInsert(selected, selectedVersion);
                }
              }}
            >
              插入
            </Button>
          </Space.Compact>
        </section>
      )}
    </Drawer>
  );
}

