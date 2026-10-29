import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  Tooltip,
} from 'antd';
import { useEffect, useState } from 'react';

import { questionTypeLabels } from '../../surveys/utils';
import { newId } from '../../surveys/utils';
import type { QuestionType, SurveyOption } from '../../surveys/types';
import type { LibraryQuestionContent } from '../types';
import styles from './QuestionContentModal.module.css';

interface ContentFormValues {
  type: QuestionType;
  title: string;
  description?: string;
  required_by_default?: boolean;
  min_selected?: number | null;
  max_selected?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  integer_only?: boolean;
}

interface QuestionContentModalProps {
  open: boolean;
  title: string;
  okText: string;
  initial?: LibraryQuestionContent | null;
  initialType?: QuestionType;
  typeLocked?: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (content: LibraryQuestionContent) => Promise<void> | void;
}

function defaultOptions(): SurveyOption[] {
  return [
    { id: newId(), label: '选项 1' },
    { id: newId(), label: '选项 2' },
  ];
}

function formValues(content?: LibraryQuestionContent | null, type: QuestionType = 'single_choice') {
  const base: ContentFormValues = {
    type: content?.type ?? type,
    title: content?.title ?? '',
    description: content?.description ?? '',
    required_by_default: content?.required_by_default ?? false,
  };
  if (content?.type === 'multiple_choice') {
    return {
      ...base,
      min_selected: content.min_selected,
      max_selected: content.max_selected,
    };
  }
  if (content?.type === 'text') {
    return { ...base, min_length: content.min_length, max_length: content.max_length };
  }
  if (content?.type === 'number') {
    return {
      ...base,
      min_value: content.min_value,
      max_value: content.max_value,
      integer_only: content.integer_only,
    };
  }
  return base;
}

function optionsFor(content?: LibraryQuestionContent | null): SurveyOption[] {
  if (content?.type === 'single_choice' || content?.type === 'multiple_choice') {
    return content.options.map((option) => ({ ...option }));
  }
  return defaultOptions();
}

export function QuestionContentModal({
  open,
  title,
  okText,
  initial,
  initialType = 'single_choice',
  typeLocked = false,
  submitting = false,
  onCancel,
  onSubmit,
}: QuestionContentModalProps) {
  const [form] = Form.useForm<ContentFormValues>();
  const type = Form.useWatch('type', form) ?? initial?.type ?? initialType;
  const [options, setOptions] = useState<SurveyOption[]>(optionsFor(initial));
  const [optionError, setOptionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue(formValues(initial, initialType));
    setOptions(optionsFor(initial));
    setOptionError(null);
  }, [form, initial, initialType, open]);

  const handleTypeChange = (nextType: QuestionType) => {
    form.setFieldValue('type', nextType);
    form.setFieldsValue({
      min_selected: null,
      max_selected: null,
      min_length: null,
      max_length: null,
      min_value: null,
      max_value: null,
      integer_only: false,
    });
    if (nextType === 'single_choice' || nextType === 'multiple_choice') {
      setOptions(defaultOptions());
    }
    setOptionError(null);
  };

  const updateOption = (optionId: string, label: string) => {
    setOptions((current) =>
      current.map((option) => (option.id === optionId ? { ...option, label } : option)),
    );
    setOptionError(null);
  };

  const removeOption = (optionId: string) => {
    setOptions((current) => current.filter((option) => option.id !== optionId));
  };

  const buildContent = (values: ContentFormValues): LibraryQuestionContent => {
    const base = {
      title: values.title.trim(),
      description: values.description?.trim() ?? '',
      required_by_default: Boolean(values.required_by_default),
    };
    if (values.type === 'single_choice') {
      return { ...base, type: values.type, options };
    }
    if (values.type === 'multiple_choice') {
      return {
        ...base,
        type: values.type,
        options,
        min_selected: values.min_selected ?? null,
        max_selected: values.max_selected ?? null,
      };
    }
    if (values.type === 'text') {
      return {
        ...base,
        type: values.type,
        min_length: values.min_length ?? null,
        max_length: values.max_length ?? null,
      };
    }
    return {
      ...base,
      type: values.type,
      min_value: values.min_value ?? null,
      max_value: values.max_value ?? null,
      integer_only: Boolean(values.integer_only),
    };
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (values.type === 'single_choice' || values.type === 'multiple_choice') {
      if (options.length < 2 || options.length > 20) {
        setOptionError('选项数量需为 2–20 个');
        return;
      }
      if (options.some((option) => !option.label.trim())) {
        setOptionError('选项文案不能为空');
        return;
      }
      if (new Set(options.map((option) => option.label.trim().toLocaleLowerCase())).size !== options.length) {
        setOptionError('选项文案不能重复');
        return;
      }
    }
    setOptionError(null);
    await onSubmit(buildContent(values));
  };

  return (
    <Modal
      open={open}
      title={title}
      width={640}
      okText={okText}
      cancelText="取消"
      confirmLoading={submitting}
      onOk={() => void submit()}
      onCancel={onCancel}
      destroyOnHidden
      forceRender
      styles={{ body: { maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' } }}
    >
      <Form form={form} layout="vertical" requiredMark={false} className={styles.form}>
        <div className={styles.twoColumns}>
          <Form.Item label="题目类型" name="type">
            <Select<QuestionType>
              disabled={typeLocked}
              onChange={handleTypeChange}
              options={(Object.keys(questionTypeLabels) as QuestionType[]).map((key) => ({
                value: key,
                label: questionTypeLabels[key],
              }))}
            />
          </Form.Item>
          <Form.Item
            label="标题"
            name="title"
            rules={[
              { required: true, message: '请输入题目标题' },
              { max: 300, message: '标题最多 300 个字符' },
            ]}
          >
            <Input maxLength={300} placeholder="题目标题" />
          </Form.Item>
        </div>

        <Form.Item
          label="说明"
          name="description"
          rules={[{ max: 1000, message: '说明最多 1000 个字符' }]}
        >
          <Input.TextArea rows={2} maxLength={1000} placeholder="题目说明" />
        </Form.Item>

        <Form.Item label="默认必答" name="required_by_default" valuePropName="checked">
          <Switch />
        </Form.Item>

        {(type === 'single_choice' || type === 'multiple_choice') && (
          <Form.Item
            label="选项"
            validateStatus={optionError ? 'error' : undefined}
            help={optionError}
          >
            <div className={styles.options}>
              {options.map((option, index) => (
                <div className={styles.optionRow} key={option.id}>
                  <span className={styles.optionIndex}>{index + 1}</span>
                  <Input
                    value={option.label}
                    maxLength={200}
                    aria-label={`选项 ${index + 1}`}
                    onChange={(event) => updateOption(option.id, event.target.value)}
                  />
                  <Tooltip title="删除选项">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除选项 ${index + 1}`}
                      disabled={options.length <= 2}
                      onClick={() => removeOption(option.id)}
                    />
                  </Tooltip>
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                disabled={options.length >= 20}
                onClick={() => setOptions((current) => [...current, { id: newId(), label: `选项 ${current.length + 1}` }])}
              >
                添加选项
              </Button>
            </div>
          </Form.Item>
        )}

        {type === 'multiple_choice' && (
          <div className={styles.twoColumns}>
            <Form.Item label="最少选择" name="min_selected">
              <InputNumber min={0} max={20} placeholder="不限" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="最多选择" name="max_selected">
              <InputNumber min={0} max={20} placeholder="不限" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}

        {type === 'text' && (
          <div className={styles.twoColumns}>
            <Form.Item label="最少字数" name="min_length">
              <InputNumber min={0} max={10000} placeholder="不限" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="最多字数" name="max_length">
              <InputNumber min={0} max={10000} placeholder="不限" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}

        {type === 'number' && (
          <>
            <div className={styles.twoColumns}>
              <Form.Item label="最小值" name="min_value">
                <InputNumber placeholder="不限" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="最大值" name="max_value">
                <InputNumber placeholder="不限" style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item label="仅允许整数" name="integer_only" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}

