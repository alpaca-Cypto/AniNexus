# AniNexus Bangumi 主数据源与首页迁移设计

> 状态：分阶段实施中，首页来源契约与切换基础已完成
> 日期：2026-09-14
> 相关文档：`RAG检索增强设计.md`、`AI助手与推荐工具设计.md`
> 评估数据：`E:\Chrome_Downloads\dump-2026-09-08.210336Z`

## 1. 决策摘要

AniNexus 首页应逐步改用 **Bangumi 作为主数据源**，但首页不应在每次搜索时直连 Bangumi API。最终形态为：

1. 首页、详情页和推荐系统统一读取 AniNexus 本地数据库。
2. 每周导入 Bangumi Archive，负责历史目录和关系数据的全量基线。
3. 每日定向刷新当季动画、在看作品和用户收藏作品。
4. 详情页对过期数据采用 stale-while-revalidate，先返回本地数据，再后台刷新。
5. MyAnimeList 不立即删除，改为英文标题、封面和缺失字段的补充源。
6. 先建立跨源映射和无损收藏迁移，再切换首页默认数据。

**不采用**：首页直连上游、每日重新导入整个 dump、直接清空 MAL 条目、仅靠标题模糊匹配自动合并作品。

### 1.1 当前实施进度

- `/api/v1/subjects` 已返回 `primary_source`、`score_source`、`data_updated_at` 和 `is_stale`。
- 首页已显示评分来源，并对过期数据给出非阻塞提示。
- 后端支持 `CATALOG_SOURCE_MODE=mixed|bangumi`，切换时前端接口保持不变。
- 搜索已将 SQL 通配符作为普通字符处理。
- Bangumi Archive 已支持流式校验、动画/书籍筛选、NSFW 排除、限量 dry-run 和公开目录包转换。
- 首页目录默认排除标记为 NSFW 的 Bangumi 条目，显式请求时才可包含。
- `subject_external_ids` 已建立，并在目录导入时幂等登记来源 ID、更新时间和内容哈希。
- MAL/Bangumi 只读匹配规划器已完成：仅“规范化标题 + 类型 + 精确日期”的唯一候选进入 `auto_link`，歧义候选进入 `review`。
- 2026-09-15 动画真实数据匹配完成：28,316 条公开记录中，8,557 条已有 Bangumi 映射，11 条歧义待人工复核，19,748 条为新作品。
- 受保护的 apply 步骤已实现并应用 8,556 条高可信映射；canonical 字段融合和新作品导入完成前仍维持 `mixed` 模式。

## 2. 目标与非目标

### 2.1 目标

- 提高当季动画、放送状态和评分的时效性。
- 让中文标题、中文简介和中文标签成为搜索与 RAG 的主体。
- 使用 Bangumi 的 Staff、声优、角色和作品关系提升推荐准确性。
- 保证上游不可用时首页仍可搜索和浏览。
- 保留已有收藏、日程、提醒和聊天引用的完整性。

### 2.2 非目标

- 不在第一阶段导入音乐、游戏和三次元条目。
- 不要求第一阶段完成全量书籍向量化。
- 不在本阶段镜像上游图片文件，仅缓存图片 URL 和获取状态。
- 不把 MAL 评分与 Bangumi 评分混成一个无来源分数。

## 3. 本地数据集评估

### 3.1 规模

| 数据 | 记录数 |
| --- | ---: |
| 作品 | 683,809 |
| 动画（type=2） | 30,836 |
| 书籍/漫画/小说（type=1） | 414,081 |
| 章节 | 1,693,633 |
| 人物 | 101,569 |
| 角色 | 220,559 |
| 作品—人物关系 | 2,171,013 |
| 作品—角色关系 | 445,204 |
| 作品关系 | 927,032 |

### 3.2 动画与书籍字段覆盖

type 1/2 共 444,917 条：

| 字段 | 有效数量 | 覆盖率 |
| --- | ---: | ---: |
| 简介 | 361,675 | 81.3% |
| 日期 | 413,570 | 93.0% |
| 中文名 | 84,477 | 19.0% |
| 普通标签 | 181,903 | 40.9% |
| 评分 | 143,086 | 32.2% |
| 排名 | 20,782 | 4.7% |

### 3.3 不能直接替代 MAL 的字段

- dump 不包含封面 URL。
- 没有独立的 `title_english` 和结构化别名数组，需解析 `infobox`。
- 没有可直接映射的 MAL ID。
- `eps`、`volumes`、`status` 不是作品表直接字段。
- `platform`、`position`、`relation_type` 是数字常量，必须根据 Bangumi common 定义转换。
- type 1 同时包含系列、单行本、小说等不同粒度，首页需有默认去噪策略。

## 4. 目标架构

```text
Bangumi Archive（每周基线）
            │
            ▼
      staging 表 + 校验
            │
            ▼
   AniNexus canonical catalog ◄── MAL 补充字段
            ▲
            │
Bangumi API（每日定向 + 按需刷新）
            │
            ├── 封面 URL
            ├── 当季作品状态
            └── 过期详情更新
            │
            ▼
   首页 / 详情 / 推荐 / RAG
```

首页 API 只访问 AniNexus 后端。Bangumi API 的请求由后台同步器负责，不应成为首页响应的强依赖。

## 5. 数据模型

### 5.1 兼容迁移原则

现有 `subjects` 继续作为产品内的 canonical 作品，避免直接修改收藏等外键。现有 `source/source_id` 暂时保留为主来源，新增跨源映射表。

```text
subject_external_ids
  id
  subject_id          FK -> subjects.id
  provider            bangumi | myanimelist
  external_id
  subject_type        区分 MAL 动画与漫画等独立 ID 命名空间
  provider_updated_at
  last_fetched_at
  raw_hash

  UNIQUE(provider, external_id, subject_type)
  INDEX(subject_id, provider)
```

导入 Bangumi 条目时：

1. 已有 `(bangumi, id)` 映射：更新对应 canonical 条目。
2. 没有映射但存在高可信匹配：关联现有条目。
3. 没有可信匹配：新建 canonical 条目，不强行合并。

### 5.2 跨源匹配策略

按可信度从高到低：

1. 已人工确认的外部 ID 映射。
2. 完全一致的规范化标题 + 作品类型 + 首发日期。
3. 多别名一致 + 年份 + 集数/卷数一致。
4. 模糊标题只生成待复核候选，不自动合并。

所有自动合并需记录 `match_method`、`confidence`和 `matched_at`，支持撤销。

### 5.3 关系表

不再把 Staff/声优关系压缩成 `metadata_json` 字符串后使用 `LIKE`。新增：

- `people`
- `characters`
- `subject_people`
- `subject_characters`
- `character_people`
- `subject_relations`
- `episodes`

关系表必须对 `subject_id`、`person_id`、`character_id` 和关系类型建立组合索引。

## 6. 字段融合规则

| AniNexus 字段 | 主来源 | 回退来源 | 备注 |
| --- | --- | --- | --- |
| `name` | Bangumi | MAL | 保留原名 |
| `name_cn` | Bangumi | 现有翻译 | 不用空值覆盖旧值 |
| `title_english` | MAL | Bangumi infobox | 需解析别名 |
| `title_japanese` | Bangumi | MAL | 根据 infobox 和主名生成 |
| `summary` | Bangumi | MAL/翻译 | 保留来源和语言标记 |
| `date` | Bangumi | MAL | 选择更可信的非空值 |
| `platform` | Bangumi | MAL | 将数字常量转为内部枚举 |
| `score/rank` | Bangumi | MAL | UI 明确标注来源，不混算 |
| `popularity` | Bangumi favorite | MAL | 增加明确的收藏人数字段 |
| `eps` | Bangumi episodes | MAL | 统计正篇章节 |
| `volumes` | Bangumi infobox | MAL | 保守解析，无法确认则留空 |
| `image` | Bangumi API | MAL | `large -> common -> medium -> MAL` |
| `tags` | Bangumi | MAL | 保留 `count`，另维护标签关系表 |

空值不得覆盖已有非空高质量字段。对所有多源字段记录来源和更新时间。

## 7. 封面策略

Bangumi Archive 本身不包含封面 URL，封面由 Bangumi API 补齐。

### 7.1 获取规则

1. 导入 dump 时不同步请求数十万个封面。
2. 对首页热门、当季动画、用户收藏和最近访问条目进行后台预热。
3. 详情页遇到缺失或过期封面时触发后台刷新，当次先返回占位图或 MAL 回退图。
4. 缓存 `image_url`、`image_checked_at`和最近错误，防止反复请求失效条目。

### 7.2 显示规则

- 列表卡片优先 `common`，高密度屏可使用 `large`。
- 详情页优先 `large`。
- 图片空缺或 404 时回退至 MAL，再回退至 AniNexus 占位图。
- 保留 `referrerPolicy="no-referrer"`，并继续通过 Next.js 允许 `lain.bgm.tv`。

## 8. 同步策略

### 8.1 每周 Archive 全量基线

```text
下载 archive + checksum
        │
        ▼
校验文件集、JSON 和记录数下限
        │
        ▼
导入 staging 表
        │
        ▼
计算 diff（新增 / 修改 / 上游缺失）
        │
        ▼
分批 upsert + 关系表更新
        │
        ▼
提交 catalog_revision，通知检索/RAG 刷新
```

上游缺失的条目先标记 `source_missing_at`，不立即物理删除，避免误删收藏引用。

### 8.2 每日定向刷新

默认刷新集合：

- 当季和近期放送的动画。
- Bangumi Calendar 返回的作品。
- 用户收藏中 `doing/wish` 的作品。
- 最近 7 天访问量较高的作品。
- 封面缺失或数据超过 TTL 的作品。

使用并发上限、指数退避、抖动和失败重试。不在 Web 请求中等待上游更新完成。

### 8.3 TTL 建议

| 数据 | TTL |
| --- | --- |
| 当季动画状态/集数 | 6–24 小时 |
| 评分/收藏数 | 24 小时 |
| 封面 URL | 30 天，404 缩短为 24 小时 |
| 标题/简介/标签 | 每周 Archive，详情页可按需刷新 |
| Staff/角色/关系 | 每周 Archive |

## 9. 首页与 API 改造

### 9.1 首页交互

首页布局可保持不变，搜索卡片增加：

- 评分来源标识，例如“Bangumi 8.2”。
- 数据过期时的非阻塞刷新状态。
- 书籍类型的“系列/单行本/小说”细分筛选。
- NSFW 默认隐藏，只在用户明确允许时展示。

### 9.2 搜索 API

`GET /api/v1/subjects` 仍返回本地分页结果，新增可选字段：

```json
{
  "subject": {},
  "collection": null,
  "score_source": "bangumi",
  "primary_source": "bangumi",
  "data_updated_at": "2026-09-14T00:00:00Z",
  "is_stale": false
}
```

不向前端暴露上游调度细节。前端不根据 `source` 分别请求两套 API。

## 10. 搜索、推荐与 RAG

### 10.1 词法检索

- MySQL FULLTEXT 使用 CJK ngram parser。
- 标题完全匹配、中文名完全匹配和标题前缀匹配获得额外加权。
- `LIKE` 仅作降级路径，且必须转义 `%` 和 `_`。
- Staff、声优和关系查询使用关系表，不使用 JSON 字符串 `LIKE`。

### 10.2 RAG 容量调整

按 1024 维 float32 计算：

| 范围 | 向量数 | 原始矩阵大小 |
| --- | ---: | ---: |
| 全部动画 | 30,836 | 约 126 MB |
| 动画+书籍 | 444,917 | 约 1.82 GB |
| 仅有简介的动画+书籍 | 361,675 | 约 1.48 GB |

因此第一阶段仅对动画建立全量向量索引。书籍不应将全部矩阵复制到每个 Web worker，后续根据评测选择热门子集、内存映射或本地 ANN 索引。

### 10.3 推荐

推荐继续以结构化关系为主：

- 同作者、同 Staff、同制作公司和同声优使用精确关系。
- 作品前作/续作/改编关系使用 `subject_relations`。
- 剧情相似使用 summary embedding。
- 推荐理由保留可追溯证据，不由模型猜测。

## 11. 迁移步骤

### 阶段 A：基础设施

1. 引入 Alembic，停止依赖 `create_all` 更新已有结构。
2. 新增跨源映射、同步任务、同步版本和字段来源记录。
3. 新增 Bangumi Archive 流式导入器和 dry-run 报告。
4. 引入 Bangumi common 常量快照，并记录版本。

### 阶段 B：动画灰度导入

1. 仅导入 type=2 的 30,836 条动画及相关章节、人物、角色和关系。
2. 建立 Bangumi 与现有 MAL 条目的候选映射。
3. 自动合并仅用于高可信候选，其余生成复核清单。
4. 预热当季、热门和已收藏动画的封面。

### 阶段 C：首页切换

1. 在 API 增加数据来源和新鲜度字段。
2. 使用 feature flag 切换 Bangumi canonical 查询。
3. 观察重复率、空封面率、零结果率、P95 延迟和上游错误率。
4. 稳定后停止 MAL 主目录更新，但保留补充数据。

### 阶段 D：书籍与 RAG

1. 导入 type=1，保留系列和单行本粒度标识。
2. 为首页增加书籍子类型和默认去噪。
3. 根据离线评测决定书籍向量子集和索引形式。

## 12. 数据安全与回滚

- 导入前备份 `subjects`、收藏、日程、提醒和跨源映射表。
- 所有合并操作保留旧 `subject_id` 和映射日志。
- 不对上游缺失条目立即级联删除。
- 首页切换受 feature flag 控制，异常时可立即回到旧查询路径。
- 同步器只写入公共目录表，不读写用户密码、会话和聊天内容。

## 13. 可观测性

每次同步记录：

- archive 文件名、checksum、时间和记录数。
- 新增、修改、缺失、跳过和失败数。
- 跨源自动匹配数、待复核数和冲突数。
- API 补全成功率、429/5xx 比例和重试数。
- 封面缺失率和图片 404 率。
- 首页搜索零结果率、P50/P95 延迟和重复结果率。
- RAG 索引版本、向量数和刷新耗时。

## 14. 验收标准

- 首页断开外网后仍可搜索、筛选和分页。
- 首页搜索不在请求链路中同步等待 Bangumi API。
- 当季动画关键字段在 24 小时内刷新。
- Archive 导入可重入，重复运行不产生重复条目和关系。
- 已有收藏、日程和提醒在切换后仍指向同一 canonical 作品。
- 首页不同时展示同一作品的 MAL 和 Bangumi 副本。
- 当季动画封面可用率达到 99%，缺失时有可预期的回退图。
- 评分在 UI 上标注数据来源。
- NSFW 条目在默认首页结果中不可见。
- Bangumi API 不可用时同步任务可重试，不影响本地读取服务。

## 15. 待确认事项

1. Bangumi Archive 数据的重分发许可和署名方式；未确认前不将转换后的全量数据随 AniNexus Release 发布。
2. 书籍首页默认展示系列还是单行本，以及小说是否单独分类。
3. 对应 Bangumi common 常量的版本固定和更新流程。
4. 封面 URL 的长期缓存和对外展示边界。
5. 跨源自动合并的置信度阈值和人工复核工具。
