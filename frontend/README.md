# MarkSurvey Web

Vite + React + TypeScript + Ant Design 前端。当前已实现认证流程、多租户工作台壳层、问卷管理与填写统计，以及个人题库、题目版本、分享、共享区和跨问卷统计页面。

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
| `/workspace/surveys` | 问卷列表、状态筛选与创建入口 |
| `/workspace/surveys/:id/edit` | 问卷 Schema、题目、页面、规则与版本管理 |
| `/workspace/surveys/:id/statistics` | 问卷总体与逐题统计 |
| `/workspace/questions` | 个人题目库、筛选与共享区 |
| `/workspace/questions/:id` | 题目内容、版本、来源、分享与使用问卷 |
| `/workspace/questions/:id/statistics` | 跨问卷、跨版本题目统计 |
| `/shared/questions/:token` | 受保护题目分享预览与复制 |
| `/survey/:short_code` | 受保护的问卷填写页，未登录时登录后回跳 |
| `*` | 回到 `/` 后再按会话分流 |

页面按路由懒加载。`AuthProvider` 在启动时读取会话，统一处理 `401`，并向页面提供用户、租户、登录状态和退出能力。问卷填写页支持 500ms 防抖自动保存、草稿恢复、条件跳转和多选延迟跳转。问卷编辑器通过题库选题 `Drawer` 选择指定版本，关联后内容只读，切换版本会清理失效跳转。

## 视觉规范

共享设计令牌、认证页布局、工作台 AppShell、组件与响应式约束以 [`../docs/standards/frontend-design.md`](../docs/standards/frontend-design.md) 为准。工作台采用固定视口、60/56px 顶栏和 232/72px 可收起侧栏，内容区独立滚动。

## 目录

```text
src/
├─ app/             # Provider、路由与全局装配
├─ features/auth/   # 认证 API、状态、表单组件、倒计时、滑块
├─ features/surveys/ # Schema、流程、API、编辑器与填写组件
├─ features/questionLibrary/ # 题库 API、类型、内容编辑、版本与选题组件
├─ pages/           # 认证、工作台、问卷、题库、共享与统计页面
├─ shared/          # HTTP 客户端、工作台壳层与无业务公共组件
├─ styles/          # 全局样式与主题变量
└─ test/            # Vitest + Testing Library 测试
```

## 验证

```powershell
npm test
npm run check
```

`npm run check` 同时执行 TypeScript 检查与 Vite 生产构建。当前 27 项前端测试覆盖路由守卫、问卷创建与状态、题型约束、自动保存、即时跳转、版本复制、统计、题库筛选与创建、版本演进、分享复制、编辑器题库关联、跨问卷统计和登录回跳。真实联调需先启动 MongoDB、FastAPI 和 Vite，再从注册或登录开始验证 Cookie、CSRF、滑块和会话恢复。
