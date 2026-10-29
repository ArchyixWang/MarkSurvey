# 系统架构概览

状态：多租户认证、问卷体系、题库与工作台二期已实现
更新时间：2026-10-29

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
- `src/pages/`：路由级页面组合，当前包括认证、工作台、问卷管理、问卷填写与统计、题目库、题目详情、跨问卷统计和共享题目页。
- `src/features/`：按业务功能内聚的前端模块，认证能力位于 `features/auth/`，问卷能力位于 `features/surveys/`，题库能力位于 `features/questionLibrary/`。
- `src/shared/`：无业务归属的 API 基础能力、通用类型和基础组件。
- `src/styles/`：全局样式基线。

业务功能不得反向依赖页面层；不同 feature 之间通过显式接口组合，不直接读取对方内部实现。

前端使用 React Router DOM 7。应用启动时由 `AuthProvider` 读取 `/auth/session`，恢复用户与租户状态；受保护路由在会话未建立时跳转 `/login`，并通过安全 `returnTo` 参数在认证后回到原站内地址。页面按路由懒加载，认证 API、表单错误映射、验证码倒计时和滑块组件集中在 `features/auth/`。

工作台使用 `WorkspaceShell` 作为可复用嵌套布局，统一承载顶栏、侧栏、移动抽屉和内容出口。`WorkspacePageFrame` 提供面包屑、固定页头和内部内容区；问卷与题库列表、编辑、详情和统计页均在此壳层内组合，问卷填写页使用独立受保护布局。题库能力通过 `features/questionLibrary/` 提供 API、类型、内容编辑器、版本抽屉和选题组件，问卷编辑器只依赖其公开组件与契约。

### 后端

- `app/api/`：HTTP 路由与依赖装配，保持轻量。
- `app/core/`：配置、数据库客户端、安全和日志等共享基础设施。
- `app/modules/`：业务领域模块；每个模块自行聚合路由、服务、仓储和数据结构。当前已实现 `identity`、`surveys` 与 `question_library`。
- `app/main.py`：FastAPI 应用工厂与中间件装配。

领域模块不得依赖其他模块的路由实现。跨模块复用通过服务接口或 `core` 公共能力完成。

`identity` 模块职责包括用户、租户、会话、邮箱验证码、滑块挑战与限流。路由层只负责 HTTP 契约和 Cookie 装配；`IdentityService` 承载注册、登录、验证码、会话和租户创建规则；`IdentityRepository` 封装 MongoDB 访问；安全、邮件和图片生成能力分别位于独立文件。

`surveys` 模块职责包括 Schema 校验、流程引擎、问卷生命周期、版本发布、填写草稿、提交和统计。管理路由按会话租户隔离；公开短码路由允许其他租户的登录用户读取和填写。发布只创建不可变 `SurveyVersion` 并切换 `active_version_id`，不复制或改写历史答卷。

`question_library` 模块职责包括题目根、不可变题目版本、版本来源链、登录分享、独立复制导入、共享区、归档恢复、问卷使用记录和跨问卷统计。题目根锁定题型；普通修改、历史恢复、派生新题和共享复制都生成新的不可变版本。问卷发布通过 `QuestionLibraryService` 校验 `library_ref` 并写入使用记录，已发布问卷不随题库后续版本变化。

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

问卷数据集合包括 `surveys`、`survey_versions` 和 `survey_responses`。`surveys` 保存可编辑草稿、稳定短码、状态、截止时间、当前在线版本和草稿 revision；`survey_versions` 保存不可变完整 Schema 快照、版本号、哈希与发布时间；`survey_responses` 保存草稿或提交状态、绑定版本、答案、当前题目、草稿所有者与匿名 HMAC 键。索引覆盖短码唯一、租户列表、版本号唯一、单用户开放草稿、单次提交和统计查询。

题库数据集合包括 `question_roots`、`question_versions`、`question_shares`、`question_share_imports` 和 `question_usages`。题目根保存所有者、租户、不可变题型、最新版本和归档状态；版本保存不可变题目内容与来源；分享只保存令牌哈希；导入记录连接来源分享与接收方独立副本；使用记录把题目版本绑定到已发布问卷版本和问卷题目实例。索引覆盖题目列表、版本号唯一、分享令牌、共享区记录和使用统计。

数据库文档模型属于后端实现细节，不直接暴露给前端。API 使用独立的 Pydantic 模型描述输入输出。

租户是数据隔离边界。注册时先创建租户，再创建 owner 用户；用户唯一键冲突时补偿删除新租户。会话解析后同时得到用户与租户，后续业务仓储必须显式携带 `tenant_id`，认证仓储在用户更新和会话批量删除时也校验租户归属。问卷管理查询同时按问卷 ID 与租户 ID 限定，跨租户访问统一表现为不存在。

## 当前基线

- FastAPI 提供 `GET /api/v1/health`。
- 后端提供 `/api/v1/auth` 完整认证闭环，以及 `/api/v1/surveys`、`/api/v1/public/surveys` 问卷管理、填写和统计闭环。
- 后端提供 `/api/v1/question-library` 题目管理、版本、分享、共享区、使用记录和跨问卷统计闭环。
- 前端提供认证会话状态、密码/邮箱验证码登录、注册、找回密码和受保护工作台。
- 工作台采用全宽顶栏、桌面侧栏和窄屏抽屉；问卷管理为可用入口，成员管理暂为占位。
- 问卷支持四类题目、页面与跳转、不可变版本、自动草稿、匿名提交、重复填写限制和跨版本统计。
- 题库支持题目根与不可变版本、版本恢复与派生、登录分享、独立复制、共享区、归档恢复、问卷关联和跨问卷统计。
- 健康检查只表示 API 进程可响应，不代表业务依赖均可用；应用启动生命周期会校验 MongoDB。

## 演进约束

- 不为尚不存在的需求预先建立抽象层。
- 新增依赖必须说明用途和边界，不把业务逻辑放入通用工具。
- 跨模块共享代码出现两次以上再抽取，避免过早抽象。
- 每个板块完成后验证契约、单元测试、构建和必要的真实联调。
