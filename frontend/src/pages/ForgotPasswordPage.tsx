import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { resetPassword } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthShell } from '../features/auth/components/AuthShell';
import {
  EmailCodeField,
  type EmailCodeFeedback,
} from '../features/auth/components/EmailCodeField';
import { applyServerFieldErrors, errorMessage } from '../features/auth/formErrors';
import type { PasswordResetPayload } from '../features/auth/types';
import styles from './AuthPages.module.css';

const { Text } = Typography;

interface PageFeedback {
  type: 'success' | 'error';
  message: string;
}

export function ForgotPasswordPage() {
  const [form] = Form.useForm<PasswordResetPayload>();
  const { clearSession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<PageFeedback | null>(null);

  const handleSubmit = async (values: PasswordResetPayload) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      await resetPassword(values);
      clearSession();
      navigate('/login', { replace: true, state: { notice: '密码已重置' } });
    } catch (requestError) {
      if (!applyServerFieldErrors(requestError, form)) {
        setFeedback({ type: 'error', message: errorMessage(requestError) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="重新设置密码">
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        size="large"
        className={styles.form}
        onFinish={(values) => void handleSubmit(values)}
      >
        {feedback && (
          <Alert
            className={styles.feedback}
            type={feedback.type}
            message={feedback.message}
            showIcon
            closable
            onClose={() => setFeedback(null)}
          />
        )}
        <Form.Item
          label="注册邮箱"
          name="email"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入有效的邮箱地址' },
          ]}
        >
          <Input prefix={<MailOutlined />} autoComplete="email" placeholder="name@example.com" />
        </Form.Item>
        <EmailCodeField
          form={form}
          purpose="password_reset"
          onFeedback={(nextFeedback: EmailCodeFeedback) => setFeedback(nextFeedback)}
        />
        <Form.Item
          label="新密码"
          name="new_password"
          rules={[
            { required: true, message: '请设置新密码' },
            {
              pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/,
              message: '密码需为 8–64 位并同时包含字母和数字',
            },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            autoComplete="new-password"
            placeholder="至少 8 位，包含字母和数字"
          />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="password_confirm"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value: string) {
                if (!value || getFieldValue('new_password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            autoComplete="new-password"
            placeholder="再次输入新密码"
          />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          className={styles.submit}
        >
          重置密码
        </Button>
      </Form>
      <div className={styles.footer}>
        <Text type="secondary">想起密码了？</Text>
        <Link to="/login">返回登录</Link>
      </div>
    </AuthShell>
  );
}
