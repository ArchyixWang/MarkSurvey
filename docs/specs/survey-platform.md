# 问卷 Schema、版本、填写与统计一期规格

- 状态：Approved
- 负责人：MarkSurvey
- 创建日期：2026-10-20
- 关联 Goal：问卷体系一期

## 1. 背景与目标

MarkSurvey 需要建立可演进的问卷业务核心：使用结构化 Schema 描述问卷内容，发布时生成不可变 TemplateVersion，同一短链接绑定当前在线版本，并完成登录填写、自动草稿、条件跳转和实时统计。

## 2. 范围

### 本期包含

- 问卷创建、租户内列表、草稿编辑、发布、关闭、截止时间与稳定短链接。
- TemplateVersion 历史、同链接换版本、历史版本复制为草稿。
- 单选、多选、文本、数字四种题目及约束。
- 连续/自定义分页展示，单题与多选跳转、数字区间跳转及发布时冲突校验。
- 登录填写、自动保存草稿、提交校验、重复填写设置和匿名提交。
- 按当前在线 Schema 汇总全部已提交版本的统计。

### 本期不包含

- 问卷删除、邀请协作、答案导出、附件题、评分题、公开免登录填写、通知和高级图表。

## 3. 用户流程

### 创建与发布

1. owner 在工作台创建问卷，填写标题、说明和是否匿名。
2. 系统创建草稿和稳定短码，进入 Schema 编辑器。
3. owner 配置题目、页面、规则和设置，保存草稿后可发布。
4. 发布校验通过后创建不可变版本，并把该问卷短链接切换到新版本。
5. 已发布问卷可继续编辑草稿；再次发布会累计版本，但不改变短链接。

### 填写

1. 填写者打开 `/survey/{short_code}`，未登录时进入登录/注册并在成功后返回原链接。
2. 系统绑定当前在线版本并创建或恢复该用户唯一的开放草稿。
3. 答案变化自动保存；单选题选中后、数字题失焦或回车后、多选题停止操作 1 秒后计算规则。
4. 跳转目标为后续题目或结束；连续模式滚动到目标题，分页模式切换到目标页。
5. 提交时按有效路径校验并保存；匿名问卷提交后删除用户关联，只保留 HMAC 派生键。

### 关闭与重新开放

1. owner 可随时更新未来截止时间，不创建版本。
2. 手动关闭会立即拒绝新草稿和提交，并作废开放草稿。
3. 关闭后必须重新发布；重新发布会创建新版本并恢复短链接。

## 4. 功能需求

| 编号 | 需求 | 验收条件 |
| --- | --- | --- |
| FR-01 | 问卷创建与列表 | 当前租户可创建、筛选、分页查看自己的问卷，跨租户不可见 |
| FR-02 | Schema 编辑 | 支持四类题目、约束、页面、规则和完整草稿保存 |
| FR-03 | 版本发布 | 发布生成不可变快照，短链接保持不变，旧答卷保留 |
| FR-04 | 版本管理 | 可查看历史版本并把任意版本复制为草稿 |
| FR-05 | 生命周期 | 支持截止时间、手动关闭和重新发布开放 |
| FR-06 | 登录填写 | 所有短链接访问和填写均要求会话，认证后回跳 |
| FR-07 | 自动草稿 | 答案自动保存、刷新恢复、revision 冲突可识别 |
| FR-08 | 条件跳转 | 单题、多选和数字规则可配置，冲突在发布时阻断 |
| FR-09 | 提交 | 校验必答、选项数量、文本长度、数值范围和整数约束 |
| FR-10 | 匿名与重复 | 匿名提交去标识；重复填写开关生效 |
| FR-11 | 统计 | 统计全部已提交版本的当前结构题目，支持总体和逐题查看 |

## 5. 数据与权限

- `surveys`：问卷草稿、稳定短码、状态、截止时间、当前版本和 revision。
- `survey_versions`：不可变 Schema 快照、版本号、哈希和发布时间。
- `survey_responses`：版本绑定、草稿/提交状态、答案、填写者关联与 HMAC 键。
- owner 只能管理本租户问卷；任意租户的登录用户可通过短码填写已发布问卷。
- 匿名答卷提交后不保存 `respondent_user_id`；HMAC 键只用于去重与参与人数统计。

## 6. Schema 与规则

- Schema 包含标题、说明、匿名、重复填写、展示模式、页面和题目。
- 题目和选项使用稳定 UUID；已发布题目类型不可原地更改，删除后新建会生成新 ID。
- 跳转只能指向后续题目或 `__end__`；不同目标可被同一答案同时命中时禁止发布。
- 连续模式仅展示有效路径；分页模式按页面展示并自动进入目标页。
- 草稿允许不完整答案，提交只保存有效路径并执行完整校验。

## 7. API 契约

管理接口：

- `POST /api/v1/surveys`
- `GET /api/v1/surveys`
- `GET /api/v1/surveys/{id}`
- `PUT /api/v1/surveys/{id}/draft`
- `POST /api/v1/surveys/{id}/publish`
- `POST /api/v1/surveys/{id}/close`
- `PUT /api/v1/surveys/{id}/deadline`
- `GET /api/v1/surveys/{id}/versions`
- `GET /api/v1/surveys/{id}/versions/{version_id}`
- `POST /api/v1/surveys/{id}/versions/{version_id}/copy-to-draft`

填写与统计接口：

- `GET /api/v1/public/surveys/{short_code}`
- `POST /api/v1/public/surveys/{short_code}/attempts`
- `PATCH /api/v1/public/surveys/{short_code}/attempts/{attempt_id}`
- `POST /api/v1/public/surveys/{short_code}/attempts/{attempt_id}/submit`
- `GET /api/v1/surveys/{id}/statistics`
- `GET /api/v1/surveys/{id}/statistics/questions/{question_id}/text-values`

所有接口要求会话，状态变更要求 CSRF。错误使用统一结构并新增问卷领域错误码。

## 8. 前端交互

- `/workspace/surveys`：表格列表、创建 Modal 和行操作。
- `/workspace/surveys/:id/edit`：题目、页面、规则、版本历史和发布操作。
- `/workspace/surveys/:id/statistics`：总体指标、逐题分布和文本答案分页。
- `/survey/:short_code`：受保护填写页，支持连续/分页、自动保存和状态反馈。
- 所有页面复用 Ant Design、现有工作台壳层、Design Token 与响应式规则。

## 9. 异常与边界

- 草稿、关闭、过期或版本变化时拒绝创建/更新/提交草稿，并返回明确错误码。
- revision 不匹配返回 `SURVEY_REVISION_CONFLICT`。
- 发布 Schema 不完整返回 `SURVEY_SCHEMA_INVALID`，规则冲突返回 `SURVEY_RULE_CONFLICT`。
- 同一用户不允许重复提交时返回 `SURVEY_ALREADY_SUBMITTED`。
- 跨租户管理请求统一返回 404。

## 10. 验收标准

- [ ] 可完成创建、编辑、发布、登录填写、自动恢复、跳转、提交和统计闭环。
- [ ] 同一短链接重新发布后由新版本服务，历史版本和已提交答卷保留。
- [ ] 匿名提交后不存在用户 ID，重复限制与人数统计仍有效。
- [ ] 后端、前端测试、静态检查、构建和真实联调通过。

## 11. 待确认事项

无。

## 变更记录

| 日期 | 变更 | 原因 |
| --- | --- | --- |
| 2026-10-20 | 创建并批准规格 | 需求对话完成，进入一期实现 |
