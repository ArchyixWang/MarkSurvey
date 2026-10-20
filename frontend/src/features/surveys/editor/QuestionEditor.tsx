import {
  BranchesOutlined,
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';

import { changeQuestionType } from '../schema';
import type { QuestionType, SurveyQuestion } from '../types';
import { newId, questionTypeLabels } from '../utils';
import styles from './QuestionEditor.module.css';

const { Text } = Typography;

interface QuestionEditorProps {
  question: SurveyQuestion;
  index: number;
  total: number;
  typeLocked: boolean;
  onChange: (question: SurveyQuestion) => void;
  onMove: (offset: number) => void;
  onDelete: () => void;
  onEditRules: () => void;
}

export function QuestionEditor({
  question,
  index,
  total,
  typeLocked,
  onChange,
  onMove,
  onDelete,
  onEditRules,
}: QuestionEditorProps) {
  const updateOption = (optionId: string, label: string) => {
    if (question.type !== 'single_choice' && question.type !== 'multiple_choice') {
      return;
    }
    onChange({
      ...question,
      options: question.options.map((option) =>
        option.id === optionId ? { ...option, label } : option,
      ),
    });
  };

  const addOption = () => {
    if (
      (question.type !== 'single_choice' && question.type !== 'multiple_choice')
      || question.options.length >= 20
    ) {
      return;
    }
    onChange({
      ...question,
      options: [
        ...question.options,
        { id: newId(), label: `选项 ${question.options.length + 1}` },
      ],
    });
  };

  const removeOption = (optionId: string) => {
    if (question.type !== 'single_choice' && question.type !== 'multiple_choice') {
      return;
    }
    onChange({
      ...question,
      options: question.options.filter((option) => option.id !== optionId),
    });
  };

  return (
    <Form layout="vertical" requiredMark={false} component={false}>
      <div className={styles.headerActions}>
        <Space size={4}>
          <Tooltip title="上移">
            <Button
              type="text"
              icon={<UpOutlined />}
              aria-label="上移题目"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            />
          </Tooltip>
          <Tooltip title="下移">
            <Button
              type="text"
              icon={<DownOutlined />}
              aria-label="下移题目"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            />
          </Tooltip>
          <Popconfirm
            title="删除题目？"
            description="题目及关联规则将从草稿中移除。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Tooltip title="删除题目">
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="删除题目" />
            </Tooltip>
          </Popconfirm>
        </Space>
      </div>

      <div className={styles.fieldGrid}>
        <Form.Item label="题目类型">
          <Select<QuestionType>
            value={question.type}
            disabled={typeLocked}
            aria-label="题目类型"
            options={(Object.keys(questionTypeLabels) as QuestionType[]).map((type) => ({
              value: type,
              label: questionTypeLabels[type],
            }))}
            onChange={(type) => {
              if (question.type !== type) {
                onChange(changeQuestionType(question, type));
              }
            }}
          />
        </Form.Item>
        <Form.Item label="标题">
          <Input
            value={question.title}
            aria-label="题目标题"
            maxLength={300}
            onChange={(event) => onChange({ ...question, title: event.target.value })}
          />
        </Form.Item>
      </div>

      <Form.Item label="说明">
        <Input.TextArea
          value={question.description ?? ''}
          aria-label="题目说明"
          rows={2}
          maxLength={1000}
          onChange={(event) => onChange({ ...question, description: event.target.value })}
        />
      </Form.Item>

      <div className={styles.inlineFields}>
        <Form.Item label="必答">
          <Switch
            checked={question.required}
            onChange={(required) => onChange({ ...question, required })}
          />
        </Form.Item>
        {typeLocked && (
          <Tag variant="filled" color="blue" className={styles.lockedTag}>
            已发布
          </Tag>
        )}
        {question.type !== 'text' && (
          <Button icon={<BranchesOutlined />} onClick={onEditRules} className={styles.rulesButton}>
            跳转规则 {question.jump_rules.length > 0 ? `(${question.jump_rules.length})` : ''}
          </Button>
        )}
      </div>

      {(question.type === 'single_choice' || question.type === 'multiple_choice') && (
        <section className={styles.optionsSection}>
          <Text strong className={styles.sectionTitle}>
            选项
          </Text>
          <div className={styles.options}>
            {question.options.map((option, optionIndex) => (
              <div className={styles.optionRow} key={option.id}>
                <span className={styles.order}>{optionIndex + 1}</span>
                <Input
                  value={option.label}
                  maxLength={200}
                  aria-label={`选项 ${optionIndex + 1}`}
                  onChange={(event) => updateOption(option.id, event.target.value)}
                />
                <Tooltip title="删除选项">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除选项 ${optionIndex + 1}`}
                    disabled={question.options.length <= 2}
                    onClick={() => removeOption(option.id)}
                  />
                </Tooltip>
              </div>
            ))}
          </div>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            disabled={question.options.length >= 20}
            onClick={addOption}
          >
            添加选项
          </Button>

          {question.type === 'multiple_choice' && (
            <div className={styles.limitFields}>
              <Form.Item label="最少选择">
                <InputNumber
                  min={0}
                  max={20}
                  value={question.min_selected}
                  placeholder="不限"
                  aria-label="最少选择"
                  onChange={(value) => onChange({ ...question, min_selected: value })}
                />
              </Form.Item>
              <Form.Item label="最多选择">
                <InputNumber
                  min={0}
                  max={20}
                  value={question.max_selected}
                  placeholder="不限"
                  aria-label="最多选择"
                  onChange={(value) => onChange({ ...question, max_selected: value })}
                />
              </Form.Item>
            </div>
          )}
        </section>
      )}

      {question.type === 'text' && (
        <div className={styles.limitFields}>
          <Form.Item label="最少字数">
            <InputNumber
              min={0}
              max={10000}
              value={question.min_length}
              placeholder="不限"
              aria-label="最少字数"
              onChange={(value) => onChange({ ...question, min_length: value })}
            />
          </Form.Item>
          <Form.Item label="最多字数">
            <InputNumber
              min={0}
              max={10000}
              value={question.max_length}
              placeholder="不限"
              aria-label="最多字数"
              onChange={(value) => onChange({ ...question, max_length: value })}
            />
          </Form.Item>
        </div>
      )}

      {question.type === 'number' && (
        <>
          <div className={styles.limitFields}>
            <Form.Item label="最小值">
              <InputNumber
                value={question.min_value}
                placeholder="不限"
                aria-label="最小值"
                onChange={(value) => onChange({ ...question, min_value: value })}
              />
            </Form.Item>
            <Form.Item label="最大值">
              <InputNumber
                value={question.max_value}
                placeholder="不限"
                aria-label="最大值"
                onChange={(value) => onChange({ ...question, max_value: value })}
              />
            </Form.Item>
          </div>
          <Form.Item label="仅允许整数">
            <Switch
              checked={question.integer_only}
              onChange={(integerOnly) => onChange({ ...question, integer_only: integerOnly })}
            />
          </Form.Item>
        </>
      )}
    </Form>
  );
}
