export type SurveyStatus = 'draft' | 'published' | 'closed' | 'expired';
export type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'number';
export type PresentationMode = 'continuous' | 'paged';

export interface SurveyOption {
  id: string;
  label: string;
}

export interface SingleJumpCondition {
  kind: 'single';
  option_id: string;
}

export interface MultiJumpCondition {
  kind: 'multi';
  operator: 'any' | 'all' | 'none';
  option_ids: string[];
}

export interface NumberJumpCondition {
  kind: 'number';
  min_value: number | null;
  max_value: number | null;
  min_inclusive: boolean;
  max_inclusive: boolean;
}

export type JumpCondition = SingleJumpCondition | MultiJumpCondition | NumberJumpCondition;

export interface JumpRule {
  id: string;
  target_question_id: string;
  condition: JumpCondition;
}

export interface LibraryReference {
  question_id: string;
  version_id: string;
  linked: boolean;
}

interface QuestionBase {
  id: string;
  title: string;
  description?: string;
  required: boolean;
  library_ref?: LibraryReference | null;
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: 'single_choice';
  options: SurveyOption[];
  jump_rules: JumpRule[];
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  options: SurveyOption[];
  min_selected: number | null;
  max_selected: number | null;
  jump_rules: JumpRule[];
}

export interface TextQuestion extends QuestionBase {
  type: 'text';
  min_length: number | null;
  max_length: number | null;
  jump_rules: JumpRule[];
}

export interface NumberQuestion extends QuestionBase {
  type: 'number';
  min_value: number | null;
  max_value: number | null;
  integer_only: boolean;
  jump_rules: JumpRule[];
}

export type SurveyQuestion =
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | TextQuestion
  | NumberQuestion;

export interface SurveyPage {
  id: string;
  title: string;
  question_ids: string[];
}

export interface SurveySchema {
  schema_version: 1;
  title: string;
  description: string;
  allow_anonymous: boolean;
  allow_multiple_responses: boolean;
  presentation: { mode: PresentationMode };
  pages: SurveyPage[];
  questions: SurveyQuestion[];
}

export interface SurveyCreatePayload {
  title: string;
  description: string;
  allow_anonymous: boolean;
}

export interface SurveySummary {
  id: string;
  title: string;
  short_code: string;
  status: SurveyStatus;
  deadline_at: string | null;
  active_version_number: number | null;
  response_count: number;
  has_unpublished_changes: boolean;
  created_at: string;
  updated_at: string;
}

export interface SurveyListResponse {
  items: SurveySummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface SurveyDetail extends SurveySummary {
  draft_schema: SurveySchema;
  draft_revision: number;
  active_version_id: string | null;
  published_at: string | null;
  closed_at: string | null;
}

export interface SurveyVersionSummary {
  id: string;
  version_number: number;
  schema_hash: string;
  created_at: string;
  active: boolean;
}

export interface SurveyVersion extends SurveyVersionSummary {
  schema: SurveySchema;
}

export interface AttemptSummary {
  attempt_id: string;
  version_id: string;
  version_number: number;
  revision: number;
  answers: Record<string, unknown>;
  current_question_id: string | null;
  updated_at: string;
}

export interface PublicSurvey {
  short_code: string;
  title: string;
  status: SurveyStatus;
  deadline_at: string | null;
  can_fill: boolean;
  active_version_number: number | null;
  survey_schema: SurveySchema | null;
  existing_attempt: AttemptSummary | null;
  completed: boolean;
  can_start_new: boolean;
}

export interface Attempt extends AttemptSummary {
  short_code: string;
  survey_schema: SurveySchema;
}

export interface AttemptSaved {
  revision: number;
  updated_at: string;
}

export interface Submission {
  response_id: string;
  submitted_at: string;
}

export interface OptionStatistic {
  option_id: string;
  label: string;
  count: number;
  percentage: number;
}

export interface NumericStatistic {
  count: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface QuestionStatistic {
  question_id: string;
  title: string;
  type: QuestionType;
  answered_count: number;
  options: OptionStatistic[];
  numeric: NumericStatistic | null;
  text_value_count: number;
}

export interface SurveyStatistics {
  survey_id: string;
  active_version_number: number;
  submitted_responses: number;
  unique_respondents: number;
  questions: QuestionStatistic[];
}

export interface TextValue {
  value: string;
  submitted_at: string;
}

export interface TextValues {
  items: TextValue[];
  page: number;
  page_size: number;
  total: number;
}

export const END_TARGET = '__end__';
