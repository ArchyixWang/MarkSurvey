import { describe, expect, it } from 'vitest';

import {
  codePointLength,
  computeVisibleQuestionIds,
  validateAnswers,
} from '../features/surveys/flow';
import { surveySchema } from './surveyFixtures';

describe('survey flow helpers', () => {
  it('keeps only the active path after a single-choice jump', () => {
    const visible = computeVisibleQuestionIds(surveySchema, { q1: 'a' });
    expect([...visible]).toEqual(['q1', 'q3']);
    const normalPath = computeVisibleQuestionIds(surveySchema, { q1: 'b' });
    expect([...normalPath]).toEqual(['q1', 'q2', 'q3']);
  });

  it('validates only required questions on the active path', () => {
    const errors = validateAnswers(surveySchema, { q1: 'a' });
    expect(errors.q2).toBeUndefined();
    expect(errors.q3).toBe('请填写本题');
  });

  it('counts text limits by Unicode code point', () => {
    expect(codePointLength('😀问卷')).toBe(3);
    const errors = validateAnswers(surveySchema, { q1: 'a', q3: '😀😀' });
    expect(errors.q3).toBeUndefined();
  });
});
