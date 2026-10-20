import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { loginWithEmailCode, loginWithPassword } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthShell } from '../features/auth/components/AuthShell';
import {
  EmailCodeField,
  type EmailCodeFeedback,
} from '../features/auth/components/EmailCodeField';
import { SliderCaptcha } from '../features/auth/components/SliderCaptcha';
import { applyServerFieldErrors, errorMessage } from '../features/auth/formErrors';
import type { EmailLoginPayload, PasswordLoginPayload } from '../features/auth/types';
import styles from './AuthPages.module.css';

const { Text } = Typography;

interface PageFeedback {
  type: 'success' | 'error' | 'info';
  message: string;
}

function PasswordLoginForm() {
  const [form] = Form.useForm<PasswordLoginPayload>();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<PageFeedback | null>(null);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((key) => key + 1);
  };

  const handleSubmit = async (values: PasswordLoginPayload) => {
    if (!captchaToken) {
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const session = await loginWithPassword({ ...values, captcha_token: captchaToken });
      acceptSession(session);
      navigate('/workspace', { replace: true });
    } catch (requestError) {
      if (!applyServerFieldErrors(requestError, form)) {
        setFeedback({ type: 'error', message: errorMessage(requestError) });
      }
      resetCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
        label="账号或邮箱"
        name="identifier"
        rules={[{ required: true, message: '请输入账号或邮箱' }]}
      >
        <Input
          prefix={<UserOutlined />}
          autoComplete="username"
          placeholder="输入账号或邮箱"
        />
      </Form.Item>
      <Form.Item
        label="密码"
        name="password"
        rules={[
          { required: true, message: '请输入密码' },
          { min: 8, max: 64, message: '密码长度需为 8–64 位' },
        ]}
      >
        <Input.Password
          prefix={<LockOutlined />}
          autoComplete="current-password"
          placeholder="输入登录密码"
        />
      </Form.Item>

      <div className={styles.captcha}>
        <SliderCaptcha
          key={captchaKey}
          onVerified={(token) => setCaptchaToken(token)}
        />
      </div>

      <div className={styles.auxiliary}>
        <Link to="/forgot-password">忘记密码？</Link>
      </div>

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={submitting}
        disabled={!captchaToken}
        className={styles.submit}
      >
        进入工作台
      </Button>
    </Form>
  );
}

function EmailLoginForm() {
  const [form] = Form.useForm<EmailLoginPayload>();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<PageFeedback | null>(null);

  const handleSubmit = async (values: EmailLoginPayload) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const session = await loginWithEmailCode(values);
      acceptSession(session);
      navigate('/workspace', { replace: true });
    } catch (requestError) {
      if (!applyServerFieldErrors(requestError, form)) {
        setFeedback({ type: 'error', message: errorMessage(requestError) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
        label="邮箱"
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
        purpose="email_login"
        onFeedback={(nextFeedback: EmailCodeFeedback) => setFeedback(nextFeedback)}
      />
      <Button
        type="primary"
        htmlType="submit"
        block
        loading={submitting}
        className={styles.submit}
      >
        使用验证码登录
      </Button>
    </Form>
  );
}

export function LoginPage() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [noticeOpen, setNoticeOpen] = useState(Boolean(notice));

  return (
    <AuthShell title="回到你的工作空间">
      {notice && noticeOpen && (
        <Alert
          className={styles.feedback}
          type="success"
          message={notice}
          showIcon
          closable
          onClose={() => setNoticeOpen(false)}
        />
      )}
      <Tabs
        className={styles.tabs}
        defaultActiveKey="password"
        destroyOnHidden
        items={[
          {
            key: 'password',
            label: '密码登录',
            children: <PasswordLoginForm />,
          },
          {
            key: 'email',
            label: '邮箱验证码登录',
            children: <EmailLoginForm />,
          },
        ]}
      />
      <div className={styles.footer}>
        <Text type="secondary">还没有工作空间？</Text>
        <Link to="/register">立即注册</Link>
      </div>
    </AuthShell>
  );
}
