# 业务领域模块

后续每个后端业务板块在本目录下建立独立模块，例如：

```text
modules/surveys/
├─ router.py
├─ schemas.py
├─ service.py
├─ repository.py
└─ __init__.py
```

模块内部按路由、服务、仓储和数据结构分层；跨模块依赖通过显式服务接口，不直接引用其他模块的仓储或路由实现。公共配置和数据库生命周期放到 `app/core/`。
