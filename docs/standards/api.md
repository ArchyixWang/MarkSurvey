# API 规范

状态：认证与问卷 v1 契约生效
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

## 问卷接口

问卷管理接口位于 `/api/v1/surveys`，填写接口位于 `/api/v1/public/surveys`。所有接口要求有效会话；所有状态变更要求 CSRF。管理接口按会话租户隔离，跨租户访问统一返回 `404`；任何租户的登录用户都可以通过短码访问已发布问卷。

### 管理接口

| 方法 | 路径 | 请求要点 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/surveys` | `title`、`description`、`allow_anonymous` | `201`，创建空草稿与稳定短码 |
| GET | `/surveys` | `page`、`page_size`、可选 `status`、`query` | `200`，租户内分页列表 |
| GET | `/surveys/{id}` | 无 | `200`，草稿 Schema、revision、在线版本与版本状态 |
| PUT | `/surveys/{id}/draft` | 完整 `schema` 与 `revision` | `200`，保存并递增草稿 revision |
| POST | `/surveys/{id}/publish` | 当前 `revision` | `200`，创建不可变版本并切换在线版本 |
| POST | `/surveys/{id}/close` | 无 | `200`，立即关闭并作废未提交草稿 |
| PUT | `/surveys/{id}/deadline` | `deadline_at` 或 `null` | `200`，更新截止时间，不创建版本 |
| GET | `/surveys/{id}/versions` | 无 | `200`，版本历史与在线标记 |
| GET | `/surveys/{id}/versions/{version_id}` | 无 | `200`，不可变版本快照 |
| POST | `/surveys/{id}/versions/{version_id}/copy-to-draft` | 无 | `200`，复制历史版本为当前草稿 |
| GET | `/surveys/{id}/statistics` | 无 | `200`，按当前在线 Schema 聚合全部已提交答卷 |
| GET | `/surveys/{id}/statistics/questions/{question_id}/text-values` | `page`、`page_size` | `200`，分页文本答案 |

### 填写接口

| 方法 | 路径 | 请求要点 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/public/surveys/{short_code}` | 无 | `200`，链接状态、可填写性、在线 Schema 与当前草稿摘要 |
| POST | `/public/surveys/{short_code}/attempts` | `start_new` | `201`，创建或恢复绑定在线版本的草稿 |
| PATCH | `/public/surveys/{short_code}/attempts/{attempt_id}` | `revision`、`answers`、`current_question_id` | `200`，自动保存并返回新 revision |
| POST | `/public/surveys/{short_code}/attempts/{attempt_id}/submit` | `revision`、`answers`、`current_question_id` | `200`，校验并提交最终答卷 |

公开接口返回的 `status` 可能为 `draft`、`published`、`closed` 或计算得到的 `expired`。`can_fill=false`、`existing_attempt`、`completed` 与 `can_start_new` 用于表达填写入口状态；前端不得自行推导服务端可填写性。

### Schema 与版本

- Schema 顶层包含 `schema_version`、标题、说明、匿名与重复填写开关、展示模式、页面和题目。
- 题目使用稳定 UUID 和判别联合类型：`single_choice`、`multiple_choice`、`text`、`number`。
- 版本发布时保存完整 Schema 快照和哈希；历史版本不可修改，发布、关闭或重新发布都会作废旧版本未提交草稿。
- 已发布题目保持稳定 ID；已发布题目的类型不得在同一题目 ID 下修改，发布校验会拒绝此类变更。
- 跳转只能指向后续题目或 `__end__`；同一答案可能命中不同目标时返回 `SURVEY_RULE_CONFLICT`。

### 问卷错误

| 错误码 | 典型状态 | 含义 |
| --- | --- | --- |
| `SURVEY_NOT_FOUND` | `404` | 问卷不存在或不属于当前租户 |
| `SURVEY_NOT_PUBLISHED` | `409` | 问卷没有在线版本 |
| `SURVEY_CLOSED` | `409` | 问卷已手动关闭 |
| `SURVEY_EXPIRED` | `409` | 已超过截止时间 |
| `SURVEY_ALREADY_SUBMITTED` | `409` | 当前用户已提交且不允许重复填写 |
| `SURVEY_REVISION_CONFLICT` | `409` | 草稿 revision 已被其他页面更新 |
| `SURVEY_VERSION_CHANGED` | `409` | 在线版本已切换，旧草稿不可继续 |
| `SURVEY_SCHEMA_INVALID` | `422` | Schema 不完整或字段约束非法 |
| `SURVEY_RULE_CONFLICT` | `422` | 跳转规则存在冲突 |
| `SURVEY_ANSWERS_INVALID` | `422` | 答案不符合题目约束 |

答案校验失败的 `field_errors` 以题目 ID 为键，前端回填到对应题目；跨租户管理资源不暴露存在性。

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
