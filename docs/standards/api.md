# API 规范

状态：认证 v1 契约生效
适用范围：前后端 HTTP 接口

## 地址与版本

- 所有业务接口统一位于 `/api/v1` 下。
- 健康检查：`GET /api/v1/health`。
- 破坏性契约变化必须进入新版本路径，不在原路径静默改变语义。

## 当前基础接口

### `GET /api/v1/health`

成功响应 `200`：

```json
{
  "status": "ok",
  "service": "MarkSurvey API",
  "version": "0.1.0",
  "environment": "development"
}
```

该接口只表示 API 进程可响应。应用启动生命周期会校验 MongoDB 连接并创建索引；数据库不可用时 API 启动失败。

## 认证接口

认证接口统一位于 `/api/v1/auth`。除特别说明外，请求和响应均为 JSON，状态变更接口使用 POST。

| 方法 | 路径 | 请求要点 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/captcha-challenges` | 无请求体 | `200`，返回挑战 ID、背景图、拼图块和图片尺寸；不返回目标位置 |
| POST | `/captcha-challenges/{challenge_id}/verify` | `offset` 整数 | `200`，返回一次性 `captcha_token` 与有效期 |
| POST | `/email-codes` | `email`、`purpose`、`captcha_token` | `202`，返回 `retry_after` |
| POST | `/register` | 用户名、账号、邮箱、密码、确认密码、邮箱验证码 | `201`，返回 `AuthSession` 并设置会话 Cookie |
| POST | `/login/password` | `identifier`（账号或邮箱）、`password`、`captcha_token` | `200`，返回 `AuthSession` 并设置会话 Cookie |
| POST | `/login/email` | `email`、`email_code` | `200`，返回 `AuthSession` 并设置会话 Cookie |
| POST | `/password-reset` | 邮箱、验证码、新密码、确认密码 | `204`，不自动登录，注销该用户全部会话 |
| GET | `/session` | 读取 Cookie 会话 | `200`，返回 `AuthSession`；未登录 `401` |
| POST | `/logout` | 需要会话 Cookie 与 CSRF 请求头 | `204`，删除服务端会话并清理 Cookie |

`purpose` 仅接受 `register`、`email_login`、`password_reset`，验证码按用途隔离。验证码为 6 位数字，10 分钟有效，60 秒重发冷却，最多验证 5 次，成功或失效后不可重放。

滑块挑战图片固定为 320×160 PNG。位置容差为 ±5 px，挑战 2 分钟有效、最多尝试 3 次；验证成功后签发 5 分钟有效的一次性令牌，用于申请邮箱验证码或密码登录。

### 会话响应

```json
{
  "user": {
    "id": "string",
    "username": "演示用户",
    "account": "demo_user",
    "email": "demo@example.com",
    "role": "owner"
  },
  "tenant": {
    "id": "string",
    "name": "演示用户的工作空间"
  }
}
```

响应不得包含密码哈希、会话令牌、CSRF 令牌、验证码摘要或数据库内部字段。

### 会话 Cookie 与 CSRF

- 会话 Cookie：HttpOnly、SameSite=Lax、24 小时有效，生产环境 Secure。
- CSRF Cookie：可由前端脚本读取；已登录状态下的受保护变更接口要求 Cookie 与 `X-CSRF-Token` 请求头一致。
- 当前受保护变更接口为 `POST /auth/logout`。未认证的登录、注册、找回密码接口依靠验证码、滑块令牌和限流保护。
- 会话 Cookie 名为 `marksurvey_session`，CSRF Cookie 名为 `marksurvey_csrf`；两者均通过配置可替换。

## 数据格式

- 请求与响应使用 JSON。
- JSON 字段统一使用 `snake_case`，前端在 feature 的 API 层直接映射，避免隐式全局转换。
- 开启或关闭凭据等安全策略由后端配置决定，前端不自行推测。
- 时间使用 UTC ISO 8601 字符串。
- 数据库中 ObjectId 对外以字符串 ID 暴露，具体字段命名在模块规格中定义。

## 响应与错误

- 使用标准 HTTP 状态码表达结果。
- 成功创建返回 `201`；无响应体操作返回 `204`；校验失败返回 `422`；未认证、无权限、不存在分别使用 `401`、`403`、`404`；冲突使用 `409`；限流使用 `429`；邮件发送失败使用 `502`。
- 所有业务错误使用统一结构：

```json
{
  "error": {
    "code": "REGISTRATION_CONFLICT",
    "message": "账号或邮箱已被使用",
    "field_errors": {
      "account": "该账号已被使用"
    }
  }
}
```

- `field_errors` 只在存在字段级错误时出现，前端将键名直接回填至对应表单字段。
- 账号不存在和密码错误使用同一通用登录失败文案；验证码请求不暴露邮箱是否存在。
- 限流响应返回 `429` 与 `Retry-After` 秒数。验证码冷却也使用 `429`，前端必须读取该响应头恢复倒计时。
- 服务端不得把异常堆栈、数据库错误原文、验证码或敏感配置返回客户端。

## 租户边界

- 注册创建独立租户，用户角色固定为 `owner`。
- 所有业务仓储查询必须显式携带 `tenant_id`，不得只按业务资源 ID 查询。
- 会话解析后从服务端会话记录获得用户与租户，不接受客户端传入的租户 ID 作为授权依据。
- 用户更新、会话删除和后续业务数据访问均需校验租户归属。

## 契约治理

- FastAPI OpenAPI 是后端接口的技术事实来源。
- 模块规格中的请求、响应示例与验收条件必须与 OpenAPI 一致。
- 跨端字段、状态或错误语义变化时，同步修改模块规格、实现、测试和 `docs/changelog.md`。
- 新增或修改接口必须完成后端测试与前端代理联调。
