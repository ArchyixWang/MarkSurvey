# MarkSurvey API

FastAPI 后端服务。当前提供基础健康检查，MongoDB 持久化将在首个业务模块中接入。

## 本地运行

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

- API 文档：`http://127.0.0.1:8000/docs`
- 健康检查：`http://127.0.0.1:8000/api/v1/health`

## 验证

```powershell
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\ruff check .
.\.venv\Scripts\ruff format --check .
```

## 目录

```text
app/
├─ api/             # HTTP 路由与聚合
├─ core/            # 配置与共享基础设施
├─ modules/         # 后续业务领域模块
└─ main.py          # FastAPI 应用入口
tests/              # 后端测试
```
