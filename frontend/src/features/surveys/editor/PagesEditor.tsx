import { MergeCellsOutlined, PlusOutlined, SplitCellsOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Tag, Tooltip, Typography } from 'antd';

import {
  appendPage,
  createPagedLayout,
  mergePageWithPrevious,
  splitPage,
} from '../schema';
import type { SurveySchema } from '../types';
import styles from './PagesEditor.module.css';

const { Text } = Typography;

interface PagesEditorProps {
  schema: SurveySchema;
  onChange: (schema: SurveySchema) => void;
}

export function PagesEditor({ schema, onChange }: PagesEditorProps) {
  if (schema.presentation.mode !== 'paged') {
    return (
      <div className={styles.continuous}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="连续展示不使用页面" />
        <Button
          onClick={() =>
            onChange({
              ...schema,
              presentation: { mode: 'paged' },
              pages: createPagedLayout(schema.questions),
            })
          }
        >
          切换为分页
        </Button>
      </div>
    );
  }

  const questionMap = new Map(schema.questions.map((question) => [question.id, question]));
  const lastPage = schema.pages[schema.pages.length - 1];
  const canAppend = Boolean(lastPage && lastPage.question_ids.length > 1);

  const updateTitle = (pageIndex: number, title: string) => {
    onChange({
      ...schema,
      pages: schema.pages.map((page, index) =>
        index === pageIndex ? { ...page, title } : page,
      ),
    });
  };

  return (
    <div className={styles.pages}>
      <div className={styles.toolbar}>
        <Button
          icon={<PlusOutlined />}
          disabled={!canAppend}
          onClick={() => onChange(appendPage(schema))}
        >
          新增页面
        </Button>
        <Text type="secondary">{schema.pages.length} 个页面</Text>
      </div>

      {schema.pages.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面" />
      ) : (
        <div className={styles.pageList}>
          {schema.pages.map((page, pageIndex) => (
            <section className={styles.pageCard} key={page.id}>
              <div className={styles.pageHeader}>
                <div className={styles.pageTitleGroup}>
                  <Tag variant="filled" color="blue">
                    第 {pageIndex + 1} 页
                  </Tag>
                  <Input
                    value={page.title}
                    aria-label={`第 ${pageIndex + 1} 页标题`}
                    maxLength={120}
                    onChange={(event) => updateTitle(pageIndex, event.target.value)}
                  />
                </div>
                {pageIndex > 0 && (
                  <Tooltip title="并入上一页">
                    <Button
                      type="text"
                      icon={<MergeCellsOutlined />}
                      aria-label="并入上一页"
                      onClick={() => onChange(mergePageWithPrevious(schema, pageIndex))}
                    />
                  </Tooltip>
                )}
              </div>
              <div className={styles.questionList}>
                {page.question_ids.map((questionId, questionIndex) => {
                  const question = questionMap.get(questionId);
                  if (!question) {
                    return null;
                  }
                  return (
                    <div className={styles.questionRow} key={questionId}>
                      <span className={styles.order}>{questionIndex + 1}</span>
                      <Text ellipsis={{ tooltip: question.title }}>{question.title}</Text>
                      {questionIndex > 0 && (
                        <Tooltip title="从此题起分页">
                          <Button
                            type="text"
                            size="small"
                            icon={<SplitCellsOutlined />}
                            aria-label={`将 ${question.title} 拆分为新页`}
                            onClick={() => onChange(splitPage(schema, pageIndex, questionIndex))}
                          />
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
