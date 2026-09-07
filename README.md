# AniNexus（次元枢纽）

AniNexus 是面向动漫与漫画爱好者的一站式内容发现和个人管理平台。项目首先交付响应式 Web，随后演进为 PWA 和移动 App。

当前仓库处于项目初始化阶段，`main` 分支提供所有功能分支共同依赖的可运行基线。

## 技术栈

- 后端：Python 3.12、FastAPI、Pydantic v2
- 前端：Next.js、React、TypeScript、Tailwind CSS
- 数据：MySQL、Redis、Qdrant
- 工具：pnpm、uv、Ruff、Pyright、pytest、ESLint、Prettier、Vitest

## 目录结构

```text
AniNexus/
├─ apps/
│  ├─ api/                 # FastAPI 服务
│  └─ web/                 # Next.js 应用
├─ packages/
│  ├─ api-client/          # OpenAPI 生成的 TypeScript 客户端
│  ├─ config/              # 共享前端配置
│  └─ ui/                  # 共享 UI 组件
├─ services/
│  └─ worker/              # 异步任务 Worker
├─ infra/
│  ├─ docker/
│  └─ nginx/
├─ tests/                  # 跨应用测试
└─ docx/                   # 产品与研发文档
```

## 环境要求

- Python 3.12
- Node.js 24（Node.js 22 至 25 也可）
- pnpm 11
- Docker Desktop 及 Docker Compose

## 首次安装

```bash
copy .env.example .env
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install uv
uv sync --all-packages --group dev
pnpm install
```

macOS 或 Linux 使用：

```bash
cp .env.example .env
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install uv
uv sync --all-packages --group dev
pnpm install
```

## 启动开发环境

先启动基础设施：

```bash
docker compose up -d
```

启动后端：

```bash
uv run uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

启动前端：

```bash
pnpm dev
```

访问地址：

- Web：<http://localhost:3000>
- API：<http://localhost:8000>
- OpenAPI：<http://localhost:8000/docs>
- 健康检查：<http://localhost:8000/api/v1/health>

## 质量检查

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

## Git 工作流

`main` 始终保持可测试和可发布。功能开发从最新 `main` 创建短生命周期分支：

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/SEARCH-01-keyword-search
```

完整分支、提交、PR 和发布规范参见 [产品需求文档](docx/AniNexus-PRD.md) 与 [贡献指南](CONTRIBUTING.md)。

## 当前状态

当前基线仅包含最小健康接口、项目首页、开发基础设施和质量门禁，不包含认证、内容检索、收藏或 AI 等业务功能。
