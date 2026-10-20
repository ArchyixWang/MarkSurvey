# 变更记录

本文件按时间记录仓库中的每一次有效修改。后续提交应在对应日期下追加条目。

## 2026-10-20

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

- 后端 `pytest`：2 项测试通过，无警告。
- 后端 `ruff check .` 与 `ruff format --check .`：通过。
- 前端 `npm run check`：TypeScript 类型检查与 Vite 生产构建通过。
- Vite 初始构建产物主包为 672.05 kB（gzip 216.85 kB），当前仅有启动页；引入路由后应同步做代码分割。
- 真实联调：`http://localhost:5174/api/v1/health` 经 Vite 代理返回 `200`，内容与直接访问 FastAPI 一致。
- 无头浏览器验证：页面成功渲染，显示“前后端连接正常”和“联调正常”，未出现离线提示。
