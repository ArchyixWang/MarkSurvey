import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Drawer,
  Empty,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import type {
  JumpCondition,
  JumpRule,
  SurveyQuestion,
  SurveySchema,
} from '../types';
import { END_TARGET } from '../types';
import { newId } from '../utils';
import styles from './RulesDrawer.module.css';

const { Text } = Typography;

interface RulesDrawerProps {
  open: boolean;
  question: SurveyQuestion | null;
  schema: SurveySchema;
  onClose: () => void;
  onSave: (rules: JumpRule[]) => void;
}

function defaultCondition(question: SurveyQuestion): JumpCondition {
  if (question.type === 'single_choice') {
    return { kind: 'single', option_id: question.options[0].id };
  }
  if (question.type === 'multiple_choice') {
    return { kind: 'multi', operator: 'any', option_ids: [question.options[0].id] };
  }
  return {
    kind: 'number',
    min_value: 0,
    max_value: null,
    min_inclusive: true,
    max_inclusive: true,
  };
}

function conditionValid(condition: JumpCondition): boolean {
  if (condition.kind === 'multi') {
    return condition.option_ids.length > 0;
  }
  if (condition.kind === 'number') {
    if (condition.min_value === null && condition.max_value === null) {
      return false;
    }
    return !(
      condition.min_value !== null
      && condition.max_value !== null
      && condition.min_value > condition.max_value
    );
  }
  return Boolean(condition.option_id);
}

export function RulesDrawer({ open, question, schema, onClose, onSave }: RulesDrawerProps) {
  const [rules, setRules] = useState<JumpRule[]>([]);

  useEffect(() => {
    if (open && question) {
      setRules(JSON.parse(JSON.stringify(question.jump_rules)) as JumpRule[]);
    }
  }, [open, question]);

  if (!question || question.type === 'text') {
    return null;
  }

  const questionIndex = schema.questions.findIndex((item) => item.id === question.id);
  const targets = [
    ...schema.questions.slice(questionIndex + 1).map((item) => ({
      value: item.id,
      label: item.title,
    })),
    { value: END_TARGET, label: '结束问卷' },
  ];

  const addRule = () => {
    setRules((current) => [
      ...current,
      {
        id: newId(),
        target_question_id: targets[0]?.value ?? END_TARGET,
        condition: defaultCondition(question),
      },
    ]);
  };

  const updateRule = (ruleId: string, patch: Partial<JumpRule>) => {
    setRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    );
  };

  const resetCondition = (ruleId: string) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId ? { ...rule, condition: defaultCondition(question) } : rule,
      ),
    );
  };

  const renderCondition = (rule: JumpRule) => {
    const condition = rule.condition;
    if (question.type === 'single_choice') {
      return (
        <Select
          value={condition.kind === 'single' ? condition.option_id : undefined}
          aria-label="跳转选项"
          options={question.options.map((option) => ({ value: option.id, label: option.label }))}
          onChange={(optionId) =>
            updateRule(rule.id, { condition: { kind: 'single', option_id: optionId } })
          }
        />
      );
    }
    if (question.type === 'multiple_choice') {
      const multi = condition.kind === 'multi'
        ? condition
        : { kind: 'multi' as const, operator: 'any' as const, option_ids: [] };
      return (
        <div className={styles.multiCondition}>
          <Select
            value={multi.operator}
            aria-label="多选匹配方式"
            options={[
              { value: 'any', label: '包含任意' },
              { value: 'all', label: '包含全部' },
              { value: 'none', label: '都不包含' },
            ]}
            onChange={(operator) =>
              updateRule(rule.id, { condition: { ...multi, operator } })
            }
          />
          <Select
            mode="multiple"
            value={multi.option_ids}
            aria-label="多选选项"
            maxTagCount="responsive"
            options={question.options.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(optionIds) =>
              updateRule(rule.id, { condition: { ...multi, option_ids: optionIds } })
            }
          />
        </div>
      );
    }
    const fallback = defaultCondition(question);
    const numeric = condition.kind === 'number' ? condition : fallback;
    if (numeric.kind !== 'number') {
      return null;
    }
    return (
      <div className={styles.numberCondition}>
        <InputNumber
          value={numeric.min_value}
          placeholder="最小值"
          aria-label="最小值"
          controls={false}
          onChange={(value) =>
            updateRule(rule.id, { condition: { ...numeric, min_value: value } })
          }
        />
        <InputNumber
          value={numeric.max_value}
          placeholder="最大值"
          aria-label="最大值"
          controls={false}
          onChange={(value) =>
            updateRule(rule.id, { condition: { ...numeric, max_value: value } })
          }
        />
        <Space size={12} wrap>
          <Checkbox
            checked={numeric.min_inclusive}
            onChange={(event) =>
              updateRule(rule.id, {
                condition: { ...numeric, min_inclusive: event.target.checked },
              })
            }
          >
            含下界
          </Checkbox>
          <Checkbox
            checked={numeric.max_inclusive}
            onChange={(event) =>
              updateRule(rule.id, {
                condition: { ...numeric, max_inclusive: event.target.checked },
              })
            }
          >
            含上界
          </Checkbox>
        </Space>
      </div>
    );
  };

  const allValid = rules.every(
    (rule) => conditionValid(rule.condition) && Boolean(rule.target_question_id),
  );

  return (
    <Drawer
      open={open}
      title="跳转规则"
      size={620}
      onClose={onClose}
      destroyOnHidden
      className={styles.drawer}
      footer={
        <Space className={styles.footer}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!allValid} onClick={() => onSave(rules)}>
            保存规则
          </Button>
        </Space>
      }
    >
      <div className={styles.heading}>
        <Text strong ellipsis={{ tooltip: question.title }}>
          {question.title}
        </Text>
        <Button icon={<PlusOutlined />} onClick={addRule}>
          添加规则
        </Button>
      </div>

      {rules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跳转规则" />
      ) : (
        <div className={styles.ruleList}>
          {rules.map((rule, index) => (
            <section className={styles.ruleCard} key={rule.id}>
              <div className={styles.ruleHeader}>
                <Text strong>规则 {index + 1}</Text>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`删除规则 ${index + 1}`}
                  onClick={() =>
                    setRules((current) => current.filter((item) => item.id !== rule.id))
                  }
                />
              </div>
              <div className={styles.ruleFields}>
                <label>
                  <span>条件</span>
                  {renderCondition(rule)}
                </label>
                <label>
                  <span>跳转至</span>
                  <Select
                    value={rule.target_question_id}
                    aria-label="跳转目标"
                    options={targets}
                    onChange={(target) => updateRule(rule.id, { target_question_id: target })}
                  />
                </label>
              </div>
              <Button type="link" size="small" onClick={() => resetCondition(rule.id)}>
                重置条件
              </Button>
            </section>
          ))}
        </div>
      )}
    </Drawer>
  );
}
