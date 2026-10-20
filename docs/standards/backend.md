# 后端开发规范

状态：生效
适用范围：`backend/`

## 技术基线

- Python 3.12+、FastAPI、Pydantic。
- MongoDB 访问使用 PyMongo 官方异步客户端，并只在仓储层出现。
- 应用启动时执行数据库 ping 并确保索引存在，关闭时释放客户端。
- 依赖与工具配置统一放在 `pyproject.toml`。
- 配置通过环境变量注入，变量前缀为 `MARKSURVEY_`。

## 分层职责

- `api/routes`：解析 HTTP 输入、声明响应模型、调用服务并映射状态码。
- 领域模块的 `service`：承载业务规则和事务边界，不依赖 FastAPI Request。
- 领域模块的 `repository`：封装 MongoDB 查询与写入，不包含业务判断。
- `schemas`：定义 API 输入输出；数据库文档结构不直接作为响应返回。
- `core`：配置、日志、数据库生命周期和跨模块基础设施。

当前 `modules/identity/` 是领域模块基线：`router`、`service`、`repository`、`schemas`、`security`、`email`、`captcha` 与 `indexes` 分别承担明确职责。

路由层不得直接操作集合；服务层不得返回 FastAPI 响应对象；仓储层不得决定用户可见错误文案。

## 模块化规则

- 业务模块放在 `app/modules/<module>/`，模块对外的入口必须显式声明。
- 模块之间不直接导入路由或仓储内部实现，跨模块协作通过服务接口。
- 禁止建立无边界的通用 `utils` 集合；通用代码必须有明确职责和测试。
- 新增共享抽象前，至少有两个真实调用方或明确的稳定契约。

## 数据与安全

- 密钥、连接串和账户信息不得提交到仓库。
- MongoDB URI 仅从配置读取。
- API 不暴露数据库内部字段、ObjectId 实现细节或堆栈信息。
- 所有外部输入通过 Pydantic 模型校验。
- 时间统一以 UTC 存储，接口使用 ISO 8601 输出。
- 索引和数据结构变更需在规格与变更记录中说明。
- 会话令牌、CSRF 令牌和邮箱验证码只保存摘要；密码使用 Argon2id。
- 所有业务查询显式携带 `tenant_id`。用户更新、会话删除和后续业务资源访问必须校验租户归属。
- 账号与邮箱在写入前规范化小写；唯一索引负责最终并发冲突保护。

## 验证

提交前至少执行：

```powershell
python -m pytest
ruff check .
ruff format --check .
```

新增接口需覆盖成功路径、校验失败和关键业务异常。

认证模块测试使用独立 `marksurvey_test` 数据库和可替换邮件发送器。测试不得依赖真实 SMTP，也不得污染开发数据库。
