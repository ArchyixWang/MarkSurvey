import { Breadcrumb, Typography } from 'antd';
import type { BreadcrumbProps } from 'antd';
import type { ReactNode } from 'react';

import styles from './WorkspacePageFrame.module.css';

const { Title, Text } = Typography;

interface WorkspacePageFrameProps {
  breadcrumbs: BreadcrumbProps['items'];
  kicker: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

export function WorkspacePageFrame({
  breadcrumbs,
  kicker,
  title,
  actions,
  children,
  contentClassName,
}: WorkspacePageFrameProps) {
  return (
    <div className={styles.frame}>
      <div className={styles.breadcrumbBar}>
        <Breadcrumb items={breadcrumbs} />
      </div>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <Text className={styles.kicker}>{kicker}</Text>
          <Title level={1} className={styles.pageTitle}>
            {title}
          </Title>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div className={`${styles.contentBody}${contentClassName ? ` ${contentClassName}` : ''}`}>
        {children}
      </div>
    </div>
  );
}
