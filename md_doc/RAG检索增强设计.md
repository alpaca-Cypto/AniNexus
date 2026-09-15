# AniNexus RAG 检索增强设计

> 状态：评估结论 + 设计方案，尚未实施
> 日期：2026-09-14
> 关联文档：`AI助手与推荐工具设计.md`

## 1. 结论摘要

RAG 值得做，但**不是替换现有推荐算法**，而是补上现有算法唯一失效的那一格。

三个候选目标按投入产出比排序：

| 优先级 | 目标 | 结论 |
| --- | --- | --- |
| P0 | 语义检索 / 作品发现 | 做。纯增量，且顺手修掉现有 CJK 检索失效的缺陷 |
| P1 | 提升推荐质量 | 做，但**不建第二个索引**——直接复用 P0 的索引替换 `story` 项 |
| P2 | 用户私人内容问答 | 暂缓。被真实登录态和数据出境问题阻塞，非技术原因 |

**明确不做**：不引入向量数据库，不以向量检索替换加权评分，不为 P2 提前建 per-user 索引。理由见 §7。

---

## 2. 现状分析

### 2.1 已有的检索与推荐能力

| 能力 | 位置 | 实现方式 |
| --- | --- | --- |
| 条目搜索 | `api/subjects.py:174` `list_subjects` | 四字段 `LIKE '%q%'` |
| 相似条目 | `api/subjects.py:94` `_similar_subjects` | 标签/元数据 JSON `LIKE` + 简介关键词 `LIKE`，加权求和 |
| 助手条目搜索 | `assistant/tools.py:162` `_search_subjects` | 同 `LIKE` 方案 |
| 画像与推荐 | `assistant/tools.py:266` / `:322` | 收藏权重聚合 + 复用 `_similar_subjects` |

推荐权重（`api/subjects.py:54-91`）：

```text
共同标签          2
同作者            4
同制作公司        3
同制作方          2
共同主题          2
受众相近          1
同声优            3
故事内容相近      1
```

### 2.2 已发现的具体缺陷

**缺陷一：CJK 简介无法参与检索（核心问题）**

`api/subjects.py:31` 的 `_extract_synopsis_keywords`：

```python
words = (word.casefold() for word in re.findall(r"[a-zA-Z]{4,}", summary))
```

只抽取 4 字符以上的**拉丁字母**词。中文与日文简介抽不出任何关键词，因此：

- `story` 维度对绝大多数条目恒为空；
- 中文提问无法匹配英文简介，跨语言检索完全不存在。

设计文档 §7.2 的 `0.10 × story_similarity` 这一项，在 CJK 内容上实际权重为零。

**缺陷二：FULLTEXT 索引已声明但未使用**

`models/subject.py:44-52` 声明了 `ft_subject_search`，覆盖 `name`、`name_cn`、`title_english`、`title_japanese`、`summary`。但 `api/subjects.py:188` 的搜索路径仍走 `LIKE`，该索引当前是死代码。

**缺陷三：目录数据不在仓库中**

`backend/data/` 仅有 `README.md`，`aninexus-public-catalog.jsonl.gz` 缺失。任何索引方案都必须先解决数据来源。

### 2.3 现有约束

| 约束 | 位置 | 对方案的影响 |
| --- | --- | --- |
| 数据库为 MySQL 8.4.11 | `compose.yaml` | 无 `VECTOR` 类型，无 pgvector |
| LLM Key 由前端逐请求传入 | `api/assistant.py:153` | 用户 Key 不能用于全量建索引 |
| `ollama` 无需 API Key | `api/assistant.py:101` | 自托管 embedding 的鉴权路径已通 |
| 无真实登录态，`DEFAULT_USER_ID=1` | `config.py:54` | P2 的前置阻塞 |
| 承诺对 Bangumi 只读 | — | 索引必须基于本地目录，不得回查上游 |

---

## 3. 可行性判断

### 3.1 向量检索在哪一格上更强

| 场景 | 现有方案 | 向量方案 | 判断 |
| --- | --- | --- | --- |
| 同一声优 / 同作者 | `person_id` 关联或元数据精确匹配 | 余弦相似度 | **现有方案胜**。"同一 CV"是精确定义的关系，不是语义相近 |
| 同标签 | 标签集合交集 | 余弦相似度 | **现有方案胜**。标签本身已是高质量人工标注 |
| 简介语义相近 | 英文关键词重叠（CJK 失效） | 跨语言余弦 | **向量方案胜**，且是唯一可行解 |
| 自然语言找番 | 字面子串匹配 | 跨语言语义匹配 | **向量方案胜** |
| 标签稀疏条目 | 无信号，冷启动失败 | 仍有简介语义可用 | **向量方案胜** |

结论：向量的价值集中在**简介文本**和**自然语言查询**两处，不覆盖结构化关系。

### 3.2 为什么不能替换加权评分

设计文档 §7.4 要求每条推荐返回结构化证据（"同声优：示例声优"），§13 要求"模型不得补造事实"。加权评分给出的是**可追溯的离散证据**，embedding 给出的是一个不可解释的标量。

用向量替换整个评分器会造成两个后果：

1. 推荐理由退化，`reasons` 字段无法填充；
2. 同作者/同 CV 的准确率**下降**（精确关系被近似关系取代）。

因此向量只应进入 `story` 这一格。

---

## 4. 关键技术决策

### 4.1 Embedding 后端：Ollama + bge-m3（推荐）

| 维度 | 说明 |
| --- | --- |
| 多语言 | bge-m3 覆盖 100+ 语言，单模型同时处理中文查询与英文简介，正是缺陷一所需 |
| 自托管 | 无按量计费。多用户公开服务的全量索引成本可控 |
| 复用现有支持 | `llm.py:24` 已含 ollama endpoint，`assistant.py:101` 的免 Key 分支已存在 |
| 向量维度 | 1024 维 dense vector（实施前需实机确认） |

**替代方案**：走 qwen / dashscope 的 embedding 接口。代码改动更小，但按量计费且用户简介文本需出境。考虑到项目正在申请 Bangumi OAuth 并承诺只读，自托管在数据边界上更一致。

### 4.2 存储：MySQL BLOB + 进程内 numpy 暴力检索（推荐）

MySQL 8.4 无 `VECTOR` 类型，pgvector 属 Postgres。两条路：

- **引入独立向量库**（Qdrant / Milvus / Chroma）：多一个 compose 服务、多一份运维与一致性负担。
- **BLOB 存储 + 进程内 numpy 暴力检索**：零新增依赖。

在目标规模下后者完全够用。float32、1024 维：

| 目录规模 | 索引内存 | 单次检索（numpy matmul） |
| ---: | ---: | ---: |
| 1 万条 | 约 41 MB | 约 1–5 ms |
| 5 万条 | 约 205 MB | 约 5–25 ms |
| 20 万条 | 约 819 MB | 约 20–100 ms |

触发升级的条件：目录超过约 20 万条，或检索延迟进入可感知区间。**在此之前引入向量数据库属于过度设计。**

### 4.3 归一化约定

写入前对向量做 L2 归一化，使余弦相似度等价于点积。避免每次检索重复计算模长。

---

## 5. 设计方案

### 5.1 数据模型

```text
subject_embeddings
  subject_id        FK -> subjects.id
  model             模型标识，如 bge-m3
  dim               向量维度，用于校验与迁移
  vector            BLOB，float32 小端，已 L2 归一化
  content_hash      sha256(实际送入 embedding 的文本)
  subject_type      冗余，用于分区加载
  created_at
  updated_at

  唯一键：(subject_id, model)
  索引：  (model, subject_type)
```

`content_hash` 覆盖的文本建议为稳定拼接：

```text
{name} | {name_cn} | {tags 排序后逗号连接} | {summary}
```

仅当该哈希变化时重新嵌入，避免目录微调触发全量重建。

### 5.2 索引构建流水线

```text
导入公共目录 (importers/public_catalog.py)
        │
        ▼
upsert subjects
        │
        ▼
计算当前 content_hash ──► 与 subject_embeddings.content_hash 比对
        │
        ├── 相同：跳过
        └── 不同：批量调用 embedding 后端
                    │
                    ▼
              归一化后写回 BLOB
```

要点：

- 批量提交，与现有 `IMPORT_BATCH_SIZE`（`config.py:18`）对齐；
- embedding 调用需重试与限流，参照设计文档 §8.7 的 job 表思路；
- 该步骤挂载在导入命令之后，**不在用户请求路径内**。

### 5.3 索引加载与刷新

- 进程启动时按 `(model, subject_type)` 加载到内存 numpy 数组；
- 记录 `max(updated_at)` 作为版本号，重建完成后触发重载；
- 多 worker 部署时每个进程各自持有一份副本，内存占用需按 worker 数乘算；
- 首次加载失败时降级为现有 `LIKE` 路径，不阻塞服务启动。

### 5.4 查询侧接入（两个消费方，一个索引）

**消费方一：`search_subjects` 自然语言检索（P0）**

改为混合检索：

```text
候选 = FULLTEXT(name, name_cn, title_english, title_japanese, summary)   # 启用已有的 ft_subject_search
     ∪ VectorTopK(query_embedding)

排序 = normalize(bm25_score) × w1 + cosine × w2
```

`w1` / `w2` 初值待实测确定，实现时暴露为配置项而非硬编码。

顺带解决缺陷二——已有的 FULLTEXT 索引终于投入使用。

**消费方二：`_similar_subjects` 的 `story` 项（P1）**

`api/subjects.py:80-90` 的关键词 LIKE 判据替换为简介向量的余弦值：

```text
story_similarity = cosine(seed.summary_embedding, candidate.summary_embedding)
```

其余加权项（标签、作者、制作公司、制作方、主题、受众、声优）**保持不变**。

初期保持设计文档 §7.2 既定的 `0.10` 权重，并做成可配置项，以便后续按实测调整。

---

## 6. 实施阶段

### 阶段一：embedding 基础设施（P0 前置）

1. 确认 embedding 后端选型（bge-m3 via ollama，或第三方）
2. 新增 `subject_embeddings` 表与迁移
3. 实现索引构建模块，挂载到导入流水线
4. 实现进程内索引加载与版本刷新
5. 解决目录数据缺失——产出可导入的 `aninexus-public-catalog.jsonl.gz`

### 阶段二：自然语言检索（P0）

1. 实现查询向量化与 TopK 检索
2. 启用已有的 `ft_subject_search` FULLTEXT 索引
3. 在 `list_subjects` 与助手 `_search_subjects` 中接入混合排序
4. 增加降级路径：索引不可用时回退 `LIKE`

### 阶段三：修复 `story` 维度（P1）

1. 在 `_similarity_criteria` 中接入简介向量余弦
2. 保留其余加权项不变
3. 权重设为可配置，便于实测调整

### 阶段四：私人内容问答（P2，暂缓）

前置条件全部满足后才启动：

1. 真实登录态落地，替换 `DEFAULT_USER_ID`
2. 明确修订设计文档 §13 中"默认不向模型返回用户长评论"的边界
3. 明确隐私数据出境策略与用户删除路径

---

## 7. 明确不做的事

| 不做 | 原因 |
| --- | --- |
| 引入 Qdrant / Milvus 等向量数据库 | 目标规模下 numpy 暴力检索已足够，新增运维成本无收益 |
| 用向量检索替换加权评分 | 会降低同作者/同 CV 准确率，并使 `reasons` 无法生成 |
| 为 P2 提前建 per-user 索引 | 真实鉴权尚不存在，且与 §13 隐私原则冲突，需先改原则 |
| 在用户请求路径内调用 embedding | embedding 是索引期职责，不应引入请求延迟 |
| 让向量承载结构化关系 | 声优、作者、制作公司应由 `person_id` 精确关联 |

---

## 8. 风险与边界

| 风险 | 应对 |
| --- | --- |
| embedding 后端不可用 | 降级为现有 `LIKE` 路径，服务不中断 |
| 索引与源数据不一致 | `content_hash` 比对，增量重建；版本号驱动重载 |
| 多 worker 内存放大 | 按 worker 数乘算内存预算；超出阈值时再考虑外部向量库 |
| 模型升级导致向量空间失效 | `model` + `dim` 入唯一键，换模型即全量重建，不混用 |
| 不同 `subject_type` 向量互相污染 | 按 `subject_type` 分区加载与检索 |
| 索引体积膨胀至不可接受 | §4.2 的规模表即升级触发条件 |

---

## 9. 验收标准

- 中文提问（如"关于时间循环与失去的作品"）能召回简介为英文的相关条目
- `story` 维度在 CJK 目录上产生非空结果，且不再出现"只有英文条目被召回"
- 同作者、同 CV 推荐结果与改造前**完全一致**（证明结构化路径未被破坏）
- 每条推荐仍返回结构化 `reasons`，未退化为不透明分数
- embedding 后端不可用时，检索自动降级且服务可用
- 仅修改条目简介时，只有该条目的 `content_hash` 变化，未触发全量重建
- 索引构建在导入流水线内完成，用户请求路径中无 embedding 调用
