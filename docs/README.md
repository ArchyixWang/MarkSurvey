# MarkSurvey 文档中心

文档是需求和实现的共同事实来源。代码行为与文档不一致时，应在同一次变更中修正文档和代码。

当前已交付：多租户注册、密码/邮箱验证码登录、找回密码、会话恢复、CSRF 退出、工作台壳层，以及问卷创建、版本发布、登录填写和统计闭环。认证契约见 `specs/identity-and-auth.md`，问卷契约见 `specs/survey-platform.md`；HTTP 接口与前端视觉约束分别见 `standards/api.md` 和 `standards/frontend-design.md`。

## 文档地图

| 目录 | 用途 |
| --- | --- |
| `product/` | 产品目标、范围与已确认需求 |
| `architecture/` | 系统边界、模块关系、数据流 |
| `specs/` | 每个开发板块的详细规格与验收标准 |
| `standards/` | 前端、后端、API 等工程规范 |
| `decisions/` | 可追溯的架构决策记录（ADR） |
| `process/` | SDD 与协作流程 |
| `templates/` | 规格和决策模板 |
| `changelog.md` | 按时间记录每次修改 |
| `ai_resp.md` | 用户原始 Prompt 与 AI 响应摘要 |

## 维护规则

1. 新板块开发前创建对应规格文档，状态为 `Draft`；需求确认后改为 `Approved`。
2. 契约、架构或规范发生变化时，先更新文档，再同步代码。
3. 每次完成修改后更新 `changelog.md`。
4. 每次完成对话后更新 `ai_resp.md`，保留用户原始 Prompt。
5. 文档应描述已确认事实；推测和待定项必须单独标记。
