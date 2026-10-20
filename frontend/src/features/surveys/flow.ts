import type {
  JumpRule,
  MultipleChoiceQuestion,
  SurveyQuestion,
  SurveySchema,
} from './types';

export function codePointLength(value: string): number {
  return [...value].length;
}

export function multipleLimits(question: MultipleChoiceQuestion): [number, number] {
  let minimum = question.min_selected;
  if (minimum === null) {
    minimum = question.required ? 1 : 0;
  } else if (question.required) {
    minimum = Math.max(1, minimum);
  }
  return [minimum, question.max_selected ?? question.options.length];
}

function optionIds(question: SurveyQuestion): Set<string> {
  return question.type === 'single_choice' || question.type === 'multiple_choice'
    ? new Set(question.options.map((option) => option.id))
    : new Set();
}

export function answerIsComplete(question: SurveyQuestion, value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (question.type === 'single_choice') {
    return typeof value === 'string' && optionIds(question).has(value);
  }
  if (question.type === 'multiple_choice') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return false;
    }
    const selected = new Set(value as string[]);
    if (selected.size !== value.length) {
      return false;
    }
    const [minimum, maximum] = multipleLimits(question);
    return [...selected].every((item) => optionIds(question).has(item))
      && selected.size >= minimum
      && selected.size <= maximum;
  }
  if (question.type === 'text') {
    if (typeof value !== 'string') {
      return false;
    }
    if (question.required && !value.trim()) {
      return false;
    }
    if (question.min_length !== null && codePointLength(value) < question.min_length) {
      return false;
    }
    return question.max_length === null || codePointLength(value) <= question.max_length;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (question.integer_only && !Number.isInteger(value)) {
    return false;
  }
  if (question.min_value !== null && value < question.min_value) {
    return false;
  }
  return question.max_value === null || value <= question.max_value;
}

function ruleMatches(rule: JumpRule, value: unknown, question: SurveyQuestion): boolean {
  const condition = rule.condition;
  if (condition.kind === 'single') {
    return typeof value === 'string' && value === condition.option_id;
  }
  if (condition.kind === 'multi') {
    if (!Array.isArray(value)) {
      return false;
    }
    const selected = new Set(value.filter((item): item is string => typeof item === 'string'));
    const expected = new Set(condition.option_ids);
    if (condition.operator === 'any') {
      return [...expected].some((optionId) => selected.has(optionId));
    }
    if (condition.operator === 'all') {
      return [...expected].every((optionId) => selected.has(optionId));
    }
    return [...expected].every((optionId) => !selected.has(optionId));
  }
  if (question.type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (condition.min_value !== null) {
    if (condition.min_inclusive ? value < condition.min_value : value <= condition.min_value) {
      return false;
    }
  }
  if (condition.max_value !== null) {
    if (condition.max_inclusive ? value > condition.max_value : value >= condition.max_value) {
      return false;
    }
  }
  return true;
}

export function resolveJumpTarget(
  question: SurveyQuestion,
  value: unknown,
): string | null {
  if (!answerIsComplete(question, value)) {
    return null;
  }
  const targets = new Set(
    question.jump_rules
      .filter((rule) => ruleMatches(rule, value, question))
      .map((rule) => rule.target_question_id),
  );
  return targets.size === 1 ? [...targets][0] : null;
}

export function computeVisibleQuestionIds(
  schema: SurveySchema,
  answers: Record<string, unknown>,
): Set<string> {
  const positions = new Map(schema.questions.map((question, index) => [question.id, index]));
  const visible = new Set<string>();
  let index = 0;
  let guard = 0;
  while (index >= 0 && index < schema.questions.length && guard <= schema.questions.length) {
    const question = schema.questions[index];
    visible.add(question.id);
    const target = resolveJumpTarget(question, answers[question.id]);
    if (target === '__end__') {
      break;
    }
    if (target && positions.has(target)) {
      index = positions.get(target) ?? index + 1;
    } else {
      index += 1;
    }
    guard += 1;
  }
  return visible;
}

function answerError(question: SurveyQuestion): string {
  if (question.type === 'multiple_choice') {
    const [minimum, maximum] = multipleLimits(question);
    return minimum === maximum
      ? `必须选择 ${minimum} 个选项`
      : `请选择 ${minimum}–${maximum} 个选项`;
  }
  if (question.type === 'number') {
    return question.integer_only ? '请输入范围内的整数' : '请输入范围内的数字';
  }
  if (question.type === 'text') {
    const minimum = question.min_length ?? 0;
    const maximum = question.max_length;
    if (maximum !== null) {
      return `请输入 ${minimum}–${maximum} 个字符`;
    }
    return minimum > 0 ? `至少输入 ${minimum} 个字符` : '请输入内容';
  }
  return '请选择有效选项';
}

export function validateAnswers(
  schema: SurveySchema,
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const visible = computeVisibleQuestionIds(schema, answers);
  for (const question of schema.questions) {
    if (!visible.has(question.id)) {
      continue;
    }
    const value = answers[question.id];
    const present = value !== undefined && value !== null && value !== '';
    if (question.required && !present) {
      errors[question.id] = question.type === 'text' ? '请填写本题' : answerError(question);
      continue;
    }
    if (present && !answerIsComplete(question, value)) {
      errors[question.id] = answerError(question);
    }
  }
  return errors;
}
