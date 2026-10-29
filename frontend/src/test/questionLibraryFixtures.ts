import type {
  LibraryQuestionContent,
  LibraryQuestionDetail,
  LibraryQuestionShare,
  LibraryQuestionStatistics,
  LibraryTextValues,
  LibraryVersion,
  QuestionUsage,
  SharedLibraryQuestion,
  ShareInboxItem,
} from '../features/questionLibrary/types';
import type { SurveyDetail, SurveySchema } from '../features/surveys/types';
import { surveyDetail, surveySchema } from './surveyFixtures';

export const librarySingleContent: LibraryQuestionContent = {
  type: 'single_choice',
  title: '常用选择题',
  description: '请选择一个答案',
  required_by_default: true,
  options: [
    { id: 'la', label: '选项甲' },
    { id: 'lb', label: '选项乙' },
  ],
};

export const libraryVersionOne: LibraryVersion = {
  id: 'qver-1',
  version_number: 1,
  title: '常用选择题',
  question_type: 'single_choice',
  origin_kind: 'initial',
  base_version_id: null,
  base_version_number: null,
  restored_from_version_id: null,
  restored_from_version_number: null,
  shared_from_question_id: null,
  shared_from_version_id: null,
  shared_from_version_number: null,
  created_at: '2026-10-21T08:00:00Z',
  content: librarySingleContent,
};

export const libraryVersionTwo: LibraryVersion = {
  ...libraryVersionOne,
  id: 'qver-2',
  version_number: 2,
  title: '常用选择题（新版）',
  origin_kind: 'edited',
  base_version_id: 'qver-1',
  base_version_number: 1,
  created_at: '2026-10-22T08:00:00Z',
  content: {
    ...librarySingleContent,
    title: '常用选择题（新版）',
    required_by_default: false,
    options: [{ id: 'lb', label: '选项乙' }],
  },
};

export const libraryQuestionDetail: LibraryQuestionDetail = {
  id: 'lib-1',
  title: '常用选择题',
  question_type: 'single_choice',
  latest_version_id: 'qver-1',
  latest_version_number: 1,
  required_by_default: true,
  archived: false,
  usage_survey_count: 1,
  source: null,
  created_at: '2026-10-21T08:00:00Z',
  updated_at: '2026-10-21T08:00:00Z',
  latest_version: libraryVersionOne,
  version_count: 1,
};

export const libraryVersionTwoDetail: LibraryQuestionDetail = {
  ...libraryQuestionDetail,
  title: '常用选择题（新版）',
  latest_version_id: 'qver-2',
  latest_version_number: 2,
  required_by_default: false,
  updated_at: '2026-10-22T08:00:00Z',
  latest_version: libraryVersionTwo,
  version_count: 2,
};

export const libraryTextQuestion: LibraryQuestionDetail = {
  ...libraryQuestionDetail,
  id: 'lib-text',
  title: '意见反馈',
  question_type: 'text',
  latest_version_id: 'qver-text-1',
  latest_version_number: 1,
  required_by_default: false,
  usage_survey_count: 0,
  latest_version: {
    ...libraryVersionOne,
    id: 'qver-text-1',
    title: '意见反馈',
    question_type: 'text',
    content: {
      type: 'text',
      title: '意见反馈',
      description: '',
      required_by_default: false,
      min_length: 2,
      max_length: 200,
    },
  },
};

export const libraryShare: LibraryQuestionShare = {
  id: 'share-1',
  token_hint: 'token****a1b2',
  created_at: '2026-10-22T08:00:00Z',
  expires_at: null,
  revoked_at: null,
  active: true,
};

export const libraryUsage: QuestionUsage = {
  question_id: 'lib-1',
  total_surveys: 1,
  surveys: [
    {
      survey_id: 's1',
      title: surveyDetail.title,
      status: 'published',
      version_numbers: [1],
      response_count: 3,
      latest_used_at: '2026-10-22T09:00:00Z',
    },
  ],
};

export const libraryInboxItem: ShareInboxItem = {
  id: 'import-1',
  imported_at: '2026-10-23T08:00:00Z',
  source_question_id: 'source-1',
  source_question_title: '同事的题目',
  source_version_number: 2,
  source_share_active: true,
  source_share_expires_at: null,
  local_question: {
    ...libraryQuestionDetail,
    id: 'local-copy-1',
    title: '复制后的题目',
  },
};

export const sharedLibraryQuestion: SharedLibraryQuestion = {
  share_id: 'share-1',
  question_id: 'source-lib-1',
  title: '常用选择题',
  question_type: 'single_choice',
  expires_at: null,
  versions: [libraryVersionTwo, libraryVersionOne],
};

export const libraryStatistics: LibraryQuestionStatistics = {
  question_id: 'lib-1',
  title: '常用选择题',
  question_type: 'single_choice',
  version_count: 2,
  used_survey_count: 2,
  answered_count: 8,
  options: [
    {
      option_id: 'la',
      label: '选项甲',
      count: 5,
      percentage: 62.5,
      historical: true,
    },
    {
      option_id: 'lb',
      label: '选项乙',
      count: 3,
      percentage: 37.5,
      historical: false,
    },
  ],
  numeric: null,
  text_value_count: 0,
  versions: [
    {
      version_id: 'qver-2',
      version_number: 2,
      title: '常用选择题（新版）',
      answered_count: 4,
      options: [
        { option_id: 'lb', label: '选项乙', count: 4, percentage: 100, historical: false },
      ],
      numeric: null,
      text_value_count: 0,
    },
  ],
};

export const libraryTextStatistics: LibraryQuestionStatistics = {
  ...libraryStatistics,
  question_id: 'lib-text',
  title: '意见反馈',
  question_type: 'text',
  answered_count: 2,
  options: [],
  text_value_count: 2,
};

export const libraryTextValues: LibraryTextValues = {
  items: [
    {
      value: '整体体验很好',
      survey_id: 's1',
      survey_title: '满意度调查',
      survey_version_number: 2,
      question_version_number: 1,
      submitted_at: '2026-10-23T09:00:00Z',
    },
  ],
  page: 1,
  page_size: 20,
  total: 1,
};

const linkedQuestion = {
  ...surveySchema.questions[0],
  library_ref: {
    question_id: 'lib-linked',
    version_id: 'linked-ver-1',
    linked: true,
  },
};

export const linkedSurveySchema: SurveySchema = {
  ...surveySchema,
  questions: [linkedQuestion, ...surveySchema.questions.slice(1)],
};

export const linkedSurveyDetail: SurveyDetail = {
  ...surveyDetail,
  draft_schema: linkedSurveySchema,
};

export const linkedLibraryVersion: LibraryVersion = {
  ...libraryVersionOne,
  id: 'linked-ver-1',
  title: '选择路径',
  content: {
    type: 'single_choice',
    title: '选择路径',
    description: '',
    required_by_default: false,
    options: [
      { id: 'a', label: '选项 A' },
      { id: 'b', label: '选项 B' },
    ],
  },
};

export const linkedLibraryVersionTwo: LibraryVersion = {
  ...linkedLibraryVersion,
  id: 'linked-ver-2',
  version_number: 2,
  title: '选择路径新版',
  origin_kind: 'edited',
  base_version_id: 'linked-ver-1',
  base_version_number: 1,
  content: {
    type: 'single_choice',
    title: '选择路径新版',
    description: '',
    required_by_default: false,
    options: [
      { id: 'b', label: '选项 B' },
      { id: 'c', label: '选项 C' },
    ],
  },
};

export const linkedLibraryQuestion: LibraryQuestionDetail = {
  ...libraryQuestionDetail,
  id: 'lib-linked',
  title: '选择路径',
  latest_version_id: 'linked-ver-1',
  latest_version: linkedLibraryVersion,
};

