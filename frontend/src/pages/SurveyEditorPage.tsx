import {
  BarChartOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  HistoryOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Collapse,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Result,
  Segmented,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { errorMessage } from '../features/auth/formErrors';
import {
  closeSurvey,
  getSurvey,
  getSurveyVersion,
  listSurveyVersions,
  publishSurvey,
  saveSurveyDraft,
  setSurveyDeadline,
} from '../features/surveys/api';
import { PagesEditor } from '../features/surveys/editor/PagesEditor';
import { QuestionEditor } from '../features/surveys/editor/QuestionEditor';
import { RulesDrawer } from '../features/surveys/editor/RulesDrawer';
import { VersionHistoryDrawer } from '../features/surveys/editor/VersionHistoryDrawer';
import {
  buildPages,
  createPagedLayout,
  createQuestion,
  pageLayout,
  pruneForwardRules,
  removeDanglingRules,
  syncPagesAfterDelete,
  syncPagesAfterReorder,
} from '../features/surveys/schema';
import type {
  JumpRule,
  QuestionType,
  SurveyDetail,
  SurveyQuestion,
  SurveySchema,
} from '../features/surveys/types';
import { questionTypeLabels } from '../features/surveys/utils';
import { SurveyStatusTag } from '../features/surveys/components/SurveyStatusTag';
import { ApiError } from '../shared/api/client';
import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './SurveyEditorPage.module.css';

const { Text } = Typography;

interface SettingsValues {
  title: string;
  description: string;
  allow_anonymous: boolean;
  allow_multiple_responses: boolean;
  presentation_mode: 'continuous' | 'paged';
}

function settingsValues(schema: SurveySchema): SettingsValues {
  return {
    title: schema.title,
    description: schema.description,
    allow_anonymous: schema.allow_anonymous,
    allow_multiple_responses: schema.allow_multiple_responses,
    presentation_mode: schema.presentation.mode,
  };
}

function fieldErrorSummary(error: ApiError): string {
  const errors = Object.values(error.fieldErrors);
  return errors.length > 0 ? errors.join('；') : error.message;
}

export function SurveyEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [settingsForm] = Form.useForm<SettingsValues>();
  const [deadlineForm] = Form.useForm<{ deadline_at: Dayjs | null }>();
  const [detail, setDetail] = useState<SurveyDetail | null>(null);
  const [schema, setSchema] = useState<SurveySchema | null>(null);
  const [revision, setRevision] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeQuestionKeys, setActiveQuestionKeys] = useState<string[]>([]);
  const [lockedTypes, setLockedTypes] = useState<Record<string, QuestionType>>({});
  const [ruleQuestionId, setRuleQuestionId] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);

  const applyDetail = useCallback(
    (next: SurveyDetail) => {
      setDetail(next);
      setSchema(next.draft_schema);
      setRevision(next.draft_revision);
      setDirty(false);
      setEditorError(null);
      settingsForm.setFieldsValue(settingsValues(next.draft_schema));
    },
    [settingsForm],
  );

  const refreshLockedTypes = useCallback(async () => {
    const versions = await listSurveyVersions(id);
    const active = versions.find((version) => version.active);
    if (!active) {
      setLockedTypes({});
      return;
    }
    const version = await getSurveyVersion(id, active.id);
    setLockedTypes(
      Object.fromEntries(version.schema.questions.map((question) => [question.id, question.type])),
    );
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedDetail, versions] = await Promise.all([getSurvey(id), listSurveyVersions(id)]);
      const active = versions.find((version) => version.active);
      if (active) {
        const version = await getSurveyVersion(id, active.id);
        setLockedTypes(
          Object.fromEntries(
            version.schema.questions.map((question) => [question.id, question.type]),
          ),
        );
      } else {
        setLockedTypes({});
      }
      applyDetail(loadedDetail);
      setActiveQuestionKeys(
        loadedDetail.draft_schema.questions[0]
          ? [loadedDetail.draft_schema.questions[0].id]
          : [],
      );
    } catch (requestError) {
      setLoadError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [applyDetail, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeSchema = (next: SurveySchema) => {
    setSchema(next);
    setDirty(true);
  };

  const reportError = (requestError: unknown) => {
    const summary = requestError instanceof ApiError
      ? fieldErrorSummary(requestError)
      : errorMessage(requestError);
    setEditorError(summary);
  };

  const saveDraft = async (): Promise<SurveyDetail | null> => {
    if (!schema) {
      return null;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const updated = await saveSurveyDraft(id, schema, revision);
      applyDetail(updated);
      message.success('草稿已保存');
      return updated;
    } catch (requestError) {
      reportError(requestError);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!schema) {
      return;
    }
    setPublishing(true);
    setEditorError(null);
    try {
      let targetRevision = revision;
      if (dirty) {
        const saved = await saveSurveyDraft(id, schema, revision);
        applyDetail(saved);
        targetRevision = saved.draft_revision;
      }
      const published = await publishSurvey(id, targetRevision);
      applyDetail(published);
      await refreshLockedTypes();
      message.success(`已发布 v${published.active_version_number}`);
    } catch (requestError) {
      reportError(requestError);
    } finally {
      setPublishing(false);
    }
  };

  const handleSettingsChange = (_changed: Partial<SettingsValues>, all: SettingsValues) => {
    if (!schema) {
      return;
    }
    setSchema((current) => {
      if (!current) {
        return current;
      }
      const nextMode = all.presentation_mode;
      const pages = nextMode === current.presentation.mode
        ? current.pages
        : nextMode === 'paged'
          ? createPagedLayout(current.questions)
          : [];
      return {
        ...current,
        title: all.title,
        description: all.description,
        allow_anonymous: Boolean(all.allow_anonymous),
        allow_multiple_responses: Boolean(all.allow_multiple_responses),
        presentation: { mode: nextMode },
        pages,
      };
    });
    setDirty(true);
  };

  const updateQuestion = (nextQuestion: SurveyQuestion) => {
    const sanitized = removeDanglingRules(nextQuestion);
    setSchema((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) =>
              question.id === sanitized.id ? sanitized : question,
            ),
          }
        : current,
    );
    setDirty(true);
  };

  const addQuestion = (type: QuestionType) => {
    if (!schema) {
      return;
    }
    const question = createQuestion(type, schema.questions.length);
    const questions = [...schema.questions, question];
    let pages = schema.pages;
    if (schema.presentation.mode === 'paged') {
      const layout = pageLayout(schema);
      if (layout.length === 0) {
        pages = createPagedLayout(questions);
      } else {
        layout[layout.length - 1].size += 1;
        pages = buildPages(questions, layout);
      }
    }
    changeSchema({ ...schema, questions, pages });
    setActiveQuestionKeys([question.id]);
  };

  const deleteQuestion = (questionId: string) => {
    if (!schema) {
      return;
    }
    const questions = pruneForwardRules(
      schema.questions.filter((question) => question.id !== questionId),
    );
    const pages = schema.presentation.mode === 'paged'
      ? syncPagesAfterDelete(questions, schema.pages)
      : [];
    changeSchema({ ...schema, questions, pages });
    if (ruleQuestionId === questionId) {
      setRuleQuestionId(null);
    }
  };

  const moveQuestion = (index: number, offset: number) => {
    if (!schema) {
      return;
    }
    const target = index + offset;
    if (target < 0 || target >= schema.questions.length) {
      return;
    }
    const reordered = [...schema.questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const questions = pruneForwardRules(reordered);
    const pages = schema.presentation.mode === 'paged'
      ? syncPagesAfterReorder(questions, schema.pages)
      : [];
    changeSchema({ ...schema, questions, pages });
  };

  const saveRules = (rules: JumpRule[]) => {
    if (!schema || !ruleQuestionId) {
      return;
    }
    setSchema({
      ...schema,
      questions: schema.questions.map((question) =>
        question.id === ruleQuestionId ? { ...question, jump_rules: rules } : question,
      ),
    });
    setDirty(true);
    setRuleQuestionId(null);
  };

  const copyLink = async () => {
    if (!detail) {
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/survey/${detail.short_code}`,
      );
      message.success('链接已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  const openDeadline = () => {
    deadlineForm.setFieldsValue({
      deadline_at: detail?.deadline_at ? dayjs(detail.deadline_at) : null,
    });
    setDeadlineOpen(true);
  };

  const handleDeadline = async () => {
    try {
      const values = await deadlineForm.validateFields();
      setDeadlineSaving(true);
      const updated = await setSurveyDeadline(
        id,
        values.deadline_at ? values.deadline_at.toISOString() : null,
      );
      if (dirty) {
        setDetail((current) =>
          current
            ? { ...updated, draft_schema: schema ?? current.draft_schema, draft_revision: revision }
            : updated,
        );
      } else {
        applyDetail(updated);
      }
      setDeadlineOpen(false);
      message.success(values.deadline_at ? '截止时间已更新' : '截止时间已清除');
    } catch (requestError) {
      if (requestError instanceof Error) {
        message.error(errorMessage(requestError));
      }
    } finally {
      setDeadlineSaving(false);
    }
  };

  const handleClose = () => {
    modal.confirm({
      title: '关闭问卷？',
      content: '关闭后将作废未提交草稿，必须重新发布才能开放。',
      okText: '关闭问卷',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          applyDetail(await closeSurvey(id));
          message.success('问卷已关闭');
        } catch (requestError) {
          message.error(errorMessage(requestError));
        }
      },
    });
  };

  const moreMenu: MenuProps = {
    items: [
      { key: 'deadline', icon: <FieldTimeOutlined />, label: '截止时间' },
      { key: 'versions', icon: <HistoryOutlined />, label: '版本历史' },
      {
        key: 'statistics',
        icon: <BarChartOutlined />,
        label: '查看统计',
        disabled: !detail?.active_version_number,
      },
      { type: 'divider' },
      {
        key: 'close',
        icon: <CloseCircleOutlined />,
        label: '关闭问卷',
        danger: true,
        disabled: !detail || detail.status === 'draft' || detail.status === 'closed',
      },
    ],
    onClick: ({ key }) => {
      if (key === 'deadline') {
        openDeadline();
      } else if (key === 'versions') {
        setVersionsOpen(true);
      } else if (key === 'statistics') {
        navigate(`/workspace/surveys/${id}/statistics`);
      } else if (key === 'close') {
        handleClose();
      }
    },
  };

  if (loading) {
    return (
      <WorkspacePageFrame
        breadcrumbs={[{ title: '工作台' }, { title: '问卷管理' }, { title: '编辑问卷' }]}
        kicker="SURVEY EDITOR"
        title="编辑问卷"
      >
        <div className={styles.loading}>
          <Spin size="large" />
        </div>
      </WorkspacePageFrame>
    );
  }

  if (!detail || !schema || loadError) {
    return (
      <WorkspacePageFrame
        breadcrumbs={[{ title: '工作台' }, { title: '问卷管理' }, { title: '编辑问卷' }]}
        kicker="SURVEY EDITOR"
        title="编辑问卷"
      >
        <Result
          status="error"
          title="问卷加载失败"
          subTitle={loadError ?? undefined}
          extra={
            <Space>
              <Button onClick={() => void load()}>重试</Button>
              <Button onClick={() => navigate('/workspace/surveys')}>返回列表</Button>
            </Space>
          }
        />
      </WorkspacePageFrame>
    );
  }

  const ruleQuestion = schema.questions.find((question) => question.id === ruleQuestionId) ?? null;

  return (
    <WorkspacePageFrame
      breadcrumbs={[
        { title: '工作台' },
        { title: '问卷管理', href: '/workspace/surveys' },
        { title: schema.title || '未命名问卷' },
      ]}
      kicker="SURVEY EDITOR"
      title={schema.title || '未命名问卷'}
      actions={
        <Space size={8} wrap className={styles.pageActions}>
          <span className={styles.desktopStatus}>
            <SurveyStatusTag status={detail.status} />
          </span>
          <Tooltip title="复制填写链接">
            <Button icon={<LinkOutlined />} aria-label="复制填写链接" onClick={() => void copyLink()} />
          </Tooltip>
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => void saveDraft()}>
            保存草稿
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={publishing}
            onClick={() => void handlePublish()}
          >
            发布
          </Button>
          <Dropdown menu={moreMenu} trigger={['click']} placement="bottomRight">
            <Button icon={<MoreOutlined />} aria-label="更多问卷操作" />
          </Dropdown>
        </Space>
      }
    >
      {editorError && (
        <Alert
          className={styles.editorAlert}
          type="error"
          showIcon
          message={editorError}
          action={
            editorError.includes('其他页面') ? (
              <Button size="small" onClick={() => void load()}>
                重新加载
              </Button>
            ) : undefined
          }
          closable
          onClose={() => setEditorError(null)}
        />
      )}

      <Tabs
        className={styles.tabs}
        defaultActiveKey="settings"
        items={[
          {
            key: 'settings',
            label: '基本信息',
            forceRender: true,
            children: (
              <div className={styles.tabPanel}>
                <Form
                  form={settingsForm}
                  layout="vertical"
                  requiredMark={false}
                  className={styles.settingsForm}
                  onValuesChange={handleSettingsChange}
                >
                  <Form.Item
                    label="问卷标题"
                    name="title"
                    rules={[
                      { required: true, message: '请输入问卷标题' },
                      { max: 120, message: '标题最多 120 个字符' },
                    ]}
                  >
                    <Input maxLength={120} />
                  </Form.Item>
                  <Form.Item
                    label="问卷说明"
                    name="description"
                    rules={[{ max: 2000, message: '说明最多 2000 个字符' }]}
                  >
                    <Input.TextArea rows={4} maxLength={2000} showCount />
                  </Form.Item>
                  <Form.Item label="展示方式" name="presentation_mode">
                    <Segmented
                      options={[
                        { value: 'continuous', label: '连续展示' },
                        { value: 'paged', label: '分页展示' },
                      ]}
                    />
                  </Form.Item>
                  <div className={styles.switchRow}>
                    <Form.Item label="允许匿名填写" name="allow_anonymous" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      label="允许重复填写"
                      name="allow_multiple_responses"
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </div>
                </Form>
              </div>
            ),
          },
          {
            key: 'questions',
            label: `题目 (${schema.questions.length})`,
            children: (
              <div className={styles.tabPanel}>
                <div className={styles.sectionToolbar}>
                  <Dropdown
                    menu={{
                      items: (Object.keys(questionTypeLabels) as QuestionType[]).map((type) => ({
                        key: type,
                        label: questionTypeLabels[type],
                      })),
                      onClick: ({ key }) => addQuestion(key as QuestionType),
                    }}
                    trigger={['click']}
                  >
                    <Button type="primary" icon={<PlusOutlined />}>
                      添加题目
                    </Button>
                  </Dropdown>
                </div>
                {schema.questions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无题目" />
                ) : (
                  <Collapse
                    className={styles.questionCollapse}
                    activeKey={activeQuestionKeys}
                    onChange={(keys) =>
                      setActiveQuestionKeys(
                        Array.isArray(keys) ? keys.map(String) : [String(keys)],
                      )
                    }
                    items={schema.questions.map((question, index) => ({
                      key: question.id,
                      label: (
                        <div className={styles.questionLabel}>
                          <Tag variant="filled" color="blue">
                            {questionTypeLabels[question.type]}
                          </Tag>
                          <Text ellipsis={{ tooltip: question.title }}>
                            {question.title || '未命名题目'}
                          </Text>
                          {question.required && <span className={styles.requiredMark}>*</span>}
                        </div>
                      ),
                      children: (
                        <QuestionEditor
                          question={question}
                          index={index}
                          total={schema.questions.length}
                          typeLocked={Boolean(lockedTypes[question.id])}
                          onChange={updateQuestion}
                          onMove={(offset) => moveQuestion(index, offset)}
                          onDelete={() => deleteQuestion(question.id)}
                          onEditRules={() => setRuleQuestionId(question.id)}
                        />
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'pages',
            label: `页面 (${schema.presentation.mode === 'paged' ? schema.pages.length : 0})`,
            children: (
              <div className={styles.tabPanel}>
                <PagesEditor schema={schema} onChange={changeSchema} />
              </div>
            ),
          },
        ]}
      />

      <RulesDrawer
        open={Boolean(ruleQuestionId)}
        question={ruleQuestion}
        schema={schema}
        onClose={() => setRuleQuestionId(null)}
        onSave={saveRules}
      />
      <VersionHistoryDrawer
        open={versionsOpen}
        surveyId={id}
        onClose={() => setVersionsOpen(false)}
        onCopied={(next) => {
          applyDetail(next);
          setActiveQuestionKeys(
            next.draft_schema.questions[0] ? [next.draft_schema.questions[0].id] : [],
          );
        }}
      />
      <Modal
        open={deadlineOpen}
        title="截止时间"
        okText="保存"
        cancelText="取消"
        confirmLoading={deadlineSaving}
        onOk={() => void handleDeadline()}
        onCancel={() => setDeadlineOpen(false)}
        destroyOnHidden
        forceRender
      >
        <Form form={deadlineForm} layout="vertical" requiredMark={false} preserve={false}>
          <Form.Item label="截止时间" name="deadline_at">
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              disabledDate={(current) => current && current.isBefore(dayjs(), 'day')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </WorkspacePageFrame>
  );
}
