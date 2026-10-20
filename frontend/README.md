# MarkSurvey Web

Vite + React + TypeScript + Ant Design 前端。当前已实现认证流程和多租户工作台壳层。

## 本地运行

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

默认地址为 `http://localhost:5173`。开发服务器将 `/api` 代理到 `http://127.0.0.1:8000`，因此浏览器始终使用同源 Cookie。可通过 `VITE_API_BASE_URL` 覆盖 API 前缀。

## 路由

| 路径 | 说明 |
| --- | --- |
| `/` | 根据当前会话跳转登录或工作台 |
| `/login` | 密码登录、邮箱验证码登录 |
| `/register` | 注册并自动建立租户 |
| `/forgot-password` | 邮箱验证码重置密码 |
| `/workspace` | 受保护工作台 |
| `*` | 回到 `/` 后再按会话分流 |

页面按路由懒加载。`AuthProvider` 在启动时读取会话，统一处理 `401`，并向页面提供用户、租户、登录状态和退出能力。

## 目录

```text
src/
├─ app/             # Provider、路由与全局装配
├─ features/auth/   # 认证 API、状态、表单组件、倒计时、滑块
├─ pages/           # 登录、注册、找回密码、工作台
├─ shared/          # HTTP 客户端与无业务公共组件
├─ styles/          # 全局样式与主题变量
└─ test/            # Vitest + Testing Library 测试
```

## 验证

```powershell
npm test
npm run check
```

`npm run check` 同时执行 TypeScript 检查与 Vite 生产构建。真实联调需先启动 MongoDB、FastAPI 和 Vite，再从注册或登录开始验证 Cookie、CSRF、滑块和会话恢复。
