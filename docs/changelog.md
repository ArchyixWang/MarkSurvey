# 变更记录

本文件按时间记录仓库中的每一次有效修改。后续提交应在对应日期下追加条目。

## 2026-10-20

### 后端身份、认证与会话

- 新增 `identity` 领域模块，按路由、服务、仓储、安全、验证码、邮件和索引分层。
- MongoDB 启动时完成 ping 与索引创建，关闭时释放异步客户端；新增账号/邮箱唯一索引、会话和验证码 TTL 索引。
- 实现注册即创建独立租户、owner 用户、Argon2id 密码哈希，以及重复键补偿删除租户。
- 实现账号/邮箱密码登录、邮箱验证码登录、验证码找回密码、会话恢复与退出。
- 实现 HttpOnly 会话 Cookie、可读 CSRF Cookie、`X-CSRF-Token` 双提交校验，以及生产环境 Secure Cookie 配置。
- 实现服务端 320×160 拼图滑块、隐藏目标位置、±5 px 容差、三次尝试和一次性验证令牌。
- 实现验证码用途隔离、10 分钟有效、60 秒冷却、5 次尝试限制，以及邮件验证码与密码登录失败限流。
- 统一业务错误结构，增加字段错误、通用登录失败文案、`429` 与 `Retry-After`。
- 新增基于独立 `marksurvey_test` 数据库的后端集成测试，并使用可捕获验证码的邮件发送器。

### 身份与工作台规格

- 新增 `docs/specs/identity-and-auth.md`，明确注册、双模式登录、找回密码、滑块验证、会话、租户隔离和工作台范围。
- 新增 ADR-0002，确定服务端会话 Cookie、Argon2id、HMAC 验证码、自建拼图滑块和可替换邮件通道。
- 更新模块规格索引。

### 初始化工程与规格体系

- 初始化 Git 仓库，默认分支为 `main`。
- 建立 `frontend/`、`backend/`、`docs/` 单仓库结构。
- 前端采用 Vite + React + TypeScript + Ant Design 6，配置 Design Token、加载态首页与 API 健康状态。
- 配置 Vite 开发代理 `/api` 到 `http://127.0.0.1:8000`。
- 后端采用 FastAPI + Pydantic Settings，提供 `GET /api/v1/health` 健康检查。
- 建立后端测试、Ruff 配置和本地环境变量示例。
- 沉淀产品概览、系统架构、SDD 流程、前端/后端/API 规范、ADR 和模块规格模板。
- 创建 `docs/ai_resp.md`，记录本轮用户原始 Prompt 与 AI 响应摘要。

### 验证

- 后端 `pytest`：18 项测试通过，覆盖健康检查、滑块、验证码、注册、两种登录、限流、CSRF、会话注销、密码重置和租户边界。
- 后端 `ruff check .` 与 `ruff format --check .`：通过。
- 前端 `npm run check`：TypeScript 类型检查与 Vite 生产构建通过。
- Vite 初始构建产物主包为 672.05 kB（gzip 216.85 kB），当前仅有启动页；引入路由后应同步做代码分割。
- 真实联调：`http://localhost:5174/api/v1/health` 经 Vite 代理返回 `200`，内容与直接访问 FastAPI 一致。
- 无头浏览器验证：页面成功渲染，显示“前后端连接正常”和“联调正常”，未出现离线提示。
