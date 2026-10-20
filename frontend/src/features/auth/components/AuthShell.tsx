import { Typography } from 'antd';
import type { ReactNode } from 'react';

import { Brand } from '../../../shared/components/Brand';
import styles from './AuthShell.module.css';

const { Title, Text } = Typography;

interface AuthShellProps {
  title: string;
  children: ReactNode;
}

export function AuthShell({ title, children }: AuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.glowBlue} aria-hidden="true" />
      <div className={styles.glowOrange} aria-hidden="true" />
      <section className={styles.shell}>
        <aside className={styles.story}>
          <Brand />
          <div className={styles.storyCopy}>
            <Text className={styles.eyebrow}>MARK SURVEY</Text>
            <Title level={1} className={styles.storyTitle}>
              每一次回答，
              <br />
              都有迹可循。
            </Title>
            <span className={styles.brandRule} aria-hidden="true" />
          </div>
        </aside>

        <section className={styles.panel}>
          <div className={styles.mobileBrand}>
            <Brand />
          </div>
          <header className={styles.header}>
            <Title level={2} className={styles.title}>
              {title}
            </Title>
          </header>
          <div className={styles.formArea}>{children}</div>
        </section>
      </section>
    </main>
  );
}
