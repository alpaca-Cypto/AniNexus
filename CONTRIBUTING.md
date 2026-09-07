# AniNexus 贡献指南

## 开始开发

1. 从远程同步最新 `main`。
2. 按工作类型创建 `feat/*`、`fix/*`、`docs/*`、`test/*`、`refactor/*` 或 `chore/*` 分支。
3. 一个分支只处理一个可独立验证的问题。
4. 实现、测试和文档必须随同一个 Pull Request 提交。

示例：

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/AUTH-01-user-register
```

## 提交规范

提交信息遵循 Conventional Commits：

```text
<type>(<scope>): <summary>
```

示例：

```text
feat(auth): add user registration
fix(search): preserve filters during pagination
test(api): cover health endpoint
docs: clarify local setup
chore(ci): add frontend build check
```

## 提交前检查

```bash
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

## Pull Request

Pull Request 必须说明：

- 关联需求或问题编号。
- 变更目的和主要实现。
- 测试命令及结果。
- API、数据库、配置和兼容性影响。
- 部署注意事项及回滚或恢复方案。

合并前必须通过审查和全部 CI 门禁。功能分支默认使用 Squash and merge，合并完成后删除分支。

## 安全规则

- 不提交 `.env`、密钥、令牌、真实用户数据或生产数据库副本。
- 日志、示例和测试数据必须脱敏。
- 依赖或权限变更必须在 Pull Request 中明确说明。
- 写操作、数据库迁移和外部服务接入必须提供失败与恢复方案。
