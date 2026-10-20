import {
  CopyOutlined,
  EditOutlined,
  EllipsisOutlined,
  PlusOutlined,
  ReloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createSurvey, listSurveys } from '../features/surveys/api';
import { SurveyStatusTag } from '../features/surveys/components/SurveyStatusTag';
import type {
  SurveyCreatePayload,
  SurveyStatus,
  SurveySummary,
} from '../features/surveys/types';
import { formatDateTime } from '../features/surveys/utils';
import { errorMessage } from '../features/auth/formErrors';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './SurveyListPage.module.css';

const { Text } = Typography;

type StatusFilter = SurveyStatus | 'all';

export function SurveyListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<SurveyCreatePayload>();
  const [items, setItems] = useState<SurveySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listSurveys({ page, page_size: pageSize, status, query })
      .then((response) => {
        if (!active) {
          return;
        }
        setItems(response.items);
        setTotal(response.total);
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
  }, [page, pageSize, query, refreshKey, status]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ title: '', description: '', allow_anonymous: false });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const survey = await createSurvey(values);
      setCreateOpen(false);
      message.success('问卷已创建');
      navigate(`/workspace/surveys/${survey.id}/edit`);
    } catch (requestError) {
      if (requestError instanceof Error) {
        message.error(errorMessage(requestError));
      }
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (survey: SurveySummary) => {
    const url = `${window.location.origin}/survey/${survey.short_code}`;
    try {
      await navigator.clipboard.writeText(url);
      message.success('链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const rowMenu = (survey: SurveySummary): MenuProps => ({
    items: [
      {
        key: 'copy',
        icon: <CopyOutlined />,
        label: '复制填写链接',
      },
    ],
    onClick: ({ key }) => {
      if (key === 'copy') {
        void copyLink(survey);
      }
    },
  });

  const columns: ColumnsType<SurveySummary> = [
    {
      title: '问卷',
      dataIndex: 'title',
      key: 'title',
      width: 300,
      ellipsis: true,
      render: (_, survey) => (
        <div className={styles.titleCell}>
          <Text strong ellipsis={{ tooltip: survey.title }}>
            {survey.title}
          </Text>
          <Text type="secondary" className={styles.shortCode}>
            /survey/{survey.short_code}
          </Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 112,
      render: (value: SurveyStatus, survey) => (
        <Space size={4} wrap>
          <SurveyStatusTag status={value} />
          {survey.has_unpublished_changes && <span className={styles.dirtyDot} aria-label="有未发布修改" />}
        </Space>
      ),
    },
    {
      title: '在线版本',
      dataIndex: 'active_version_number',
      key: 'version',
      width: 100,
      render: (value: number | null) => (value ? `v${value}` : '—'),
    },
    {
      title: '答卷',
      dataIndex: 'response_count',
      key: 'responses',
      width: 84,
      align: 'right',
    },
    {
      title: '截止时间',
      dataIndex: 'deadline_at',
      key: 'deadline',
      width: 158,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated',
      width: 158,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 158,
      fixed: 'right',
      render: (_, survey) => (
        <Space size={2}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/workspace/surveys/${survey.id}/edit`)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BarChartOutlined />}
            disabled={!survey.active_version_number}
            onClick={() => navigate(`/workspace/surveys/${survey.id}/statistics`)}
          >
            统计
          </Button>
          <Dropdown menu={rowMenu(survey)} trigger={['click']}>
            <Tooltip title="更多操作">
              <Button
                type="text"
                size="small"
                icon={<EllipsisOutlined />}
                aria-label="更多操作"
              />
            </Tooltip>
          </Dropdown>
        </Space>
      ),
    },
  ];

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 20);
  };

  return (
    <WorkspacePageFrame
      breadcrumbs={[{ title: '工作台' }, { title: '问卷管理' }]}
      kicker="SURVEYS"
      title="问卷管理"
      actions={
        <>
          <Tooltip title="刷新列表">
            <Button
              icon={<ReloadOutlined />}
              aria-label="刷新列表"
              onClick={() => setRefreshKey((value) => value + 1)}
            />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            创建问卷
          </Button>
        </>
      }
    >
      <div className={styles.toolbar}>
        <Input.Search
          allowClear
          placeholder="搜索标题或短码"
          aria-label="搜索问卷"
          className={styles.search}
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
        <Select<StatusFilter>
          value={status}
          className={styles.statusFilter}
          aria-label="筛选状态"
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'draft', label: '草稿' },
            { value: 'published', label: '已发布' },
            { value: 'closed', label: '已关闭' },
            { value: 'expired', label: '已截止' },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <span className={styles.total}>共 {total} 份</span>
      </div>

      {error && (
        <div className={styles.errorBar} role="alert">
          <Text>{error}</Text>
          <Button size="small" onClick={() => setRefreshKey((value) => value + 1)}>
            重试
          </Button>
        </div>
      )}

      <div className={styles.tablePanel}>
        <Table<SurveySummary>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          tableLayout="fixed"
          size="middle"
          scroll={{ x: 1080, y: 'calc(100dvh - 320px)' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (count) => `共 ${count} 条`,
            position: ['bottomRight'],
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无问卷" />,
          }}
          onChange={handleTableChange}
        />
      </div>

      <Modal
        open={createOpen}
        title="创建问卷"
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
          <Form.Item
            label="问卷标题"
            name="title"
            rules={[
              { required: true, message: '请输入问卷标题' },
              { max: 120, message: '标题最多 120 个字符' },
            ]}
          >
            <Input placeholder="问卷标题" maxLength={120} />
          </Form.Item>
          <Form.Item
            label="问卷说明"
            name="description"
            rules={[{ max: 2000, message: '说明最多 2000 个字符' }]}
          >
            <Input.TextArea rows={3} placeholder="问卷说明" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item label="允许匿名填写" name="allow_anonymous" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </WorkspacePageFrame>
  );
}
