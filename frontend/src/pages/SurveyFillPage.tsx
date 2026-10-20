import { ArrowLeftOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Empty,
  Layout,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { errorMessage } from '../features/auth/formErrors';
import {
  createSurveyAttempt,
  getPublicSurvey,
  saveSurveyAttempt,
  submitSurveyAttempt,
} from '../features/surveys/api';
import { FillQuestion } from '../features/surveys/fill/FillQuestion';
import {
  computeVisibleQuestionIds,
  resolveJumpTarget,
  validateAnswers,
} from '../features/surveys/flow';
import type {
  AttemptSummary,
  PublicSurvey,
  SurveyQuestion,
  SurveySchema,
} from '../features/surveys/types';
import { ApiError } from '../shared/api/client';
import { Brand } from '../shared/components/Brand';
import styles from './SurveyFillPage.module.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

interface TerminalError {
  code: string;
  message: string;
}

const terminalTitles: Record<string, string> = {
  SURVEY_VERSION_CHANGED: '问卷已更新',
  SURVEY_CLOSED: '问卷已关闭',
  SURVEY_EXPIRED: '问卷已截止',
  SURVEY_NOT_PUBLISHED: '问卷尚未发布',
  SURVEY_ALREADY_SUBMITTED: '已提交',
};

function serializeAttempt(
  answers: Record<string, unknown>,
  currentQuestionId: string | null,
): string {
  return JSON.stringify({ answers, currentQuestionId });
}

export function SurveyFillPage() {
  const { short_code: shortCode = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { message } = App.useApp();
  const [publicSurvey, setPublicSurvey] = useState<PublicSurvey | null>(null);
  const [schema, setSchema] = useState<SurveySchema | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | undefined>();
  const [terminalError, setTerminalError] = useState<TerminalError | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  const revisionRef = useRef(1);
  const answersRef = useRef<Record<string, unknown>>({});
  const currentQuestionRef = useRef<string | null>(null);
  const lastSavedRef = useRef('');
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const blockedRef = useRef(false);
  const mountedRef = useRef(true);
  const multipleTimerRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (multipleTimerRef.current !== null) {
        window.clearTimeout(multipleTimerRef.current);
      }
    };
  }, []);

  const hydrateAttempt = useCallback((nextSchema: SurveySchema, attempt: AttemptSummary) => {
    const nextAnswers = JSON.parse(JSON.stringify(attempt.answers)) as Record<string, unknown>;
    const visible = computeVisibleQuestionIds(nextSchema, nextAnswers);
    const resumeAtStoredCurrent = Boolean(
      attempt.current_question_id && visible.has(attempt.current_question_id),
    );
    let nextCurrent = attempt.current_question_id;
    if (!resumeAtStoredCurrent) {
      nextCurrent = [...visible][0] ?? null;
    }
    answersRef.current = nextAnswers;
    currentQuestionRef.current = nextCurrent;
    revisionRef.current = attempt.revision;
    lastSavedRef.current = serializeAttempt(nextAnswers, nextCurrent);
    blockedRef.current = false;
    setSchema(nextSchema);
    setAttemptId(attempt.attempt_id);
    setAnswers(nextAnswers);
    setCurrentQuestionId(nextCurrent);
    setErrors({});
    setSubmitted(false);
    setTerminalError(null);
    setSaveError(null);
    setSaveState('saved');
    if (nextSchema.presentation.mode === 'paged') {
      const targetIndex = nextSchema.pages.findIndex((page) =>
        page.question_ids.includes(nextCurrent ?? ''),
      );
      setPageIndex(targetIndex >= 0 ? targetIndex : 0);
    } else {
      setPageIndex(0);
      setPendingScrollId(
        resumeAtStoredCurrent && nextCurrent !== nextSchema.questions[0]?.id
          ? nextCurrent
          : null,
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setTerminalError(null);
    try {
      const survey = await getPublicSurvey(shortCode);
      setPublicSurvey(survey);
      if (survey.existing_attempt && survey.survey_schema) {
        hydrateAttempt(survey.survey_schema, survey.existing_attempt);
      } else if (survey.can_fill && survey.survey_schema && !survey.completed) {
        const attempt = await createSurveyAttempt(shortCode, false);
        hydrateAttempt(attempt.survey_schema, attempt);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setLoadErrorStatus(requestError.status === 404 ? 404 : undefined);
      }
      setLoadError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [hydrateAttempt, shortCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const finishWithError = useCallback((requestError: unknown) => {
    if (requestError instanceof ApiError && requestError.code === 'SURVEY_REVISION_CONFLICT') {
      blockedRef.current = true;
      setSaveState('conflict');
      setSaveError('答卷已在其他页面更新，请刷新后继续');
      return;
    }
    if (
      requestError instanceof ApiError
      && ['SURVEY_VERSION_CHANGED', 'SURVEY_CLOSED', 'SURVEY_EXPIRED', 'SURVEY_NOT_PUBLISHED'].includes(
        requestError.code,
      )
    ) {
      blockedRef.current = true;
      setTerminalError({ code: requestError.code, message: requestError.message });
      return;
    }
    setSaveState('error');
    setSaveError(errorMessage(requestError));
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    if (!attemptId || blockedRef.current) {
      return !blockedRef.current;
    }
    const snapshotSignature = serializeAttempt(
      answersRef.current,
      currentQuestionRef.current,
    );
    if (snapshotSignature === lastSavedRef.current) {
      setSaveState('saved');
      return true;
    }
    if (savePromiseRef.current) {
      const pendingResult = await savePromiseRef.current;
      if (!pendingResult) {
        return false;
      }
      if (
        serializeAttempt(answersRef.current, currentQuestionRef.current)
        !== lastSavedRef.current
      ) {
        return persist();
      }
      return true;
    }

    const snapshotAnswers = answersRef.current;
    const snapshotCurrent = currentQuestionRef.current;
    const snapshotRevision = revisionRef.current;
    setSaveState('saving');
    const request = saveSurveyAttempt(
      shortCode,
      attemptId,
      snapshotRevision,
      snapshotAnswers,
      snapshotCurrent,
    )
      .then((response) => {
        if (!mountedRef.current) {
          return true;
        }
        revisionRef.current = response.revision;
        lastSavedRef.current = snapshotSignature;
        setSaveError(null);
        setSaveState(
          serializeAttempt(answersRef.current, currentQuestionRef.current) === snapshotSignature
            ? 'saved'
            : 'dirty',
        );
        return true;
      })
      .catch((requestError: unknown) => {
        if (mountedRef.current) {
          finishWithError(requestError);
        }
        return false;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });
    savePromiseRef.current = request;
    const result = await request;
    if (
      result
      && serializeAttempt(answersRef.current, currentQuestionRef.current) !== lastSavedRef.current
    ) {
      return persist();
    }
    return result;
  }, [attemptId, finishWithError, shortCode]);

  useEffect(() => {
    if (!attemptId || !schema || submitted || blockedRef.current) {
      return;
    }
    if (serializeAttempt(answers, currentQuestionId) === lastSavedRef.current) {
      return;
    }
    setSaveState('dirty');
    const timer = window.setTimeout(() => {
      void persist();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [answers, attemptId, currentQuestionId, persist, schema, submitted]);

  useEffect(() => {
    if (!pendingScrollId) {
      return;
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`question-${pendingScrollId}`)?.scrollIntoView({ block: 'start' });
      setPendingScrollId(null);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [answers, pendingScrollId, pageIndex, schema]);

  const setCurrent = (questionId: string | null) => {
    currentQuestionRef.current = questionId;
    setCurrentQuestionId(questionId);
  };

  const jumpForAnswer = useCallback(
    (question: SurveyQuestion, value: unknown) => {
      if (!schema) {
        return;
      }
      const target = resolveJumpTarget(question, value);
      if (!target) {
        return;
      }
      if (target === '__end__') {
        setCurrent(null);
        if (schema.presentation.mode === 'paged') {
          contentRef.current?.scrollTo({ top: 0 });
        }
        return;
      }
      setCurrent(target);
      if (schema.presentation.mode === 'paged') {
        const targetPage = schema.pages.findIndex((page) =>
          page.question_ids.includes(target),
        );
        if (targetPage >= 0) {
          setPageIndex(targetPage);
          contentRef.current?.scrollTo({ top: 0 });
        }
      } else {
        setPendingScrollId(target);
      }
    },
    [schema],
  );

  const updateAnswer = (question: SurveyQuestion, value: unknown) => {
    const nextAnswers = { ...answersRef.current, [question.id]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setCurrent(question.id);
    setErrors((current) => {
      if (!current[question.id]) {
        return current;
      }
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    if (question.type === 'single_choice') {
      jumpForAnswer(question, value);
    }
    if (question.type === 'multiple_choice') {
      if (multipleTimerRef.current !== null) {
        window.clearTimeout(multipleTimerRef.current);
      }
      multipleTimerRef.current = window.setTimeout(() => {
        jumpForAnswer(question, answersRef.current[question.id]);
      }, 1000);
    }
  };

  const commitAnswer = (question: SurveyQuestion, value: unknown) => {
    if (question.type === 'number') {
      jumpForAnswer(question, value);
    }
  };

  const visibleQuestionIds = useMemo(
    () => (schema ? computeVisibleQuestionIds(schema, answers) : new Set<string>()),
    [answers, schema],
  );

  const pagedQuestions = useMemo(() => {
    if (!schema || schema.presentation.mode !== 'paged') {
      return [];
    }
    const page = schema.pages[pageIndex];
    return page
      ? page.question_ids
          .filter((questionId) => visibleQuestionIds.has(questionId))
          .map((questionId) => schema.questions.find((question) => question.id === questionId))
          .filter((question): question is SurveyQuestion => Boolean(question))
      : [];
  }, [pageIndex, schema, visibleQuestionIds]);

  const continuousQuestions = useMemo(
    () =>
      schema
        ? schema.questions.filter((question) => visibleQuestionIds.has(question.id))
        : [],
    [schema, visibleQuestionIds],
  );

  const scrollToFirstError = (nextErrors: Record<string, string>, orderedIds: string[]) => {
    const first = orderedIds.find((questionId) => Boolean(nextErrors[questionId]));
    if (first) {
      window.setTimeout(() => {
        document.getElementById(`question-${first}`)?.scrollIntoView({ block: 'center' });
      }, 0);
    }
  };

  const nextVisiblePage = schema?.presentation.mode === 'paged'
    ? schema.pages.findIndex(
        (page, index) =>
          index > pageIndex && page.question_ids.some((questionId) => visibleQuestionIds.has(questionId)),
      )
    : -1;
  const previousVisiblePage = schema?.presentation.mode === 'paged'
    ? schema.pages.findLastIndex(
        (page, index) =>
          index < pageIndex && page.question_ids.some((questionId) => visibleQuestionIds.has(questionId)),
      )
    : -1;

  const goToPage = async (target: number) => {
    if (target < 0 || !schema) {
      return;
    }
    setNavigating(true);
    try {
      if (!(await persist())) {
        return;
      }
      setPageIndex(target);
      contentRef.current?.scrollTo({ top: 0 });
    } finally {
      setNavigating(false);
    }
  };

  const handleNextPage = async () => {
    if (!schema) {
      return;
    }
    const allErrors = validateAnswers(schema, answersRef.current);
    const pageQuestionIds = schema.pages[pageIndex]?.question_ids ?? [];
    const pageErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([questionId]) => pageQuestionIds.includes(questionId)),
    );
    if (Object.keys(pageErrors).length > 0) {
      setErrors((current) => ({ ...current, ...pageErrors }));
      scrollToFirstError(pageErrors, pageQuestionIds);
      return;
    }
    await goToPage(nextVisiblePage);
  };

  const handleSubmit = async () => {
    if (!schema || !attemptId) {
      return;
    }
    const nextErrors = validateAnswers(schema, answersRef.current);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      scrollToFirstError(nextErrors, schema.questions.map((question) => question.id));
      return;
    }
    setSubmitting(true);
    try {
      if (!(await persist())) {
        return;
      }
      await submitSurveyAttempt(
        shortCode,
        attemptId,
        revisionRef.current,
        answersRef.current,
        currentQuestionRef.current,
      );
      blockedRef.current = true;
      setSubmitted(true);
      setSaveState('idle');
      setPublicSurvey((current) =>
        current
          ? { ...current, completed: true, can_fill: false, can_start_new: Boolean(schema.allow_multiple_responses) }
          : current,
      );
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'SURVEY_ALREADY_SUBMITTED') {
        blockedRef.current = true;
        setSubmitted(true);
      } else if (requestError instanceof ApiError && Object.keys(requestError.fieldErrors).length > 0) {
        setErrors(requestError.fieldErrors);
        scrollToFirstError(requestError.fieldErrors, schema.questions.map((question) => question.id));
      } else {
        finishWithError(requestError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startNewAttempt = async () => {
    if (!publicSurvey?.survey_schema) {
      return;
    }
    setStarting(true);
    try {
      const attempt = await createSurveyAttempt(shortCode, true);
      hydrateAttempt(attempt.survey_schema, attempt);
      contentRef.current?.scrollTo({ top: 0 });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'SURVEY_ALREADY_SUBMITTED') {
        message.error(errorMessage(requestError));
      } else {
        finishWithError(requestError);
      }
    } finally {
      setStarting(false);
    }
  };

  const renderQuestions = (questions: SurveyQuestion[]) =>
    questions.map((question) => (
      <FillQuestion
        key={question.id}
        question={question}
        index={schema?.questions.findIndex((item) => item.id === question.id) ?? 0}
        value={answers[question.id]}
        error={errors[question.id]}
        onChange={(value) => updateAnswer(question, value)}
        onCommit={(value) => commitAnswer(question, value)}
      />
    ));

  const saveStateTag = saveState === 'idle' ? null : (
    <Tag
      variant="filled"
      color={
        saveState === 'saved'
          ? 'green'
          : saveState === 'error' || saveState === 'conflict'
            ? 'red'
            : 'blue'
      }
    >
      {saveState === 'saving' && <Spin size="small" />}
      {saveState === 'saving'
        ? '保存中'
        : saveState === 'saved'
          ? '已保存'
          : saveState === 'dirty'
            ? '未保存'
            : saveState === 'conflict'
              ? '保存冲突'
              : '保存失败'}
    </Tag>
  );

  const renderUnavailable = () => {
    if (submitted) {
      return (
        <Result
          status="success"
          title="已提交"
          extra={
            publicSurvey?.can_start_new || schema?.allow_multiple_responses ? (
              <Button type="primary" loading={starting} onClick={() => void startNewAttempt()}>
                再次填写
              </Button>
            ) : undefined
          }
        />
      );
    }
    if (publicSurvey?.completed && !attemptId) {
      return (
        <Result
          status="success"
          title="已提交"
          extra={
            publicSurvey.can_start_new ? (
              <Button type="primary" loading={starting} onClick={() => void startNewAttempt()}>
                再次填写
              </Button>
            ) : undefined
          }
        />
      );
    }
    if (publicSurvey?.status === 'closed') {
      return <Result status="warning" title="问卷已关闭" />;
    }
    if (publicSurvey?.status === 'expired') {
      return <Result status="warning" title="问卷已截止" />;
    }
    return <Result status="info" title="问卷尚未发布" />;
  };

  const hasPagedContent = schema?.presentation.mode === 'paged';
  const isLastVisiblePage = hasPagedContent && nextVisiblePage < 0;

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div className={styles.headerLead}>
          <Brand compact />
          {schema && <Text className={styles.headerTitle}>{schema.title}</Text>}
        </div>
        <Space size={10}>
          <Text type="secondary" className={styles.userName}>
            {session?.user.username}
          </Text>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workspace')}>
            工作台
          </Button>
        </Space>
      </Header>
      <Content className={styles.main}>
        {loading ? (
          <div className={styles.centerState}>
            <Spin size="large" />
          </div>
        ) : loadError ? (
          <div className={styles.centerState}>
            <Result
              status={loadErrorStatus === 404 ? '404' : 'error'}
              title="问卷加载失败"
              subTitle={loadError}
              extra={
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                    重新加载
                  </Button>
                  <Button onClick={() => navigate('/workspace')}>返回工作台</Button>
                </Space>
              }
            />
          </div>
        ) : terminalError ? (
          <div className={styles.centerState}>
            <Result
              status="warning"
              title={terminalTitles[terminalError.code] ?? '无法继续填写'}
              subTitle={terminalError.message}
              extra={
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={() => void load()}>
                    重新加载
                  </Button>
                  <Button onClick={() => navigate('/workspace')}>返回工作台</Button>
                </Space>
              }
            />
          </div>
        ) : !publicSurvey || !publicSurvey.can_fill ? (
          <div className={styles.centerState}>{renderUnavailable()}</div>
        ) : !schema || !attemptId ? (
          <div className={styles.centerState}>{renderUnavailable()}</div>
        ) : (
          <div className={styles.scrollArea} ref={contentRef}>
            <main className={styles.content}>
              <header className={styles.surveyHeader}>
                <div>
                  <Title level={2} className={styles.surveyTitle}>
                    {schema.title}
                  </Title>
                  {schema.description && (
                    <Text type="secondary" className={styles.surveyDescription}>
                      {schema.description}
                    </Text>
                  )}
                </div>
                {saveStateTag}
              </header>

              {saveError && (
                <Alert
                  type={saveState === 'conflict' ? 'warning' : 'error'}
                  showIcon
                  message={saveError}
                  action={
                    saveState === 'conflict' ? (
                      <Button size="small" onClick={() => void load()}>
                        重新加载
                      </Button>
                    ) : undefined
                  }
                  closable={saveState !== 'conflict'}
                  onClose={() => setSaveError(null)}
                />
              )}

              <div className={styles.questions}>
                {hasPagedContent ? renderQuestions(pagedQuestions) : renderQuestions(continuousQuestions)}
                {hasPagedContent && pagedQuestions.length === 0 && (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本页暂无题目" />
                )}
              </div>

              <footer className={styles.footer}>
                {hasPagedContent && (
                  <Text type="secondary" className={styles.pageIndicator}>
                    第 {pageIndex + 1} / {schema.pages.length} 页
                  </Text>
                )}
                <Space size={8}>
                  {hasPagedContent && previousVisiblePage >= 0 && (
                    <Button
                      loading={navigating}
                      onClick={() => void goToPage(previousVisiblePage)}
                    >
                      上一页
                    </Button>
                  )}
                  {hasPagedContent && !isLastVisiblePage ? (
                    <Button
                      type="primary"
                      loading={navigating}
                      onClick={() => void handleNextPage()}
                    >
                      下一页
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={submitting}
                      onClick={() => void handleSubmit()}
                    >
                      提交答卷
                    </Button>
                  )}
                </Space>
              </footer>
            </main>
          </div>
        )}
      </Content>
    </Layout>
  );
}
