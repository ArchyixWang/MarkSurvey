import { MailOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal } from 'antd';
import type { FormInstance } from 'antd';
import { useState } from 'react';

import { ApiError } from '../../../shared/api/client';
import { requestEmailCode } from '../api';
import { errorMessage } from '../formErrors';
import type { EmailPurpose } from '../types';
import { useCountdown } from '../useCountdown';
import { SliderCaptcha } from './SliderCaptcha';

interface EmailCodeFieldProps {
  form: FormInstance;
  purpose: EmailPurpose;
  emailField?: string;
  codeField?: string;
}

export function EmailCodeField({
  form,
  purpose,
  emailField = 'email',
  codeField = 'email_code',
}: EmailCodeFieldProps) {
  const { message } = App.useApp();
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
      message.success('验证码已发送，请查收邮箱');
    } catch (requestError) {
      setModalOpen(false);
      if (requestError instanceof ApiError && requestError.retryAfter) {
        start(requestError.retryAfter);
      }
      message.error(errorMessage(requestError));
    } finally {
      setRequesting(false);
    }
  };

  const buttonText = remaining > 0 ? `${remaining} 秒后重发` : '发送验证码';

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
        <Input
          prefix={<MailOutlined />}
          maxLength={6}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 位数字验证码"
          suffix={
            <Button
              type="link"
              size="small"
              className="auth-code-button"
              loading={requesting}
              disabled={remaining > 0 || requesting}
              onClick={() => void openVerification()}
            >
              {buttonText}
            </Button>
          }
        />
      </Form.Item>

      <Modal
        open={modalOpen}
        title="安全验证"
        footer={null}
        width={460}
        centered
        destroyOnHidden
        mask={{ closable: !requesting }}
        closable={!requesting}
        onCancel={() => setModalOpen(false)}
      >
        <p className="auth-modal-hint">完成拼图验证后，我们会向你的邮箱发送验证码。</p>
        <SliderCaptcha onVerified={(token) => void handleVerified(token)} />
      </Modal>
    </>
  );
}
