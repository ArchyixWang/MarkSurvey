import {
  ApartmentOutlined,
  AppstoreOutlined,
  DownOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  App,
  Avatar,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Layout,
  Menu,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/components/Brand';
import styles from './WorkspacePage.module.css';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const workspaceItems: MenuProps['items'] = [
  {
    key: 'workspace',
    icon: <AppstoreOutlined />,
    label: '工作台',
  },
  { type: 'divider' },
  {
    type: 'group',
    label: '功能',
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

interface WorkspaceMenuProps {
  collapsed?: boolean;
  onSelected?: () => void;
}

function WorkspaceMenu({ collapsed = false, onSelected }: WorkspaceMenuProps) {
  return (
    <Menu
      mode="inline"
      inlineCollapsed={collapsed}
      selectedKeys={['workspace']}
      items={workspaceItems}
      className={`${styles.menu}${collapsed ? ` ${styles.menuCollapsed}` : ''}`}
      onSelect={() => onSelected?.()}
    />
  );
}

export function WorkspacePage() {
  const { session, logout } = useAuth();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMobile = screens.md === false;

  if (!session) {
    return null;
  }

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      message.success('已退出登录');
    } catch {
      message.warning('网络异常，已退出本地会话');
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
            <Tag variant="filled" color="blue">
              所有者
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
        modal.confirm({
          title: '退出登录？',
          content: '退出后需要重新登录。',
          okText: '确认退出',
          cancelText: '取消',
          okButtonProps: { danger: true, style: { minHeight: 44 } },
          cancelButtonProps: { style: { minHeight: 44 } },
          onOk: handleLogout,
        });
      }
    },
  };

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div className={styles.headerLead}>
          {isMobile && (
            <Tooltip title="打开功能导航">
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="打开功能导航"
                onClick={() => setDrawerOpen(true)}
                className={styles.iconButton}
              />
            </Tooltip>
          )}
          <Brand compact />
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.tenant}>
            <ApartmentOutlined />
            <Text ellipsis={{ tooltip: session.tenant.name }} className={styles.tenantName}>
              {session.tenant.name}
            </Text>
          </div>
        </div>

        <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
          <Button
            type="text"
            className={styles.userButton}
            loading={loggingOut}
            aria-label="打开用户菜单"
          >
            <Avatar size={30} className={styles.avatar}>
              {session.user.username.slice(0, 1).toUpperCase()}
            </Avatar>
            <span className={styles.userName}>{session.user.username}</span>
            <DownOutlined className={styles.downIcon} />
          </Button>
        </Dropdown>
      </Header>

      <Layout hasSider className={styles.body}>
        {!isMobile && (
          <Sider
            width={232}
            collapsedWidth={72}
            collapsed={collapsed}
            trigger={null}
            theme="light"
            className={styles.sider}
          >
            <div className={styles.siderHeader}>
              {!collapsed && <Text className={styles.siderKicker}>功能导航</Text>}
              <Tooltip title={collapsed ? '展开侧栏' : '收起侧栏'}>
                <Button
                  type="text"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                  onClick={() => setCollapsed((value) => !value)}
                  className={styles.collapseButton}
                />
              </Tooltip>
            </div>
            <div className={styles.menuWrap}>
              <WorkspaceMenu collapsed={collapsed} />
            </div>
          </Sider>
        )}

        <Content className={styles.main}>
          <div className={styles.breadcrumbBar}>
            <Breadcrumb items={[{ title: '工作台' }, { title: '概览' }]} />
          </div>

          <header className={styles.pageHeader}>
            <div className={styles.pageHeading}>
              <Text className={styles.kicker}>WORKSPACE</Text>
              <Title level={1} className={styles.pageTitle}>
                工作台
              </Title>
            </div>
            <Tag variant="filled" color="blue" className={styles.roleTag}>
              所有者
            </Tag>
          </header>

          <div className={styles.contentBody}>
            <section className={styles.emptyPanel} aria-label="工作台内容">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容" />
            </section>
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
        styles={{ body: { padding: 8 } }}
      >
        <WorkspaceMenu onSelected={() => setDrawerOpen(false)} />
      </Drawer>
    </Layout>
  );
}
