import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { Alert, Card, Divider, Flex, Layout, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { getHealth, type HealthResponse } from '../shared/api/client';
import styles from './HomePage.module.css';

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

type HealthState =
  | { phase: 'checking' }
  | { phase: 'online'; data: HealthResponse }
  | { phase: 'offline'; reason: string };

const stack = [
  { label: 'Frontend', value: 'Vite · React · TypeScript' },
  { label: 'Interface', value: 'Ant Design' },
  { label: 'Backend', value: 'FastAPI · Python' },
  { label: 'Storage', value: 'MongoDB' },
] as const;

export function HomePage() {
  const [health, setHealth] = useState<HealthState>({ phase: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    getHealth(controller.signal)
      .then((data) => setHealth({ phase: 'online', data }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setHealth({
          phase: 'offline',
          reason: error instanceof Error ? error.message : '无法连接 API',
        });
      });

    return () => controller.abort();
  }, []);

  const statusIcon =
    health.phase === 'online' ? (
      <CheckCircleFilled />
    ) : health.phase === 'offline' ? (
      <CloseCircleFilled />
    ) : (
      <LoadingOutlined spin />
    );

  const statusTitle =
    health.phase === 'online'
      ? '前后端连接正常'
      : health.phase === 'offline'
        ? '等待后端服务'
        : '正在检查服务';

  const statusBadgeText =
    health.phase === 'online' ? '联调正常' : health.phase === 'offline' ? '连接失败' : '检查中';

  let statusDetail = '正在请求 /api/v1/health';

  if (health.phase === 'online') {
    statusDetail = `${health.data.service} · v${health.data.version} · ${health.data.environment}`;
  } else if (health.phase === 'offline') {
    statusDetail = health.reason;
  }

  return (
    <Layout className={styles.page}>
      <Header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            M
          </span>
          <div className={styles.brandCopy}>
            <Text strong className={styles.brandName}>
              MarkSurvey
            </Text>
            <Text type="secondary" className={styles.brandSubtitle}>
              在线问卷系统
            </Text>
          </div>
        </div>
        <Tag className={styles.versionTag} color="cyan">
          FOUNDATION · v0.1.0
        </Tag>
      </Header>

      <Content className={styles.content}>
        <div className={styles.grid} aria-hidden="true" />

        <section className={styles.hero}>
          <Text className={styles.eyebrow}>SPEC-DRIVEN SURVEY PLATFORM</Text>
          <Title className={styles.title}>
            问题有结构，
            <br />
            回答有脉络。
          </Title>
          <Paragraph className={styles.description}>
            MarkSurvey 基础工程已就绪。后续每个板块都会先形成可审阅的规格，再进入实现与联调，
            确保前后端契约、文档与代码始终一致。
          </Paragraph>
          <Space size={[8, 8]} wrap>
            <Tag color="green">Vite</Tag>
            <Tag color="blue">Ant Design</Tag>
            <Tag color="geekblue">Python</Tag>
            <Tag color="cyan">MongoDB</Tag>
          </Space>
        </section>

        <Card
          className={styles.statusCard}
          styles={{ body: { padding: 'clamp(24px, 4vw, 32px)' } }}
        >
          <Flex align="center" justify="space-between" gap={20} wrap>
            <div>
              <Text type="secondary" className={styles.statusLabel}>
                API 联调状态
              </Text>
              <Title level={3} className={styles.statusTitle}>
                {statusTitle}
              </Title>
              <Text type="secondary" className={styles.statusDetail}>
                {statusDetail}
              </Text>
            </div>
            <div className={styles.statusBadge} data-status={health.phase}>
              {statusIcon}
              <span>{statusBadgeText}</span>
            </div>
          </Flex>

          <Divider className={styles.divider} />

          <div className={styles.stackGrid}>
            {stack.map((item) => (
              <div className={styles.stackItem} key={item.label}>
                <Text type="secondary" className={styles.stackLabel}>
                  {item.label}
                </Text>
                <Text className={styles.stackValue}>{item.value}</Text>
              </div>
            ))}
          </div>

          {health.phase === 'offline' && (
            <Alert
              className={styles.alert}
              type="warning"
              showIcon
              message="本地 API 尚未连接"
              description="请先在 backend 目录启动 FastAPI 服务，然后刷新页面。"
            />
          )}
        </Card>
      </Content>

      <Footer className={styles.footer}>MarkSurvey · 规格驱动开发 · 前后端分离</Footer>
    </Layout>
  );
}
