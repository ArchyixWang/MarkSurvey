import type {
  PublicSurvey,
  SurveyDetail,
  SurveySchema,
  SurveyStatistics,
  SurveyVersion,
  SurveyVersionSummary,
} from '../features/surveys/types';

export const surveySchema: SurveySchema = {
  schema_version: 1,
  title: '满意度调查',
  description: '请完成以下问题',
  allow_anonymous: false,
  allow_multiple_responses: false,
  presentation: { mode: 'continuous' },
  pages: [],
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      title: '选择路径',
      description: '',
      required: false,
      options: [
        { id: 'a', label: '选项 A' },
        { id: 'b', label: '选项 B' },
      ],
      jump_rules: [
        {
          id: 'rule-1',
          target_question_id: 'q3',
          condition: { kind: 'single', option_id: 'a' },
        },
      ],
    },
    {
      id: 'q2',
      type: 'single_choice',
      title: '隐藏题目',
      description: '',
      required: true,
      options: [
        { id: 'c', label: '选项 C' },
        { id: 'd', label: '选项 D' },
      ],
      jump_rules: [],
    },
    {
      id: 'q3',
      type: 'text',
      title: '补充说明',
      description: '',
      required: true,
      min_length: 2,
      max_length: 20,
      jump_rules: [],
    },
  ],
};

export const surveyDetail: SurveyDetail = {
  id: 's1',
  title: surveySchema.title,
  short_code: 'Abc1234567',
  status: 'published',
  deadline_at: null,
  active_version_number: 1,
  response_count: 3,
  has_unpublished_changes: false,
  created_at: '2026-10-20T08:00:00Z',
  updated_at: '2026-10-20T09:00:00Z',
  draft_schema: surveySchema,
  draft_revision: 2,
  active_version_id: 'v1',
  published_at: '2026-10-20T09:00:00Z',
  closed_at: null,
};

export const versionSummary: SurveyVersionSummary = {
  id: 'v1',
  version_number: 1,
  schema_hash: 'hash-1',
  created_at: '2026-10-20T09:00:00Z',
  active: true,
};

export const surveyVersion: SurveyVersion = {
  ...versionSummary,
  schema: surveySchema,
};

export const publicSurvey: PublicSurvey = {
  short_code: 'Abc1234567',
  title: surveySchema.title,
  status: 'published',
  deadline_at: null,
  can_fill: true,
  active_version_number: 1,
  survey_schema: surveySchema,
  existing_attempt: {
    attempt_id: 'attempt-1',
    version_id: 'v1',
    version_number: 1,
    revision: 1,
    answers: {},
    current_question_id: 'q1',
    updated_at: '2026-10-20T09:00:00Z',
  },
  completed: false,
  can_start_new: false,
};

export const surveyStatistics: SurveyStatistics = {
  survey_id: 's1',
  active_version_number: 1,
  submitted_responses: 3,
  unique_respondents: 2,
  questions: [
    {
      question_id: 'q1',
      title: '选择路径',
      type: 'single_choice',
      answered_count: 3,
      options: [
        { option_id: 'a', label: '选项 A', count: 2, percentage: 66.67 },
        { option_id: 'b', label: '选项 B', count: 1, percentage: 33.33 },
      ],
      numeric: null,
      text_value_count: 0,
    },
    {
      question_id: 'q3',
      title: '补充说明',
      type: 'text',
      answered_count: 2,
      options: [],
      numeric: null,
      text_value_count: 2,
    },
  ],
};
