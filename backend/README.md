# MarkSurvey API

FastAPI 后端服务。当前已实现多租户身份认证，问卷 Schema、不可变版本、自动草稿、条件跳转和统计接口，以及个人题库、题目版本、登录分享、使用记录和跨问卷统计。MongoDB 持久化与索引生命周期已接入。

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

应用启动时会 ping MongoDB 并确保 `identity`、`surveys`、`question_library` 索引存在；关闭时释放异步客户端。若数据库不可用，启动失败。

## 认证模块

接口位于 `/api/v1/auth`：

- 滑块挑战创建与验证。
- 邮箱验证码请求，按注册、邮箱登录、密码重置隔离。
- 注册并创建独立租户与 `owner` 用户。
- 账号或邮箱密码登录、邮箱验证码登录。
- 邮箱验证码重置密码，并注销该用户全部会话。
- 会话恢复与 CSRF 保护的退出。

开发环境默认将验证码以 warning 级别写入后端日志。生产环境必须设置 `MARKSURVEY_EMAIL_BACKEND=smtp`、至少 32 位的认证密钥，并使用 Secure Cookie。

## 问卷模块

管理接口位于 `/api/v1/surveys`，填写接口位于 `/api/v1/public/surveys`：

- 创建问卷草稿、租户内分页列表、草稿保存、截止时间、关闭和发布。
- 发布生成不可变 `SurveyVersion`，稳定短码始终指向当前在线版本；支持版本历史与复制为草稿。
- 登录用户通过短码创建或恢复唯一开放草稿，使用 revision 进行自动保存和提交并发控制。
- 流程引擎支持单选、多选和数字题跳转，发布会检测冲突目标；提交按有效路径执行全部约束校验。
- 匿名提交删除用户关联，保留服务端 HMAC 键用于重复限制和去重人数统计。
- 统计按当前在线 Schema 聚合所有已提交版本的有效答卷，并提供分页文本答案。

所有管理接口按 `tenant_id` 隔离，跨租户访问表现为 `404`。问卷状态变更要求 CSRF；填写接口允许其他租户的登录用户通过短码访问。

## 题库模块

接口位于 `/api/v1/question-library`：

- 题目根锁定题型，普通修改、历史恢复、派生新题和共享复制均创建不可变题目版本。
- 分享链接要求登录，可设置有效期和撤销；令牌只存哈希，接收方每次导入都生成独立冻结的自有题目。
- 共享区保留来源分享、来源版本和接收方本地副本。
- 题目可归档和恢复，不允许硬删除；归档不影响历史版本、已发布问卷、使用记录与统计。
- 问卷 Schema 可通过 `library_ref` 绑定题目版本；发布时校验关联并写入使用记录。
- 题目使用和统计仅覆盖当前用户本人创建的问卷，合并所有已使用版本的已提交答卷。

## 测试

测试使用本机 MongoDB 的独立数据库 `marksurvey_test`，并在会话开始和结束时清理。测试通过可替换邮件发送器捕获验证码，不依赖真实 SMTP。当前 32 项后端测试覆盖认证、Schema、流程、版本、草稿、提交、匿名、租户隔离、题库版本、分享、独立复制、使用记录和跨问卷统计。

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
│  ├─ identity/     # 路由、服务、仓储、安全、邮件、滑块与索引
│  ├─ surveys/      # Schema、流程、版本、答卷、统计、路由与索引
│  └─ question_library/ # 题目根、版本、分享、共享区、使用记录与统计
└─ main.py          # FastAPI 应用入口
tests/              # 后端测试
```
