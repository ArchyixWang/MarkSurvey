import { App as AntdApp, ConfigProvider, theme } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { CSSProperties, ReactNode } from 'react';

const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#125f55',
    colorInfo: '#125f55',
    colorBgLayout: '#f3f1e9',
    colorText: '#18231f',
    colorTextSecondary: '#5f6a65',
    borderRadius: 10,
    borderRadiusLG: 20,
    fontFamily: "'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
};

type ThemeVariables = CSSProperties & Record<`--ms-${string}`, string>;

function ThemedApplication({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  const variables: ThemeVariables = {
    '--ms-color-primary': token.colorPrimary,
    '--ms-color-primary-bg': token.colorPrimaryBg,
    '--ms-color-text': token.colorText,
    '--ms-color-text-secondary': token.colorTextSecondary,
    '--ms-color-border': token.colorBorderSecondary,
    '--ms-color-surface': token.colorBgContainer,
    '--ms-color-layout': token.colorBgLayout,
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
