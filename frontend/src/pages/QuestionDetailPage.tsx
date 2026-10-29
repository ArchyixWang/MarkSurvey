import {
  ArrowLeftOutlined,
  BarChartOutlined,
  BranchesOutlined,
  CopyOutlined,
  EyeOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Modal,
  Result,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { errorMessage } from '../features/auth/formErrors';
import {
  archiveLibraryQuestion,
  createLibraryQuestionVersion,
  createLibraryShare,
  deriveLibraryQuestion,
  getLibraryQuestion,
  getLibraryQuestionUsage,
  listLibraryQuestionVersions,
  listLibraryShares,
  restoreLibraryQuestionVersion,
  revokeLibraryShare,
  unarchiveLibraryQuestion,
} from '../features/questionLibrary/api';
import { QuestionContentModal } from '../features/questionLibrary/components/QuestionContentModal';
import { QuestionContentPreview } from '../features/questionLibrary/components/QuestionContentPreview';
import type {
  CreatedLibraryShare,
  LibraryQuestionContent,
  LibraryQuestionDetail,
  LibraryQuestionShare,
  LibraryVersion,
  QuestionUsage,
  QuestionUsageSurvey,
} from '../features/questionLibrary/types';
import { versionOriginLabels } from '../features/questionLibrary/utils';
import { SurveyStatusTag } from '../features/surveys/components/SurveyStatusTag';
import { formatDateTime, questionTypeLabels } from '../features/surveys/utils';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './QuestionDetailPage.module.css';

const { Text } = Typography;

type ContentModalState =
  | { mode: 'version' }
  | { mode: 'derive'; sourceVersion: LibraryVersion }
  | null;

export function QuestionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [detail, setDetail] = useState<LibraryQuestionDetail | null>(null);
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [shares, setShares] = useState<LibraryQuestionShare[]>([]);
  const [usage, setUsage] = useState<QuestionUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contentModal, setContentModal] = useState<ContentModalState>(null);
  const [inspectedVersion, setInspectedVersion] = useState<LibraryVersion | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<Dayjs | null>(null);
  const [shareCreating, setShareCreating] = useState(false);
  const [createdShare, setCreatedShare] = useState<CreatedLibraryShare | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedDetail, loadedVersions, loadedShares, loadedUsage] = await Promise.all([
        getLibraryQuestion(id),
        listLibraryQuestionVersions(id),
        listLibraryShares(id),
        getLibraryQuestionUsage(id),
      ]);
      setDetail(loadedDetail);
      setVersions(loadedVersions);
      setShares(loadedShares.items);
      setUsage(loadedUsage);
    } catch (requestError) {
      setLoadError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAll = async () => {
    await load();
  };

  const submitContent = async (content: LibraryQuestionContent) => {
    if (!detail || !contentModal) {
      return;
    }
    setSubmitting(true);
    try {
      if (contentModal.mode === 'version') {
        setDetail(
          await createLibraryQuestionVersion(id, content, detail.latest_version_number),
        );
        message.success('新版本已保存');
      } else {
        const derived = await deriveLibraryQuestion(
          id,
          contentModal.sourceVersion.id,
          content,
        );
        message.success('新题目已创建');
        navigate(`/workspace/questions/${derived.id}`);
      }
      setContentModal(null);
      if (contentModal.mode === 'version') {
        setVersions(await listLibraryQuestionVersions(id));
      }
    } catch (requestError) {
      message.error(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const restoreVersion = (version: LibraryVersion) => {
    if (!detail) {
      return;
    }
    modal.confirm({
      title: `恢复 v${version.version_number}？`,
      content: '恢复会生成新的最新版本，已有版本和已发布问卷不受影响。',
      okText: '恢复',
      cancelText: '取消',
      onOk: async () => {
        try {
          setDetail(
            await restoreLibraryQuestionVersion(
              id,
              version.id,
              detail.latest_version_number,
            ),
          );
          setVersions(await listLibraryQuestionVersions(id));
          message.success('历史版本已恢复');
        } catch (requestError) {
          message.error(errorMessage(requestError));
        }
      },
    });
  };

  const toggleArchive = () => {
    if (!detail) {
      return;
    }
    if (!detail.archived) {
      modal.confirm({
        title: '归档题目？',
        content: '归档后该题目不能再插入新问卷，分享链接将失效。',
        okText: '归档',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            setDetail(await archiveLibraryQuestion(id));
            setShares(await listLibraryShares(id).then((result) => result.items));
            message.success('题目已归档');
          } catch (requestError) {
            message.error(errorMessage(requestError));
          }
        },
      });
      return;
    }
    void unarchiveLibraryQuestion(id)
      .then((updated) => {
        setDetail(updated);
        message.success('题目已恢复');
      })
      .catch((requestError: unknown) => message.error(errorMessage(requestError)));
  };

  const handleCreateShare = async () => {
    setShareCreating(true);
    try {
      const created = await createLibraryShare(
        id,
        shareExpiry ? shareExpiry.toISOString() : null,
      );
      setCreatedShare(created);
      setShareOpen(false);
      setShareExpiry(null);
      setShares(await listLibraryShares(id).then((result) => result.items));
    } catch (requestError) {
      message.error(errorMessage(requestError));
    } finally {
      setShareCreating(false);
    }
  };

  const revokeShare = (share: LibraryQuestionShare) => {
    modal.confirm({
      title: '撤销分享？',
      content: '撤销后该链接将不能继续访问。',
      okText: '撤销',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const updated = await revokeLibraryShare(id, share.id);
          setShares((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
          message.success('分享已撤销');
        } catch (requestError) {
          message.error(errorMessage(requestError));
        }
      },
    });
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const moreMenu: MenuProps = {
    items: [
      {
        key: 'derive',
        icon: <BranchesOutlined />,
        label: '派生新题',
        disabled: !detail || detail.archived,
      },
      { type: 'divider' },
      {
        key: 'archive',
        icon: detail?.archived ? <UndoOutlined /> : <StopOutlined />,
        label: detail?.archived ? '恢复题目' : '归档题目',
        danger: !detail?.archived,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'derive' && detail) {
        setContentModal({ mode: 'derive', sourceVersion: detail.latest_version });
      } else if (key === 'archive') {
        toggleArchive();
      }
    },
  };

  if (loading) {
    return (
      <WorkspacePageFrame
        breadcrumbs={[{ title: '工作台' }, { title: '题目库' }, { title: '题目详情' }]}
        kicker="QUESTION"
        title="题目详情"
      >
        <div className={styles.centerState}>
          <Spin size="large" />
        </div>
      </WorkspacePageFrame>
    );
  }

  if (!detail || loadError) {
    return (
      <WorkspacePageFrame
        breadcrumbs={[{ title: '工作台' }, { title: '题目库' }, { title: '题目详情' }]}
        kicker="QUESTION"
        title="题目详情"
      >
        <Result
          status="error"
          title="题目加载失败"
          subTitle={loadError ?? undefined}
          extra={
            <Space>
              <Button onClick={() => void load()}>重试</Button>
              <Button onClick={() => navigate('/workspace/questions')}>返回题库</Button>
            </Space>
          }
        />
      </WorkspacePageFrame>
    );
  }

  const usageColumns: ColumnsType<QuestionUsageSurvey> = [
    {
      title: '问卷',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (value: string, survey) => (
        <Button
          type="link"
          className={styles.linkButton}
          onClick={() => navigate(`/workspace/surveys/${survey.survey_id}/edit`)}
        >
          {value}
        </Button>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (_, survey) => <SurveyStatusTag status={survey.status} />,
    },
    {
      title: '使用版本',
      dataIndex: 'version_numbers',
      key: 'versions',
      width: 130,
      render: (values: number[]) => values.map((value) => `v${value}`).join(', '),
    },
    {
      title: '答卷',
      dataIndex: 'response_count',
      key: 'responses',
      width: 80,
    },
    {
      title: '最近使用',
      dataIndex: 'latest_used_at',
      key: 'usedAt',
      width: 150,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '',
      key: 'action',
      width: 92,
      render: (_, survey) => (
        <Button
          type="link"
          size="small"
          icon={<BarChartOutlined />}
          onClick={() => navigate(`/workspace/surveys/${survey.survey_id}/statistics`)}
        >
          统计
        </Button>
      ),
    },
  ];

  const shareColumns: ColumnsType<LibraryQuestionShare> = [
    {
      title: '分享',
      dataIndex: 'token_hint',
      key: 'hint',
      render: (value: string, share) => (
        <div className={styles.titleCell}>
          <Text strong>{value}</Text>
          <Text type="secondary" className={styles.meta}>
            创建于 {formatDateTime(share.created_at)}
          </Text>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 92,
      render: (_, share) => (
        <Tag variant="filled" color={share.active ? 'green' : 'default'}>
          {share.active ? '可用' : share.revoked_at ? '已撤销' : '已过期'}
        </Tag>
      ),
    },
    {
      title: '有效期',
      dataIndex: 'expires_at',
      key: 'expires',
      width: 160,
      render: (value: string | null) => (value ? formatDateTime(value) : '长期有效'),
    },
    {
      title: '',
      key: 'action',
      width: 92,
      render: (_, share) =>
        share.active ? (
          <Button type="link" size="small" danger onClick={() => revokeShare(share)}>
            撤销
          </Button>
        ) : null,
    },
  ];

  return (
    <WorkspacePageFrame
      breadcrumbs={[
        { title: '工作台' },
        { title: '题目库', href: '/workspace/questions' },
        { title: detail.title },
      ]}
      kicker="QUESTION"
      title={detail.title}
      actions={
        <Space size={8} wrap className={styles.pageActions}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace/questions')}>
            返回
          </Button>
          <Tooltip title="刷新题目">
            <Button icon={<ReloadOutlined />} aria-label="刷新题目" onClick={() => void refreshAll()} />
          </Tooltip>
          <Button
            icon={<BarChartOutlined />}
            onClick={() => navigate(`/workspace/questions/${id}/statistics`)}
          >
            跨问卷统计
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={detail.archived}
            onClick={() => setContentModal({ mode: 'version' })}
          >
            保存新版本
          </Button>
          <Dropdown menu={moreMenu} trigger={['click']} placement="bottomRight">
            <Button icon={<MoreOutlined />} aria-label="更多题目操作" />
          </Dropdown>
        </Space>
      }
    >
      <Tabs
        className={styles.pageTabs}
        defaultActiveKey="content"
        items={[
          {
            key: 'content',
            label: '题目内容',
            children: (
              <div className={styles.tabScroll}>
                <div className={styles.content}>
                  <section className={styles.metrics} aria-label="题目摘要">
                    <div>
                      <span>最新版本</span>
                      <strong>v{detail.latest_version_number}</strong>
                    </div>
                    <div>
                      <span>历史版本</span>
                      <strong>{detail.version_count}</strong>
                    </div>
                    <div>
                      <span>使用问卷</span>
                      <strong>{detail.usage_survey_count}</strong>
                    </div>
                    <div>
                      <span>状态</span>
                      <strong className={detail.archived ? styles.archivedText : undefined}>
                        {detail.archived ? '已归档' : '使用中'}
                      </strong>
                    </div>
                  </section>

                  <section className={styles.section}>
                    <QuestionContentPreview content={detail.latest_version.content} />
                  </section>

                  <section className={styles.section}>
                    <Descriptions size="small" column={2}>
                      <Descriptions.Item label="题型">
                        {questionTypeLabels[detail.question_type]}
                      </Descriptions.Item>
                      <Descriptions.Item label="默认必答">
                        {detail.required_by_default ? '是' : '否'}
                      </Descriptions.Item>
                      <Descriptions.Item label="创建时间">
                        {formatDateTime(detail.created_at)}
                      </Descriptions.Item>
                      <Descriptions.Item label="更新时间">
                        {formatDateTime(detail.updated_at)}
                      </Descriptions.Item>
                      <Descriptions.Item label="来源" span={2}>
                        {detail.source ? (
                          <Space size={6} wrap>
                            <Tag variant="filled" color="blue">
                              {detail.source.kind === 'derived' ? '派生' : '共享复制'}
                            </Tag>
                            <Button
                              type="link"
                              className={styles.linkButton}
                              onClick={() => navigate(`/workspace/questions/${detail.source?.question_id}`)}
                            >
                              {detail.source.question_title}
                            </Button>
                            <Text type="secondary">v{detail.source.version_number}</Text>
                          </Space>
                        ) : (
                          '无'
                        )}
                      </Descriptions.Item>
                    </Descriptions>
                  </section>
                </div>
              </div>
            ),
          },
          {
            key: 'versions',
            label: `版本 (${versions.length})`,
            children: (
              <div className={styles.tabScroll}>
                <div className={styles.content}>
                  <Timeline
                    items={versions.map((version) => ({
                      key: version.id,
                      color: version.id === detail.latest_version_id ? 'blue' : 'gray',
                      children: (
                        <div className={styles.versionItem}>
                          <div className={styles.versionHeader}>
                            <Space size={8} wrap>
                              <Text strong>v{version.version_number}</Text>
                              <Tag variant="filled" color={version.id === detail.latest_version_id ? 'blue' : 'default'}>
                                {versionOriginLabels[version.origin_kind]}
                              </Tag>
                              {version.id === detail.latest_version_id && (
                                <Tag variant="filled" color="green">最新</Tag>
                              )}
                            </Space>
                            <Space size={2} wrap>
                              <Button
                                type="link"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => setInspectedVersion(version)}
                              >
                                查看
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                icon={<UndoOutlined />}
                                disabled={detail.archived || version.id === detail.latest_version_id}
                                onClick={() => restoreVersion(version)}
                              >
                                恢复
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                icon={<BranchesOutlined />}
                                disabled={detail.archived}
                                onClick={() => setContentModal({ mode: 'derive', sourceVersion: version })}
                              >
                                派生
                              </Button>
                            </Space>
                          </div>
                          <Text className={styles.versionTitle} ellipsis={{ tooltip: version.content.title }}>
                            {version.content.title}
                          </Text>
                          <div className={styles.versionMeta}>
                            <span>{formatDateTime(version.created_at)}</span>
                            {version.base_version_number && (
                              <span>基于 v{version.base_version_number}</span>
                            )}
                            {version.restored_from_version_number && (
                              <span>恢复自 v{version.restored_from_version_number}</span>
                            )}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'usage',
            label: `使用问卷 (${usage?.total_surveys ?? 0})`,
            children: (
              <div className={styles.tabTable}>
                <Table<QuestionUsageSurvey>
                  rowKey="survey_id"
                  size="middle"
                  columns={usageColumns}
                  dataSource={usage?.surveys ?? []}
                  tableLayout="fixed"
                  pagination={false}
                  scroll={{ x: 760, y: 'calc(100dvh - 330px)' }}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未用于已发布问卷" />,
                  }}
                />
              </div>
            ),
          },
          {
            key: 'shares',
            label: `分享 (${shares.filter((share) => share.active).length})`,
            children: (
              <div className={styles.tabPanel}>
                <div className={styles.sectionToolbar}>
                  <Text type="secondary">登录用户可在分享链接中选择版本并复制到自己的题库</Text>
                  <Button
                    type="primary"
                    icon={<LinkOutlined />}
                    disabled={detail.archived}
                    onClick={() => setShareOpen(true)}
                  >
                    创建分享
                  </Button>
                </div>
                <div className={styles.tabTable}>
                  <Table<LibraryQuestionShare>
                    rowKey="id"
                    size="middle"
                    columns={shareColumns}
                    dataSource={shares}
                    tableLayout="fixed"
                    pagination={false}
                    scroll={{ x: 620 }}
                    locale={{
                      emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分享" />,
                    }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

      <QuestionContentModal
        open={Boolean(contentModal)}
        title={contentModal?.mode === 'derive' ? '派生新题' : '保存新版本'}
        okText={contentModal?.mode === 'derive' ? '创建' : '保存'}
        initial={
          contentModal?.mode === 'derive'
            ? contentModal.sourceVersion.content
            : detail.latest_version.content
        }
        initialType={detail.question_type}
        typeLocked={contentModal?.mode !== 'derive'}
        submitting={submitting}
        onCancel={() => setContentModal(null)}
        onSubmit={submitContent}
      />

      <Drawer
        open={Boolean(inspectedVersion)}
        title={inspectedVersion ? `v${inspectedVersion.version_number} 内容` : '版本内容'}
        size={620}
        onClose={() => setInspectedVersion(null)}
        destroyOnHidden
      >
        {inspectedVersion && <QuestionContentPreview content={inspectedVersion.content} />}
      </Drawer>

      <Modal
        open={shareOpen}
        title="创建分享"
        okText="创建"
        cancelText="取消"
        confirmLoading={shareCreating}
        onOk={() => void handleCreateShare()}
        onCancel={() => {
          setShareOpen(false);
          setShareExpiry(null);
        }}
        destroyOnHidden
      >
        <div className={styles.shareForm}>
          <Text>有效期</Text>
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            value={shareExpiry}
            placeholder="长期有效"
            style={{ width: '100%' }}
            disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
            onChange={setShareExpiry}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(createdShare)}
        title="分享链接"
        footer={<Button type="primary" onClick={() => setCreatedShare(null)}>完成</Button>}
        onCancel={() => setCreatedShare(null)}
        destroyOnHidden
      >
        {createdShare && (
          <Input
            readOnly
            value={createdShare.url}
            aria-label="分享链接"
            addonAfter={
              <Button
                type="text"
                icon={<CopyOutlined />}
                aria-label="复制分享链接"
                onClick={() => void copyText(createdShare.url)}
              />
            }
          />
        )}
      </Modal>

      {detail.archived && (
        <Alert
          className={styles.archiveNotice}
          type="warning"
          showIcon
          message="题目已归档"
          action={<Button size="small" onClick={toggleArchive}>恢复</Button>}
        />
      )}
    </WorkspacePageFrame>
  );
}

