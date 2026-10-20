import { MailOutlined } from '@ant-design/icons';
import { Button, Form, Input, Space } from 'antd';
import type { FormInstance } from 'antd';
import { useState, type ChangeEvent, type FocusEvent } from 'react';

import { ApiError } from '../../../shared/api/client';
import { requestEmailCode } from '../api';
import { errorMessage } from '../formErrors';
import type { EmailPurpose } from '../types';
import { useCountdown } from '../useCountdown';
import { SliderCaptchaModal } from './SliderCaptchaModal';
import styles from './EmailCodeField.module.css';

export interface EmailCodeFeedback {
  type: 'success' | 'error';
  message: string;
}

interface EmailCodeFieldProps {
  form: FormInstance;
  purpose: EmailPurpose;
  emailField?: string;
  codeField?: string;
  onFeedback: (feedback: EmailCodeFeedback) => void;
}

interface CodeControlProps {
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  id?: string;
  requesting: boolean;
  remaining: number;
  onRequest: () => void;
}

function CodeControl({
  value,
  onChange,
  onBlur,
  id,
  requesting,
  remaining,
  onRequest,
}: CodeControlProps) {
  const buttonText = remaining > 0 ? `${remaining} 秒后重发` : '发送验证码';

  return (
    <Space.Compact block className={styles.control}>
      <Input
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        prefix={<MailOutlined />}
        maxLength={6}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6 位数字验证码"
      />
      <Button
        type="default"
        loading={requesting}
        disabled={remaining > 0 || requesting}
        onClick={onRequest}
      >
        {buttonText}
      </Button>
    </Space.Compact>
  );
}

export function EmailCodeField({
  form,
  purpose,
  emailField = 'email',
  codeField = 'email_code',
  onFeedback,
}: EmailCodeFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const { remaining, start } = useCountdown();

  const openVerification = async () => {
    try {
      await form.validateFields([emailField]);
      setModalOpen(true);
    } catch {
      return;
    }
  };

  const handleVerified = async (captchaToken: string) => {
    setRequesting(true);
    try {
      const email = String(form.getFieldValue(emailField));
      const response = await requestEmailCode({ email, purpose, captcha_token: captchaToken });
      start(response.retry_after);
      setModalOpen(false);
      onFeedback({ type: 'success', message: '验证码已发送' });
    } catch (requestError) {
      setModalOpen(false);
      if (requestError instanceof ApiError && requestError.retryAfter) {
        start(requestError.retryAfter);
      }
      onFeedback({ type: 'error', message: errorMessage(requestError) });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      <Form.Item
        label="邮箱验证码"
        name={codeField}
        rules={[
          { required: true, message: '请输入邮箱验证码' },
          { pattern: /^\d{6}$/, message: '请输入 6 位数字验证码' },
        ]}
      >
        <CodeControl
          requesting={requesting}
          remaining={remaining}
          onRequest={() => void openVerification()}
        />
      </Form.Item>

      <SliderCaptchaModal
        open={modalOpen}
        dismissible={!requesting}
        onCancel={() => setModalOpen(false)}
        onVerified={(token) => void handleVerified(token)}
      />
    </>
  );
}
