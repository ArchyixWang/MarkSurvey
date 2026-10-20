# MarkSurvey

MarkSurvey 是一个在线问卷系统。本仓库采用规格驱动开发（Specification-Driven Development，SDD）：需求先形成文档与验收标准，再进入实现、联调和提交。

> 当前状态：基础工程骨架已建立，业务模块尚未开始。

## 技术栈

| 区域 | 技术 |
| --- | --- |
| 前端 | Vite、React、TypeScript、Ant Design |
| 后端 | Python、FastAPI、Pydantic |
| 数据库 | MongoDB |
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

### 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e .[dev]
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

后端默认运行在 `http://127.0.0.1:8000`，接口文档位于 `http://127.0.0.1:8000/docs`。当前健康检查不依赖数据库；首个持久化模块开始开发时再启用 MongoDB 连接。

### 前端

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

前端默认运行在 `http://localhost:5173`，开发环境将 `/api` 代理到 `http://127.0.0.1:8000`。

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .

cd ..\frontend
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
