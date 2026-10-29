import type {
  MultipleChoiceQuestion,
  NumberQuestion,
  QuestionType,
  SingleChoiceQuestion,
  SurveyOption,
  SurveyPage,
  SurveyQuestion,
  SurveySchema,
  TextQuestion,
} from './types';
import { newId } from './utils';

function createOptions(): SurveyOption[] {
  return [
    { id: newId(), label: '选项 1' },
    { id: newId(), label: '选项 2' },
  ];
}

export function createQuestion(type: QuestionType, index: number): SurveyQuestion {
  const base = {
    id: newId(),
    title: `题目 ${index + 1}`,
    description: '',
    required: false,
    jump_rules: [],
  };
  if (type === 'single_choice') {
    return { ...base, type, options: createOptions() } satisfies SingleChoiceQuestion;
  }
  if (type === 'multiple_choice') {
    return {
      ...base,
      type,
      options: createOptions(),
      min_selected: null,
      max_selected: null,
    } satisfies MultipleChoiceQuestion;
  }
  if (type === 'text') {
    return {
      ...base,
      type,
      min_length: null,
      max_length: null,
    } satisfies TextQuestion;
  }
  return {
    ...base,
    type,
    min_value: null,
    max_value: null,
    integer_only: false,
  } satisfies NumberQuestion;
}

export function changeQuestionType(
  question: SurveyQuestion,
  type: QuestionType,
): SurveyQuestion {
  const replacement = createQuestion(type, 0);
  return {
    ...replacement,
    id: question.id,
    title: question.title,
    description: question.description ?? '',
    required: question.required,
    library_ref: question.library_ref,
  };
}

export interface PageLayout {
  id: string;
  title: string;
  size: number;
}

export function pageLayout(schema: SurveySchema): PageLayout[] {
  return schema.pages.map((page) => ({
    id: page.id,
    title: page.title,
    size: page.question_ids.length,
  }));
}

export function buildPages(questions: SurveyQuestion[], layout: PageLayout[]): SurveyPage[] {
  if (questions.length === 0) {
    return [];
  }
  const pages: SurveyPage[] = [];
  let cursor = 0;
  for (const item of layout) {
    if (cursor >= questions.length) {
      break;
    }
    const size = Math.max(0, Math.min(item.size, questions.length - cursor));
    if (size === 0) {
      continue;
    }
    const questionIds = questions.slice(cursor, cursor + size).map((question) => question.id);
    pages.push({ id: item.id, title: item.title, question_ids: questionIds });
    cursor += size;
  }
  if (cursor < questions.length) {
    const remaining = questions.slice(cursor).map((question) => question.id);
    if (pages.length > 0) {
      pages[pages.length - 1].question_ids.push(...remaining);
    } else {
      pages.push({ id: newId(), title: '第 1 页', question_ids: remaining });
    }
  }
  return pages;
}

export function createPagedLayout(questions: SurveyQuestion[]): SurveyPage[] {
  if (questions.length === 0) {
    return [];
  }
  return [
    {
      id: newId(),
      title: '第 1 页',
      question_ids: questions.map((question) => question.id),
    },
  ];
}

export function syncPagesAfterReorder(
  questions: SurveyQuestion[],
  pages: SurveyPage[],
): SurveyPage[] {
  if (questions.length === 0) {
    return [];
  }
  const layout = pages.map((page) => ({
    id: page.id,
    title: page.title,
    size: page.question_ids.length,
  }));
  if (layout.length === 0) {
    return createPagedLayout(questions);
  }
  return buildPages(questions, layout);
}

export function syncPagesAfterDelete(
  questions: SurveyQuestion[],
  pages: SurveyPage[],
): SurveyPage[] {
  const ids = new Set(questions.map((question) => question.id));
  const cleaned = pages
    .map((page) => ({ ...page, question_ids: page.question_ids.filter((id) => ids.has(id)) }))
    .filter((page) => page.question_ids.length > 0);
  if (questions.length === 0) {
    return [];
  }
  if (cleaned.length === 0) {
    return createPagedLayout(questions);
  }
  const known = new Set(cleaned.flatMap((page) => page.question_ids));
  const missing = questions.map((question) => question.id).filter((id) => !known.has(id));
  if (missing.length > 0) {
    cleaned[cleaned.length - 1].question_ids.push(...missing);
  }
  return cleaned;
}

export function splitPage(
  schema: SurveySchema,
  pageIndex: number,
  splitIndex: number,
): SurveySchema {
  if (schema.presentation.mode !== 'paged') {
    return schema;
  }
  const page = schema.pages[pageIndex];
  if (!page || splitIndex <= 0 || splitIndex >= page.question_ids.length) {
    return schema;
  }
  const layout = pageLayout(schema);
  const current = layout[pageIndex];
  const next: PageLayout[] = [
    ...layout.slice(0, pageIndex),
    { ...current, size: splitIndex },
    { id: newId(), title: `第 ${layout.length + 1} 页`, size: current.size - splitIndex },
    ...layout.slice(pageIndex + 1),
  ];
  return { ...schema, pages: buildPages(schema.questions, next) };
}

export function mergePageWithPrevious(schema: SurveySchema, pageIndex: number): SurveySchema {
  if (schema.presentation.mode !== 'paged' || pageIndex <= 0) {
    return schema;
  }
  const layout = pageLayout(schema);
  const previous = layout[pageIndex - 1];
  const current = layout[pageIndex];
  const next: PageLayout[] = [
    ...layout.slice(0, pageIndex - 1),
    { ...previous, size: previous.size + current.size },
    ...layout.slice(pageIndex + 1),
  ];
  return { ...schema, pages: buildPages(schema.questions, next) };
}

export function appendPage(schema: SurveySchema): SurveySchema {
  if (schema.presentation.mode !== 'paged' || schema.questions.length === 0) {
    return schema;
  }
  const layout = pageLayout(schema);
  if (layout.length === 0) {
    return { ...schema, pages: createPagedLayout(schema.questions) };
  }
  const last = layout[layout.length - 1];
  if (last.size <= 1) {
    return schema;
  }
  const next = [
    ...layout.slice(0, -1),
    { ...last, size: last.size - 1 },
    { id: newId(), title: `第 ${layout.length + 1} 页`, size: 1 },
  ];
  return { ...schema, pages: buildPages(schema.questions, next) };
}

export function removeDanglingRules(question: SurveyQuestion): SurveyQuestion {
  if (question.type === 'text') {
    return { ...question, jump_rules: [] };
  }
  if (question.type === 'number') {
    return question;
  }
  const ids = new Set(question.options.map((option) => option.id));
  const rules = question.jump_rules.flatMap((rule) => {
    if (rule.condition.kind === 'single' && !ids.has(rule.condition.option_id)) {
      return [];
    }
    if (rule.condition.kind === 'multi') {
      const optionIds = rule.condition.option_ids.filter((id) => ids.has(id));
      if (optionIds.length === 0) {
        return [];
      }
      return [{ ...rule, condition: { ...rule.condition, option_ids: optionIds } }];
    }
    return [rule];
  });
  return { ...question, jump_rules: rules };
}

export function pruneForwardRules(questions: SurveyQuestion[]): SurveyQuestion[] {
  const positions = new Map(questions.map((question, index) => [question.id, index]));
  return questions.map((question) => {
    const position = positions.get(question.id) ?? -1;
    return {
      ...question,
      jump_rules: question.jump_rules.filter(
        (rule) =>
          rule.target_question_id === '__end__'
          || (positions.get(rule.target_question_id) ?? -1) > position,
      ),
    };
  });
}
