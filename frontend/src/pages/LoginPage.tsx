import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Tabs, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { loginWithEmailCode, loginWithPassword } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthShell } from '../features/auth/components/AuthShell';
import { EmailCodeField } from '../features/auth/components/EmailCodeField';
import { SliderCaptcha } from '../features/auth/components/SliderCaptcha';
import { applyServerFieldErrors, errorMessage } from '../features/auth/formErrors';
import type { EmailLoginPayload, PasswordLoginPayload } from '../features/auth/types';
import styles from './AuthPages.module.css';

const { Text } = Typography;

function PasswordLoginForm() {
  const [form] = Form.useForm<PasswordLoginPayload>();
  const { message } = App.useApp();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((key) => key + 1);
  };

  const handleSubmit = async (values: PasswordLoginPayload) => {
    if (!captchaToken) {
      message.warning('请先完成滑块验证');
      return;
    }
    setSubmitting(true);
    try {
      const session = await loginWithPassword({ ...values, captcha_token: captchaToken });
      acceptSession(session);
      message.success(`欢迎回来，${session.user.username}`);
      navigate('/workspace', { replace: true });
    } catch (requestError) {
      if (!applyServerFieldErrors(requestError, form)) {
        message.error(errorMessage(requestError));
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
        <div className={styles.captchaLabel}>
          <span>安全验证</span>
          <span>登录前完成拼图</span>
        </div>
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
  const { message } = App.useApp();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: EmailLoginPayload) => {
    setSubmitting(true);
    try {
      const session = await loginWithEmailCode(values);
      acceptSession(session);
      message.success(`欢迎回来，${session.user.username}`);
      navigate('/workspace', { replace: true });
    } catch (requestError) {
      if (!applyServerFieldErrors(requestError, form)) {
        message.error(errorMessage(requestError));
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
      <EmailCodeField form={form} purpose="email_login" />
      <div className={styles.notice}>
        获取验证码前需要完成滑块验证；验证码登录本身不再重复滑块。
      </div>
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
  return (
    <AuthShell
      title="回到你的工作空间"
      subtitle="使用密码或一次性邮箱验证码登录。你的租户数据只在当前工作空间内可见。"
    >
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
