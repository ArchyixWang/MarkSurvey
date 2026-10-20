import { IdcardOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { register } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthProvider';
import { AuthShell } from '../features/auth/components/AuthShell';
import { EmailCodeField } from '../features/auth/components/EmailCodeField';
import { applyServerFieldErrors, errorMessage } from '../features/auth/formErrors';
import type { RegisterPayload } from '../features/auth/types';
import styles from './AuthPages.module.css';

const { Text } = Typography;

export function RegisterPage() {
  const [form] = Form.useForm<RegisterPayload>();
  const { message } = App.useApp();
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: RegisterPayload) => {
    setSubmitting(true);
    try {
      const session = await register(values);
      acceptSession(session);
      message.success('工作空间已创建');
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
    <AuthShell
      title="创建你的工作空间"
      subtitle="注册后你将拥有一个独立租户和 owner 身份，可以立即开始使用 MarkSurvey。"
    >
      <div className={styles.notice}>
        账号与邮箱全局唯一；用户名仅作为工作空间内的展示昵称。
      </div>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        size="large"
        className={styles.form}
        onFinish={(values) => void handleSubmit(values)}
      >
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
        <EmailCodeField form={form} purpose="register" />
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
