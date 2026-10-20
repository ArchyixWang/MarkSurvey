import {
  Checkbox,
  Form,
  Input,
  InputNumber,
  Radio,
  Tag,
  Typography,
} from 'antd';

import { codePointLength } from '../flow';
import type { SurveyQuestion } from '../types';
import { questionTypeLabels } from '../utils';
import styles from './FillQuestion.module.css';

const { Text } = Typography;

interface FillQuestionProps {
  question: SurveyQuestion;
  index: number;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onCommit: (value: unknown) => void;
}

export function FillQuestion({
  question,
  index,
  value,
  error,
  onChange,
  onCommit,
}: FillQuestionProps) {
  const label = (
    <div className={styles.label}>
      <span className={styles.number}>{index + 1}</span>
      <div className={styles.labelText}>
        <div className={styles.titleRow}>
          <Text strong>{question.title}</Text>
          <Tag variant="filled" color="blue">
            {questionTypeLabels[question.type]}
          </Tag>
        </div>
        {question.description && (
          <Text type="secondary" className={styles.description}>
            {question.description}
          </Text>
        )}
      </div>
    </div>
  );

  const renderControl = () => {
    if (question.type === 'single_choice') {
      return (
        <Radio.Group
          value={typeof value === 'string' ? value : undefined}
          className={styles.choiceGroup}
          onChange={(event) => onChange(event.target.value)}
        >
          {question.options.map((option) => (
            <Radio key={option.id} value={option.id}>
              {option.label}
            </Radio>
          ))}
        </Radio.Group>
      );
    }
    if (question.type === 'multiple_choice') {
      return (
        <Checkbox.Group
          value={Array.isArray(value) ? (value as string[]) : []}
          className={styles.choiceGroup}
          onChange={(checked) => onChange(checked)}
        >
          {question.options.map((option) => (
            <Checkbox key={option.id} value={option.id}>
              {option.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    }
    if (question.type === 'text') {
      const text = typeof value === 'string' ? value : '';
      return (
        <div className={styles.textField}>
          <Input.TextArea
            value={text}
            aria-label={question.title}
            rows={4}
            onChange={(event) => onChange(event.target.value)}
          />
          {(question.min_length !== null || question.max_length !== null) && (
            <Text type="secondary" className={styles.counter}>
              {codePointLength(text)}
              {question.max_length !== null ? ` / ${question.max_length}` : ''} 字符
            </Text>
          )}
        </div>
      );
    }
    return (
      <InputNumber
        value={typeof value === 'number' ? value : null}
        aria-label={question.title}
        className={styles.numberField}
        min={question.min_value ?? undefined}
        max={question.max_value ?? undefined}
        precision={question.integer_only ? 0 : undefined}
        onChange={(nextValue) => onChange(nextValue)}
        onBlur={() => onCommit(value)}
        onPressEnter={() => onCommit(value)}
      />
    );
  };

  return (
    <Form layout="vertical" requiredMark={false} component={false}>
      <article className={styles.question} id={`question-${question.id}`}>
        <Form.Item
          required={question.required}
          label={label}
          validateStatus={error ? 'error' : undefined}
          help={error}
          className={styles.formItem}
        >
          {renderControl()}
        </Form.Item>
      </article>
    </Form>
  );
}
