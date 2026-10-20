import {
  ApartmentOutlined,
  AppstoreOutlined,
  DownOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Grid,
  Layout,
  Menu,
  Tag,
  Typography,
  theme,
} from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/components/Brand';
import styles from './WorkspacePage.module.css';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const workspaceItems: MenuProps['items'] = [
  {
    key: 'workspace',
    icon: <AppstoreOutlined />,
    label: '工作台',
  },
  { type: 'divider' },
  {
    type: 'group',
    label: '即将上线',
    children: [
      {
        key: 'surveys',
        icon: <FileTextOutlined />,
        label: '问卷管理',
        disabled: true,
      },
      {
        key: 'members',
        icon: <TeamOutlined />,
        label: '成员管理',
        disabled: true,
      },
    ],
  },
];

function WorkspaceMenu({ onSelected }: { onSelected?: () => void }) {
  return (
    <Menu
      mode="inline"
      selectedKeys={['workspace']}
      items={workspaceItems}
      className={styles.menu}
      onSelect={() => onSelected?.()}
    />
  );
}

export function WorkspacePage() {
  const { session, logout } = useAuth();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMobile = screens.md === false;

  if (!session) {
    return null;
  }

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      message.success('已退出当前会话');
    } catch {
      message.warning('本地会话已清理，请重新登录');
    } finally {
      setLoggingOut(false);
      navigate('/login', { replace: true });
    }
  };

  const userMenu: MenuProps = {
    items: [
      {
        key: 'profile',
        disabled: true,
        label: (
          <div className={styles.profileSummary}>
            <strong>{session.user.username}</strong>
            <span>{session.user.email}</span>
            <Tag variant="filled" color="green">
              owner
            </Tag>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        danger: true,
        disabled: loggingOut,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        void handleLogout();
      }
    },
  };

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <Flex align="center" gap={14} className={styles.headerLeft}>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              aria-label="打开功能导航"
              onClick={() => setDrawerOpen(true)}
              className={styles.menuButton}
            />
          )}
          <Brand compact={isMobile} />
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.tenant}>
            <ApartmentOutlined />
            <Text ellipsis className={styles.tenantName}>
              {session.tenant.name}
            </Text>
          </div>
        </Flex>

        <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
          <Button type="text" className={styles.userButton} loading={loggingOut}>
            <Avatar size={30} style={{ background: token.colorPrimary }}>
              {session.user.username.slice(0, 1).toUpperCase()}
            </Avatar>
            <span className={styles.userName}>{session.user.username}</span>
            <DownOutlined className={styles.downIcon} />
          </Button>
        </Dropdown>
      </Header>

      <Layout hasSider className={styles.body}>
        {!isMobile && (
          <Sider width={236} theme="light" className={styles.sider}>
            <div className={styles.siderTop}>
              <Text className={styles.siderLabel}>WORKSPACE</Text>
            </div>
            <WorkspaceMenu />
            <div className={styles.siderFooter}>
              <span className={styles.statusDot} />
              <Text type="secondary">当前租户已隔离</Text>
            </div>
          </Sider>
        )}

        <Content className={styles.content}>
          <div className={styles.contentInner}>
            <header className={styles.pageHeader}>
              <div>
                <Text className={styles.eyebrow}>OVERVIEW</Text>
                <Title level={2} className={styles.pageTitle}>
                  工作台
                </Title>
                <Paragraph className={styles.pageSubtitle}>
                  欢迎回来，{session.user.username}。这里将成为你管理问卷与回答的起点。
                </Paragraph>
              </div>
              <Tag variant="filled" className={styles.ownerTag}>
                租户 owner
              </Tag>
            </header>

            <section className={styles.emptyPanel}>
              <div className={styles.emptyGlow} aria-hidden="true" />
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div className={styles.emptyCopy}>
                    <Title level={4}>工作空间已就绪</Title>
                    <Paragraph>
                      问卷、发布与数据分析功能将在后续板块接入。当前页面用于验证多租户身份、会话恢复与安全退出。
                    </Paragraph>
                    <Text type="secondary">租户：{session.tenant.name}</Text>
                  </div>
                }
              />
            </section>

            <footer className={styles.footer}>
              <Text type="secondary">MarkSurvey · 多租户工作台一期</Text>
              <Text type="secondary">账号 {session.user.account}</Text>
            </footer>
          </div>
        </Content>
      </Layout>

      <Drawer
        open={drawerOpen}
        placement="left"
        size={280}
        title={<Brand compact />}
        onClose={() => setDrawerOpen(false)}
        className={styles.drawer}
      >
        <WorkspaceMenu onSelected={() => setDrawerOpen(false)} />
      </Drawer>
    </Layout>
  );
}
