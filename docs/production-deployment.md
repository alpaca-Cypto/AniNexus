# 生产模式部署与所有者验收

当前的 `compose.production.yaml` 只把前端绑定到宿主机的 `127.0.0.1:3000`。它用于无域名阶段的所有者验收，不是公开访问入口。受邀用户上线前仍须完成 `plan.md` 的权限、备份、HTTPS、内容使用范围和主线验收。

## 准备

1. 在仓库外准备两个仅部署者可读取的文本文件，分别存放应用数据库密码与 MySQL root 密码。文件内容只包含密码和结尾换行；密码不要放进 Git、Docker 镜像或命令行参数。
2. 将这两个文件的绝对路径分别设为 `ANINEXUS_MYSQL_PASSWORD_FILE` 和 `ANINEXUS_MYSQL_ROOT_PASSWORD_FILE`。Compose 在变量缺失时会拒绝启动。不要复用开发环境的默认密码。
3. 在目标机器上安装 Docker Engine 与 Compose 插件，并确认所选主机能够承受 Next.js、FastAPI 和 MySQL 同机运行。

Windows 本机预览可用 `python ops/prepare_local_secrets.py <仓库外目录>` 生成两份独立随机密码文件；脚本拒绝覆盖既有文件，也不会打印密码。目录应位于仅当前用户可读的位置，例如个人 `AppData/Local` 下。随后在启动 Compose 的 PowerShell 会话中设置两个 `ANINEXUS_MYSQL_*_FILE` 路径变量。正式服务器应在其本机单独生成凭据，不复用预览密码。

Windows 文件权限可能从父目录继承；生成后使用 `icacls` 检查目录和两个文件，确认没有其他普通用户或组的读取权限。本机预览使用如下路径时，可在同一 PowerShell 会话中设置：

```powershell
$env:ANINEXUS_MYSQL_PASSWORD_FILE = "$env:LOCALAPPDATA\AniNexus\secrets\mysql_password"
$env:ANINEXUS_MYSQL_ROOT_PASSWORD_FILE = "$env:LOCALAPPDATA\AniNexus\secrets\mysql_root_password"
docker compose -f compose.production.yaml config --quiet
```

本机站长注册后，可把上述两个绝对路径和经数据库核对的 `OWNER_USER_ID` 写入仓库根目录的 `.env.production.local`，例如 `OWNER_USER_ID=1`（这个数字只是示例）。该文件已被 Git 忽略，且**不应包含密码明文**。后续使用 `docker compose --env-file .env.production.local -f compose.production.yaml ...`；不加 `--env-file` 时，本机另行设置的环境变量必须完整，否则 Compose 会拒绝启动。迁移到另一台机器时要重新生成密码、核对站长 ID，并创建那台机器自己的配置文件。

Windows 本机预览使用 `start.cmd`。Docker Desktop 在受限目录 ACL 下可能把密码文件路径挂成目录；启动脚本会从宿主文件复制密码到两个 Docker 私有卷，再叠加 `compose.production.local-secrets.yaml`。MySQL 卷包含应用密码和 root 密码，后端及迁移卷仅包含应用密码；运行容器只读挂载这些卷。原始文件和数据库卷不会改动，密码卷在停止容器后仍保留。手动运行本机 Compose 命令时，也要同时指定 `-f compose.production.local-secrets.yaml`；Linux 服务器继续只使用基础生产 Compose 文件。

## 首次创建数据库与启动

在仓库根目录执行。Windows 本机双击 `start.cmd`；以下命令用于其他部署环境：

```sh
docker compose -f compose.production.yaml up -d --build mysql backend frontend bangumi-refresh
docker compose -f compose.production.yaml ps
```

`db-migrate` 会在后端启动前运行 `alembic upgrade head`。每次升级前先做可恢复备份；数据库迁移可能包含不可逆的数据变更，回滚应用镜像不等于回滚数据库。不要在已有数据库上盲目执行初始迁移：如果该库过去通过 `create_all` 建过表，先核对它与首个迁移结构一致，再单独考虑 `alembic stamp 8668ef8d2ea4`。全新数据库可直接运行。

本机旧库由独立的 MySQL 9.7 容器管理，当前生产 Compose 则固定 8.4.11。**不要把旧数据目录或冷备份直接挂入生产 MySQL 8.4 容器**；跨版本只能在确认兼容性后采用受支持的逻辑导出/导入方案，或者新建空库。参见 [MySQL 官方降级说明](https://dev.mysql.com/doc/refman/9.7/en/downgrading.html)。

首次注册需要邀请码。在数据库迁移完成后，运行 `docker compose -f compose.production.yaml run --rm backend aninexus-invite-codes --count 1` 生成一个一次性邀请码；Windows 本机还需加上 `--env-file .env.production.local -f compose.production.local-secrets.yaml`。邀请码只显示一次，应通过私下渠道交付。所有者先注册，然后在数据库中核对其用户 ID，将 `OWNER_USER_ID` 设为该 ID，重启后端和前端；在此之前 AI 默认拒绝访问。不要假定第一个账号的 ID 永远是 1。

本机打开 `http://127.0.0.1:3000` 完成发现、登录、收藏与收藏库验收。远程服务器上的所有者可以通过 SSH 本地端口转发访问；不要把数据库、后端或未加 HTTPS 的前端直接暴露给公网。

新初始化的数据库没有作品目录。若已有经核对来源和使用范围的公开目录包，把它放在 `backend/data/aninexus-public-catalog.jsonl.gz`；该目录包不应包含账号、收藏或聊天。先记录文件的 SHA-256、来源版本和条目数，备份目标库，然后运行：

```powershell
docker compose --env-file .env.production.local -f compose.production.yaml -f compose.production.local-secrets.yaml `
  run --rm catalog-import aninexus-import-public-data `
  --source /catalog/aninexus-public-catalog.jsonl.gz --dry-run `
  --skip-create-database --skip-create-tables
docker compose --env-file .env.production.local -f compose.production.yaml -f compose.production.local-secrets.yaml `
  run --rm catalog-import
```

`catalog-import` 只在显式运行时启动，挂载的目录包为只读；写入命令要求已迁移的数据库，不负责建库或建表。导入后核对作品数、来源映射及搜索/详情/收藏主线。旧库生成的 Bangumi 匹配计划不可直接用于新库，必须按当前库重新生成并审核。

本机站长预览已从旧 AniNexus 库**只导出动画目录**，经校验后导入新库：2026-09-26 导入 29,937 条作品（MAL 来源 29,936 条、Bangumi 来源 1 条），另按作品的 `(source, source_id, subject_type)` 重定位，保留旧库 8,556 条 Bangumi→MAL 跨来源映射。最终有 8,557 条 Bangumi ID 映射；账号仍为 1 个、收藏仍为 0，旧库开发收藏和聊天未迁入。导入前本机备份位于 `C:\Users\alpaca\AniNexus-backups\aninexus-production-pre-catalog-20260926-183210.sql`，已检查 SQL 完整结束标记。2026-09-26 已将这份备份导入独立的 `aninexus-restore-check` MySQL 8.4 项目：恢复库 `users=1`、`collections=0`、`subjects=0`，迁移版本为 `8668ef8d2ea4`；同期预览库为 `users=1`、`collections=0`、`subjects=29937`。隔离容器已停止，恢复卷保留供复查。此演练未覆盖导入目录后的当前库，也未验证加密异地备份。导出的两个 `.jsonl.gz` 包位于被 Git 忽略的 `backend/data/`，不得直接当作已获公开再分发许可的发布包。

2026-09-28 补导旧库漫画：原导出器固定动画类型，现支持 `--kind manga`。旧库 82,629 条符合现有 NSFW 过滤规则的漫画已单独导出、按 SHA-256 校验并通过只读预检，随后导入本机生产预览库。导入前备份为 `C:\Users\alpaca\AniNexus-backups\aninexus-production-pre-manga-20260928-151545.sql`；导入后按 `(source, source_id, subject_type)` 与旧库逐条比对，缺失 0 条。预览库漫画共 82,630 条，另 1 条来自既有个人操作；账号、收藏和动画数量未减少。此操作只补公共目录，没有迁移旧库个人数据，也不代表漫画内容使用范围已获确认。

旧库目录导出器为 `aninexus-export-existing-catalog`；跨来源 ID 的独立导出/导入器为 `aninexus-transfer-external-links`。后者要求 SHA-256 校验，先用 `--dry-run` 验证目标作品与冲突，再正式写入；不会复制旧数据库自增 ID。准备新的 Bangumi 归档时，仍须按当前库重新审查匹配关系、NSFW、封面和内容使用范围。

`bangumi-refresh` 在启动时执行一次、之后每 24 小时刷新一次 Bangumi 条目。候选来自公开日历、已关联 Bangumi ID 的“想看/在看”收藏和近期已有 Bangumi 动画；每轮最多 200 条，API 请求间隔 0.5 秒。只更新 Bangumi 来源的目录字段，MAL 旧库条目只有唯一匹配时建立 Bangumi ID 关联，不覆盖其内容；歧义匹配和 NSFW 条目会跳过。日志包含 `created`、`updated`、`linked`、`review`、`skipped`、`failed` 计数。该任务不会更新个人收藏状态，也不代替 Bangumi Archive 的全量导入。

从 2026-09-28 的刷新历史迁移起，每轮结果和条目变化保存在 `catalog_refresh_runs` 与 `catalog_refresh_items`，可在 `/updates` 查看最近 12 轮，默认只显示有变化的条目。此前仅存在于容器日志的运行不会自动补成历史记录；页面不展示用户 Token。Bangumi 日历请求会重试，整轮网络失败后 15 分钟再试。本机预览在此次迁移前的逻辑备份位于 Git 忽略的 `backend/data/aninexus-pre-refresh-history-20260928.sql.gz`，SHA-256 为 `e80ed03ca817b5df40075ca92d44ae6c116ddf05b1f6714092ef9d59922a5b3d`，已校验 gzip 和 SQL 完整结束标记。

当前 loopback HTTP 预览使用 `SESSION_COOKIE_SECURE=false`。正式接入 HTTPS 时必须将其设置为 `true`，并核对经过反向代理后的登录、刷新页面及退出行为。公开服务还需要域名、证书和反向代理配置。

登录用户可在收藏库保存自己的 Bangumi Access Token，之后导入收藏不必重复填写。Token 经后端验证后按用户加密保存在 `bangumi_credentials` 表，读取状态接口只返回 Bangumi 用户名和是否已配置；用户可在导入弹窗替换或删除 Token，注销 AniNexus 账号时也会删除。生产 Compose 默认从应用数据库密码文件派生独立用途的加密密钥，因此**数据库备份之外还必须保留该密码文件**；轮换数据库密码前应先安排重新加密或通知用户重新保存 Token。若配置独立的 `BANGUMI_TOKEN_KEY_FILE`，文件需至少包含 32 字节随机内容，并在所有后端实例间保持一致。不要把 Token 或密钥提交到版本库。

## 配置边界

- 生产配置不挂载前端源码，前端镜像执行 `next build` 后运行 standalone 服务。
- MySQL 和 FastAPI 只在 Compose 内部网络通信，宿主机只监听 loopback 前端端口。
- 数据库凭据在服务器上通过 Compose secrets 以文件挂载；Windows 本机预览改用上述 Docker 私有卷。`DATABASE_URL` 也可由环境变量提供给其他运行方式；生产 Compose 使用密码文件生成连接 URL。
- `CATALOG_SOURCE_MODE` 默认保持 `mixed`，直到 Bangumi 动画目录的匹配、去重和收藏关联通过验收。
- 个人页、收藏库和追番计划供所有已登录用户使用；AI 助手、AI 角色设置及模型 API 管理仅对 `OWNER_USER_ID` 对应账号开放。没有设置模型密钥时不会执行模型调用。共用 Bangumi 凭据的收藏同步与公开日历已关闭；更新提醒由后端按用户保存，旧版浏览器本地提醒不会自动迁移；追番计划仍可使用个人收藏与按账号隔离的浏览器本地草稿（不会跨设备同步），Bangumi 连接状态仅所有者可读取。

## 异地备份与恢复演练

`ops/backup.py` 是待在真实部署机验证的备份命令。它把 MySQL 一致性 SQL 导出直接流入 `age` 加密，再用 `rclone` 上传到异地目录；脚本会比对上传前后的加密文件大小，不在宿主机保存明文 SQL，也不会自动删除远端旧备份。部署机需安装 `age`、`rclone` 和 Docker CLI，配置 rclone 远端。先用 `age-keygen` 在可信设备生成密钥，只把**公钥**放到部署机；私钥另行离线保管，不能留在同一服务器或提交到仓库。确保 `rclone` 远端不是本机目录或同一块磁盘。

在已设置两个 Compose 密码文件环境变量、MySQL 运行且远端可写的 Linux 部署机执行，例如：

```sh
python3 ops/backup.py --recipient 'age1<你的公钥>' --remote 'offsite:aninexus/daily'
```

第一次成功并完成下述恢复演练后，设置每日定时任务，要求失败能通知所有者。为控制费用，在存储端配置可核查的保留策略，例如每日备份保留 14 天、每月一份保留 3 个月；删除策略只作用于专用备份目录。至少每月在**与生产不同的机器或独立 Compose 项目**上演练恢复，记录备份时间、远端文件名、行数核对、登录及收藏主线检查结果、所用时间。仅有“上传成功”或文件大小相等不证明 SQL 可恢复。

恢复演练示意（Linux/Bash，在隔离机器上执行；**不要**把目标项目名改成生产项目名）：

```sh
rclone copyto 'offsite:aninexus/daily/<备份文件>.sql.age' /secure/tmp/aninexus-restore.sql.age
docker compose -p aninexus-restore-test -f compose.production.yaml up -d mysql
set -o pipefail
age --decrypt -i "$AGE_IDENTITY_FILE" /secure/tmp/aninexus-restore.sql.age | docker compose -p aninexus-restore-test -f compose.production.yaml exec -T mysql sh -c 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" exec mysql -uroot'
docker compose -p aninexus-restore-test -f compose.production.yaml run --rm db-migrate alembic current
```

恢复前确认目标项目是空库，且 `AGE_IDENTITY_FILE` 指向隔离机上的私钥。导入成功后再核对 `users`、`collections` 表行数，并在隔离服务上走登录、作品与收藏流程。演练结束前不要删除备份或隔离卷；确认结果后按你的保留策略清理。迁移前额外做一次备份，并保持旧应用镜像可回退。

## 仍需完成的上线门槛

- 在真实机器验证备份上传、定时执行、故障通知和独立恢复演练。本机全新 MySQL 8.4 容器已完成迁移；备份脚本尚未在 Docker/age/rclone 环境运行。
- 对邀请码、账号导出与注销、用户数据隔离、AI 权限做真实双账号验收。代码和 API 测试已覆盖主要路径，但尚无端到端验收。
- 配置域名、HTTPS、反向代理、限流及安全响应头；确定部署地区与实际月费用。
- 完成 `plan.md` 中的跨设备主线验收和 Bangumi 数据使用范围核实。
