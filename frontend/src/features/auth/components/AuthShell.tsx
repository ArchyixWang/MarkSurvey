import { Typography } from 'antd';
import type { ReactNode } from 'react';

import { Brand } from '../../../shared/components/Brand';
import styles from './AuthShell.module.css';

const { Title, Paragraph, Text } = Typography;

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

const principles = [
  { index: '01', title: '结构清晰', copy: '问题、选项与结果保持同一条数据脉络。' },
  { index: '02', title: '租户隔离', copy: '每个工作空间从第一天起拥有独立边界。' },
  { index: '03', title: '规格驱动', copy: '先定义契约，再让实现与文档同步演进。' },
] as const;

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <section className={styles.shell}>
        <aside className={styles.story}>
          <Brand />
          <div className={styles.storyCopy}>
            <Text className={styles.eyebrow}>MARK THE SIGNAL</Text>
            <Title level={1} className={styles.storyTitle}>
              每一次回答，
              <br />
              都有迹可循。
            </Title>
            <Paragraph className={styles.storyLead}>
              MarkSurvey 把问卷设计、发布与分析放进一个清晰、安静的工作空间。
            </Paragraph>
          </div>
          <div className={styles.principles}>
            {principles.map((principle) => (
              <div className={styles.principle} key={principle.index}>
                <span className={styles.principleIndex}>{principle.index}</span>
                <span>
                  <strong>{principle.title}</strong>
                  <small>{principle.copy}</small>
                </span>
              </div>
            ))}
          </div>
          <Text className={styles.storyFooter}>MarkSurvey · 在线问卷系统</Text>
        </aside>

        <section className={styles.panel}>
          <div className={styles.mobileBrand}>
            <Brand />
          </div>
          <header className={styles.header}>
            <Text className={styles.eyebrow}>SECURE WORKSPACE</Text>
            <Title level={2} className={styles.title}>
              {title}
            </Title>
            <Paragraph className={styles.subtitle}>{subtitle}</Paragraph>
          </header>
          <div className={styles.formArea}>{children}</div>
          <Text className={styles.panelFooter}>受会话与租户边界保护</Text>
        </section>
      </section>
    </main>
  );
}
