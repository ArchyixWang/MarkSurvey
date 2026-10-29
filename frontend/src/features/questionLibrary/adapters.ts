import { createQuestion } from '../surveys/schema';
import type { SurveyQuestion } from '../surveys/types';
import { newId } from '../surveys/utils';
import type { LibraryQuestionContent } from './types';

export function surveyQuestionFromLibrary(
  content: LibraryQuestionContent,
  questionId: string,
  versionId: string,
): SurveyQuestion {
  const question = createQuestion(content.type, 0);
  const base = {
    ...question,
    id: newId(),
    title: content.title,
    description: content.description,
    required: content.required_by_default,
    jump_rules: [],
    library_ref: {
      question_id: questionId,
      version_id: versionId,
      linked: true,
    },
  };

  if (content.type === 'single_choice') {
    return { ...base, type: content.type, options: content.options.map((option) => ({ ...option })) };
  }
  if (content.type === 'multiple_choice') {
    return {
      ...base,
      type: content.type,
      options: content.options.map((option) => ({ ...option })),
      min_selected: content.min_selected,
      max_selected: content.max_selected,
    };
  }
  if (content.type === 'text') {
    return {
      ...base,
      type: content.type,
      min_length: content.min_length,
      max_length: content.max_length,
    };
  }
  return {
    ...base,
    type: content.type,
    min_value: content.min_value,
    max_value: content.max_value,
    integer_only: content.integer_only,
  };
}

export function libraryContentFromSurvey(question: SurveyQuestion): LibraryQuestionContent {
  const base = {
    title: question.title,
    description: question.description ?? '',
    required_by_default: question.required,
  };
  if (question.type === 'single_choice') {
    return { ...base, type: question.type, options: question.options.map((option) => ({ ...option })) };
  }
  if (question.type === 'multiple_choice') {
    return {
      ...base,
      type: question.type,
      options: question.options.map((option) => ({ ...option })),
      min_selected: question.min_selected,
      max_selected: question.max_selected,
    };
  }
  if (question.type === 'text') {
    return {
      ...base,
      type: question.type,
      min_length: question.min_length,
      max_length: question.max_length,
    };
  }
  return {
    ...base,
    type: question.type,
    min_value: question.min_value,
    max_value: question.max_value,
    integer_only: question.integer_only,
  };
}

export function withLibraryContent(
  question: SurveyQuestion,
  content: LibraryQuestionContent,
  libraryQuestionId: string,
  versionId: string,
): SurveyQuestion {
  const replacement = surveyQuestionFromLibrary(content, libraryQuestionId, versionId);
  return {
    ...replacement,
    id: question.id,
    required: question.required,
    jump_rules: question.jump_rules,
  };
}

export function surveyContentSignature(question: SurveyQuestion): string {
  const content = libraryContentFromSurvey(question);
  const { required_by_default: _ignored, ...comparable } = content;
  return JSON.stringify(comparable);
}

export function libraryContentSignature(content: LibraryQuestionContent): string {
  const { required_by_default: _ignored, ...comparable } = content;
  return JSON.stringify(comparable);
}

