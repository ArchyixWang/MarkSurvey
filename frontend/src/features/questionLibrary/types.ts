import type { QuestionType, SurveyOption, SurveyStatus } from '../surveys/types';

export interface LibraryQuestionSource {
  kind: 'derived' | 'shared_copy';
  question_id: string;
  question_title: string;
  version_id: string;
  version_number: number;
}

interface LibraryQuestionBaseContent {
  title: string;
  description: string;
  required_by_default: boolean;
}

export interface LibrarySingleChoiceContent extends LibraryQuestionBaseContent {
  type: 'single_choice';
  options: SurveyOption[];
}

export interface LibraryMultipleChoiceContent extends LibraryQuestionBaseContent {
  type: 'multiple_choice';
  options: SurveyOption[];
  min_selected: number | null;
  max_selected: number | null;
}

export interface LibraryTextContent extends LibraryQuestionBaseContent {
  type: 'text';
  min_length: number | null;
  max_length: number | null;
}

export interface LibraryNumberContent extends LibraryQuestionBaseContent {
  type: 'number';
  min_value: number | null;
  max_value: number | null;
  integer_only: boolean;
}

export type LibraryQuestionContent =
  | LibrarySingleChoiceContent
  | LibraryMultipleChoiceContent
  | LibraryTextContent
  | LibraryNumberContent;

export type LibraryVersionOrigin =
  | 'initial'
  | 'edited'
  | 'restored'
  | 'shared_copy'
  | 'derived_initial';

export interface LibraryQuestionSummary {
  id: string;
  title: string;
  question_type: QuestionType;
  latest_version_id: string;
  latest_version_number: number;
  required_by_default: boolean;
  archived: boolean;
  usage_survey_count: number;
  source: LibraryQuestionSource | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryQuestionListResponse {
  items: LibraryQuestionSummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface LibraryVersionSummary {
  id: string;
  version_number: number;
  title: string;
  question_type: QuestionType;
  origin_kind: LibraryVersionOrigin;
  base_version_id: string | null;
  base_version_number: number | null;
  restored_from_version_id: string | null;
  restored_from_version_number: number | null;
  shared_from_question_id: string | null;
  shared_from_version_id: string | null;
  shared_from_version_number: number | null;
  created_at: string;
}

export interface LibraryVersion extends LibraryVersionSummary {
  content: LibraryQuestionContent;
}

export interface LibraryQuestionDetail extends LibraryQuestionSummary {
  latest_version: LibraryVersion;
  version_count: number;
}

export interface LibraryQuestionShare {
  id: string;
  token_hint: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
}

export interface CreatedLibraryShare {
  share: LibraryQuestionShare;
  token: string;
  url: string;
}

export interface LibraryShareList {
  items: LibraryQuestionShare[];
}

export interface SharedLibraryQuestion {
  share_id: string;
  question_id: string;
  title: string;
  question_type: QuestionType;
  expires_at: string | null;
  versions: LibraryVersion[];
}

export interface LibraryImport {
  import_id: string;
  local_question: LibraryQuestionDetail;
}

export interface ShareInboxItem {
  id: string;
  imported_at: string;
  source_question_id: string;
  source_question_title: string;
  source_version_number: number;
  source_share_active: boolean;
  source_share_expires_at: string | null;
  local_question: LibraryQuestionSummary;
}

export interface ShareInboxResponse {
  items: ShareInboxItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface QuestionUsageSurvey {
  survey_id: string;
  title: string;
  status: SurveyStatus;
  version_numbers: number[];
  response_count: number;
  latest_used_at: string;
}

export interface QuestionUsage {
  question_id: string;
  total_surveys: number;
  surveys: QuestionUsageSurvey[];
}

export interface LibraryOptionStatistic {
  option_id: string;
  label: string;
  count: number;
  percentage: number;
  historical: boolean;
}

export interface LibraryNumericStatistic {
  count: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface LibraryVersionStatistics {
  version_id: string;
  version_number: number;
  title: string;
  answered_count: number;
  options: LibraryOptionStatistic[];
  numeric: LibraryNumericStatistic | null;
  text_value_count: number;
}

export interface LibraryQuestionStatistics {
  question_id: string;
  title: string;
  question_type: QuestionType;
  version_count: number;
  used_survey_count: number;
  answered_count: number;
  options: LibraryOptionStatistic[];
  numeric: LibraryNumericStatistic | null;
  text_value_count: number;
  versions: LibraryVersionStatistics[];
}

export interface LibraryTextValue {
  value: string;
  survey_id: string;
  survey_title: string;
  survey_version_number: number;
  question_version_number: number;
  submitted_at: string;
}

export interface LibraryTextValues {
  items: LibraryTextValue[];
  page: number;
  page_size: number;
  total: number;
}

export interface LibraryQuestionListQuery {
  page: number;
  page_size: number;
  search?: string;
  question_type?: QuestionType;
  archived?: boolean;
}

