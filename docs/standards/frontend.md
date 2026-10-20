# 前端开发规范

状态：生效
适用范围：`frontend/`

## 技术基线

- Vite + React + TypeScript。
- UI 组件与交互优先使用 Ant Design，不为已有能力重复造组件。
- 应用必须由 `ConfigProvider` 包裹，并与 Ant Design 的 `App` 成对出现；全局提示使用 `App.useApp()` 获取上下文实例。
- 主题色、圆角、字体等优先通过 Ant Design Design Token 配置；自定义样式使用 CSS Modules，并消费应用暴露的主题变量。

## 目录与依赖

- `app/` 只做应用级装配，不承载业务规则。
- `pages/` 组织页面，不实现可复用的业务能力。
- `features/<feature>/` 内聚该功能的组件、hooks、API 调用、类型和样式。
- `shared/` 只放无业务语义的跨功能基础能力。
- feature 不直接引用其他 feature 的内部文件；需要复用时提升为有明确契约的公共接口。

推荐 feature 结构：

```text
features/surveys/
├─ api/
├─ components/
├─ hooks/
├─ types.ts
└─ index.ts
```

## 编码规则

- TypeScript 保持严格类型，禁止用 `any` 或强制断言掩盖契约问题。
- 网络请求集中在 API 模块，展示组件不直接拼接接口地址。
- API 地址来自 `VITE_API_BASE_URL`，本地默认 `/api/v1`。
- 异步请求必须处理加载、成功、失败和卸载取消。
- 业务状态放在所属 feature；只有真正跨功能的应用状态才进入应用层。
- 组件 props 必须类型化；公共组件不得感知具体业务接口。
- 不直接修改 Ant Design 内部类名；优先使用组件 API、语义化 `classNames/styles` 与 Design Token。

## UI 与可访问性

- 页面必须支持常见桌面与移动宽度。
- 交互元素需要清晰焦点态和可读标签。
- 文案使用产品确认内容，不用占位文案描述未确认能力。
- 颜色不能作为唯一状态信号，状态同时使用文字或图标表达。

## 验证

提交前至少执行：

```powershell
npm run check
```

涉及跨端行为时还必须启动 FastAPI，通过 Vite 代理完成真实请求验证。
