import { IdcardOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { register } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthShell } from '../features/auth/components/AuthShell';
import {
  EmailCodeField,
  type EmailCodeFeedback,
} from '../features/auth/components/EmailCodeField';
import { applyServerFieldErrors, errorMessage } from '../features/auth/formErrors';
import type { RegisterPayload } from '../features/auth/types';
import styles from './AuthPages.module.css';

const { Text } = Typography;

interface PageFeedback {
  type: 'success' | 'error';
  message: string;
}

export function RegisterPage() {
  const [form] = Form.useForm<RegisterPayload>();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<PageFeedback | null>(null);

  const handleSubmit = async (values: RegisterPayload) => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const session = await register(values);
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
    <AuthShell title="创建你的工作空间">
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
        <div className={styles.twoColumns}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^\S{2,32}$/, message: '用户名为 2–32 个不含空白的字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} autoComplete="nickname" placeholder="展示昵称" />
          </Form.Item>
          <Form.Item
            label="账号"
            name="account"
            rules={[
              { required: true, message: '请输入账号' },
              { pattern: /^[A-Za-z0-9_]{4,32}$/, message: '账号需为 4–32 位字母、数字或下划线' },
            ]}
          >
            <Input prefix={<IdcardOutlined />} autoComplete="username" placeholder="登录账号" />
          </Form.Item>
        </div>
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
        <div className={styles.twoColumns}>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请设置密码' },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/,
                message: '密码需为 8–64 位并同时包含字母和数字',
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              autoComplete="new-password"
              placeholder="至少 8 位"
            />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="password_confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue('password') === value) {
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
              placeholder="再次输入密码"
            />
          </Form.Item>
        </div>
        <EmailCodeField
          form={form}
          purpose="register"
          onFeedback={(nextFeedback: EmailCodeFeedback) => setFeedback(nextFeedback)}
        />
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          className={styles.submit}
        >
          创建并进入工作台
        </Button>
      </Form>
      <div className={styles.footer}>
        <Text type="secondary">已经有账号？</Text>
        <Link to="/login">返回登录</Link>
      </div>
    </AuthShell>
  );
}
