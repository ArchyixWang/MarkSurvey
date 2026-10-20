# MarkSurvey API

FastAPI 后端服务。当前已实现多租户身份、认证、会话和工作台所需身份接口，MongoDB 持久化与索引生命周期已接入。

## 前置条件

- Python 3.12+。
- MongoDB Community 运行在 `mongodb://localhost:27017`。本地开发默认不启用数据库认证。
- 若使用 SMTP，需要可用的主机、端口和凭据；开发环境可继续使用控制台邮件。

## 本地运行

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

- API 文档：`http://127.0.0.1:8000/docs`
- 健康检查：`http://127.0.0.1:8000/api/v1/health`

应用启动时会 ping MongoDB 并确保 `identity` 索引存在；关闭时释放异步客户端。若数据库不可用，启动失败。

## 认证模块

接口位于 `/api/v1/auth`：

- 滑块挑战创建与验证。
- 邮箱验证码请求，按注册、邮箱登录、密码重置隔离。
- 注册并创建独立租户与 `owner` 用户。
- 账号或邮箱密码登录、邮箱验证码登录。
- 邮箱验证码重置密码，并注销该用户全部会话。
- 会话恢复与 CSRF 保护的退出。

开发环境默认将验证码以 warning 级别写入后端日志。生产环境必须设置 `MARKSURVEY_EMAIL_BACKEND=smtp`、至少 32 位的认证密钥，并使用 Secure Cookie。

## 测试

测试使用本机 MongoDB 的独立数据库 `marksurvey_test`，并在会话开始和结束时清理。测试通过可替换邮件发送器捕获验证码，不依赖真实 SMTP。

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
├─ core/            # 配置、数据库生命周期、统一错误处理
├─ modules/
│  └─ identity/     # 路由、服务、仓储、安全、邮件、滑块与索引
└─ main.py          # FastAPI 应用入口
tests/              # 后端测试
```
