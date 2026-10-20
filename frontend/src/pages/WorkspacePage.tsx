import { Empty, Tag } from 'antd';

import { WorkspacePageFrame } from '../shared/components/WorkspacePageFrame';
import styles from './WorkspacePage.module.css';

export function WorkspacePage() {
  return (
    <WorkspacePageFrame
      breadcrumbs={[{ title: '工作台' }, { title: '概览' }]}
      kicker="WORKSPACE"
      title="工作台"
      actions={
        <Tag variant="filled" color="blue">
          所有者
        </Tag>
      }
    >
      <section className={styles.emptyPanel} aria-label="工作台内容">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容" />
      </section>
    </WorkspacePageFrame>
  );
}
