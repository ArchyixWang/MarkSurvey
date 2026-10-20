import { App as AntdApp, ConfigProvider, theme } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { CSSProperties, ReactNode } from 'react';

const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2563EB',
    colorPrimaryHover: '#1D4ED8',
    colorInfo: '#2563EB',
    colorSuccess: '#16A34A',
    colorWarning: '#D97706',
    colorError: '#DC2626',
    colorLink: '#2563EB',
    colorLinkHover: '#1D4ED8',
    colorBgLayout: '#F5F7FB',
    colorBgContainer: '#FFFFFF',
    colorText: '#172033',
    colorTextSecondary: '#667085',
    colorBorder: 'rgba(23, 32, 51, 0.10)',
    colorBorderSecondary: 'rgba(23, 32, 51, 0.08)',
    controlOutline: 'rgba(37, 99, 235, 0.26)',
    controlOutlineWidth: 3,
    controlHeight: 40,
    controlHeightLG: 46,
    controlHeightSM: 34,
    borderRadius: 8,
    borderRadiusLG: 8,
    borderRadiusSM: 6,
    fontSize: 14,
    lineHeight: 1.5,
    fontFamily:
      "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
};

type ThemeVariables = CSSProperties & {
  '--color-bg': string;
  '--color-surface': string;
  '--color-text': string;
  '--color-muted': string;
  '--color-border': string;
  '--brand-primary': string;
  '--brand-primary-hover': string;
  '--brand-accent': string;
  '--terracotta': string;
  '--color-success': string;
  '--color-warning': string;
  '--color-danger': string;
  '--focus-ring': string;
};

function ThemedApplication({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  const variables: ThemeVariables = {
    '--color-bg': token.colorBgLayout,
    '--color-surface': token.colorBgContainer,
    '--color-text': token.colorText,
    '--color-muted': token.colorTextSecondary,
    '--color-border': 'rgba(23, 32, 51, 0.10)',
    '--brand-primary': token.colorPrimary,
    '--brand-primary-hover': token.colorPrimaryHover,
    '--brand-accent': '#F97316',
    '--terracotta': '#14B8A6',
    '--color-success': token.colorSuccess,
    '--color-warning': token.colorWarning,
    '--color-danger': token.colorError,
    '--focus-ring': 'rgba(37, 99, 235, 0.26)',
  };

  return <AntdApp style={variables}>{children}</AntdApp>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <ThemedApplication>{children}</ThemedApplication>
    </ConfigProvider>
  );
}
