# MarkSurvey

MarkSurvey 是一个在线问卷系统。本仓库采用规格驱动开发（Specification-Driven Development，SDD）：需求先形成文档与验收标准，再进入实现、联调和提交。

> 当前状态：多租户身份认证、问卷 Schema 与版本体系、登录填写与统计一期已实现。

## 技术栈

| 区域 | 技术 |
| --- | --- |
| 前端 | Vite、React、TypeScript、Ant Design |
| 后端 | Python、FastAPI、Pydantic |
| 数据库 | MongoDB Community（建议 9.0.x；本工作区联调实例为 8.0.4） |
| 接口 | REST / JSON，统一使用 `/api/v1` 前缀 |

## 目录结构

```text
MarkSurvey/
├─ frontend/        # Vite + React + Ant Design
├─ backend/         # FastAPI + MongoDB 访问层
├─ docs/            # 产品、架构、规范、决策、模块规格与变更记录
└─ README.md
```

前端按 `app / pages / features / shared` 分层，后端按 `api / core / modules` 分层。业务代码按功能内聚，跨功能共享内容只进入 `shared` 或 `core`。

## 本地启动

### 环境要求

- Node.js 22.12 或更高版本。
- Python 3.12 或更高版本。
- MongoDB Community，默认连接 `mongodb://localhost:27017`。开发环境不启用数据库认证，生产部署必须另行配置访问控制。

本机若尚无 MongoDB，可安装目标版本：

```powershell
winget install --id MongoDB.Server --version 9.0.2 --exact
```

若本机已有兼容的 MongoDB 服务，可直接复用现有实例。后端启动时会 ping 数据库并创建认证与问卷索引；数据库不可用时应用启动失败。

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

后端默认运行在 `http://127.0.0.1:8000`，接口文档位于 `http://127.0.0.1:8000/docs`。健康检查只表示 API 进程可响应；应用启动生命周期会校验 MongoDB 并创建索引。

开发环境默认使用 `MARKSURVEY_EMAIL_BACKEND=console`，验证码会以 warning 级别输出到后端日志。生产环境必须配置 SMTP、至少 32 位的 `MARKSURVEY_AUTH_SECRET` 和 Secure Cookie。

认证接口位于 `/api/v1/auth`，包括滑块挑战、邮箱验证码、注册、两种登录、找回密码、会话恢复和退出。

问卷接口位于 `/api/v1/surveys` 与 `/api/v1/public/surveys`，包括创建、草稿编辑、发布、关闭、截止时间、版本历史、自动草稿、提交、文本答案和统计。所有填写接口要求登录；匿名设置只影响提交后的身份去标识。

### 前端

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

前端默认运行在 `http://localhost:5173`，开发环境将 `/api` 代理到 `http://127.0.0.1:8000`。

页面路由：

- `/login`：密码登录或邮箱验证码登录。
- `/register`：注册并自动建立租户。
- `/forgot-password`：通过邮箱验证码重置密码。
- `/workspace`：受保护的多租户工作台。
- `/workspace/surveys`：问卷列表与创建入口。
- `/workspace/surveys/:id/edit`：Schema、题目、页面、规则、版本与发布管理。
- `/workspace/surveys/:id/statistics`：问卷总体与逐题统计。
- `/survey/:short_code`：受保护填写页；未登录时登录或注册后回到原问卷。

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .

cd ..\frontend
npm test
npm run check
```

## 开发约定

- 每个板块先完成需求对话，再写入 `docs/specs/`，确认后转为 Goal 开发。
- 前后端接口先约定契约，再分别实现；跨端功能必须完成真实联调。
- 重要架构、接口和 UI 约定同步沉淀到 `docs/`。
- 每次修改记录在 `docs/changelog.md`。
- 每段用户与 AI 对话的原始 Prompt 和响应摘要在 `docs/ai_resp.md` 留档。
- 每完成一个小功能提交一次 Git commit。

## 文档入口

- 文档索引：`docs/README.md`
- 产品概览：`docs/product/overview.md`
- 架构说明：`docs/architecture/overview.md`
- SDD 流程：`docs/process/sdd-workflow.md`
- 技术选型决策：`docs/decisions/0001-initial-technology-stack.md`
- 身份认证决策：`docs/decisions/0002-authentication-session-captcha.md`
- 问卷版本决策：`docs/decisions/0003-survey-schema-versioning.md`
- 认证与工作台规格：`docs/specs/identity-and-auth.md`
- 问卷体系规格：`docs/specs/survey-platform.md`
