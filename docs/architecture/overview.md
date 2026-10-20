# 系统架构概览

状态：多租户认证与工作台基线已实现
更新时间：2026-10-20

## 总体结构

```text
Browser
  │
  ▼
frontend (Vite + React + Ant Design)
  │  /api/v1 REST JSON
  ▼
backend (FastAPI)
  │  PyMongo
  ▼
MongoDB
```

前端不直接访问 MongoDB。所有持久化访问和业务规则由后端负责。

## 工程边界

### 前端

- `src/app/`：应用装配、Provider 与全局入口。
- `src/pages/`：路由级页面组合，当前包括登录、注册、找回密码和工作台。
- `src/features/`：按业务功能内聚的前端模块，当前认证能力位于 `features/auth/`。
- `src/shared/`：无业务归属的 API 基础能力、通用类型和基础组件。
- `src/styles/`：全局样式基线。

业务功能不得反向依赖页面层；不同 feature 之间通过显式接口组合，不直接读取对方内部实现。

前端使用 React Router DOM 7。应用启动时由 `AuthProvider` 读取 `/auth/session`，恢复用户与租户状态；受保护路由在会话未建立时跳转 `/login`。页面按路由懒加载，认证 API、表单错误映射、验证码倒计时和滑块组件集中在 `features/auth/`。

### 后端

- `app/api/`：HTTP 路由与依赖装配，保持轻量。
- `app/core/`：配置、数据库客户端、安全和日志等共享基础设施。
- `app/modules/`：业务领域模块；每个模块自行聚合路由、服务、仓储和数据结构。当前已实现 `identity`。
- `app/main.py`：FastAPI 应用工厂与中间件装配。

领域模块不得依赖其他模块的路由实现。跨模块复用通过服务接口或 `core` 公共能力完成。

`identity` 模块职责包括用户、租户、会话、邮箱验证码、滑块挑战与限流。路由层只负责 HTTP 契约和 Cookie 装配；`IdentityService` 承载注册、登录、验证码、会话和租户创建规则；`IdentityRepository` 封装 MongoDB 访问；安全、邮件和图片生成能力分别位于独立文件。

## 前端与后端契约

- API 统一使用 `/api/v1` 前缀。
- 数据格式为 JSON，接口契约以 FastAPI OpenAPI 文档为技术事实来源。
- 开发环境由 Vite 将 `/api` 代理至 FastAPI，避免前端硬编码后端地址。
- 生产环境可通过 `VITE_API_BASE_URL` 指向实际 API 前缀。
- 跨端字段、状态码或错误语义变化时，必须同步更新 API 规范和变更记录。
- 会话 Cookie 为 HttpOnly、SameSite=Lax、24 小时有效；生产环境启用 Secure。独立的可读 CSRF Cookie 由前端读取，并在受保护的状态变更请求中通过 `X-CSRF-Token` 回传。
- 所有业务错误使用 `{ "error": { "code", "message", "field_errors?" } }` 结构，前端统一转换为 `ApiError` 并处理 `401`。

## 数据层

MongoDB 仅由后端访问。应用启动时创建异步 PyMongo 客户端，执行 `ping` 并确保索引存在；应用关闭时释放客户端。开发环境默认连接 `mongodb://localhost:27017/marksurvey`，自动化测试使用独立的 `marksurvey_test` 数据库。

认证数据集合包括 `tenants`、`users`、`sessions`、`email_codes`、`captcha_challenges` 和 `rate_limits`。账号与邮箱保存规范化小写值，并建立唯一索引；会话、验证码、挑战和限流记录使用 TTL 索引清理。验证码和滑块令牌只保存不可逆摘要，滑块目标位置不通过 API 返回。

数据库文档模型属于后端实现细节，不直接暴露给前端。API 使用独立的 Pydantic 模型描述输入输出。

租户是本期数据隔离边界。注册时先创建租户，再创建 owner 用户；用户唯一键冲突时补偿删除新租户。会话解析后同时得到用户与租户，后续业务仓储必须显式携带 `tenant_id`，认证仓储在用户更新和会话批量删除时也校验租户归属。

## 当前基线

- FastAPI 提供 `GET /api/v1/health`。
- 后端提供 `/api/v1/auth` 完整认证闭环，MongoDB 持久化、索引与关闭生命周期已接入。
- 前端提供认证会话状态、密码/邮箱验证码登录、注册、找回密码和受保护工作台。
- 工作台采用全宽顶栏、桌面侧栏和窄屏抽屉；问卷、成员等业务入口暂为占位。
- 健康检查只表示 API 进程可响应，不代表业务依赖均可用；应用启动生命周期会校验 MongoDB。

## 演进约束

- 不为尚不存在的需求预先建立抽象层。
- 新增依赖必须说明用途和边界，不把业务逻辑放入通用工具。
- 跨模块共享代码出现两次以上再抽取，避免过早抽象。
- 每个板块完成后验证契约、单元测试、构建和必要的真实联调。
