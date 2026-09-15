# AniNexus AI 助手与个性化推荐 Tool 设计

## 1. 目标

用户将自己的 Bangumi 收藏同步到 AniNexus 后，AI 助手应当能够在用户授权范围内自动读取本地收藏数据，并回答以下类型的问题：

- 根据我看过且评分较高的作品，推荐相似动画。
- 推荐和《某部作品》题材相近的作品。
- 推荐同作者、同导演、同脚本、同制作公司或同声优（CV）的作品。
- 比较两部作品，并说明哪一部更符合我的口味。
- 找出我收藏中最偏好的题材、作者、制作公司和声优。
- 推荐尚未收藏的作品，并明确给出推荐依据。

实现方式参考 OtakuNeko 的思路：把“搜索、读取收藏、查询人物、计算相似度”等能力封装成多个边界清晰的 Tool，由大模型按需调用；前端沿用现有的 `tool_start`、`tool_end` SSE 事件展示工具执行过程。

> 核心原则：AI 不直接访问数据库，也不一次性获取用户全部私人数据。模型只能调用后端注册过的 Tool，每个 Tool 都执行鉴权、数量限制和字段裁剪。

## 2. AniNexus 当前基础与缺口

### 2.1 已经具备的能力

- `POST /api/v1/collections/sync/bgm`：同步当前 Access Token 对应账号的 Bangumi 收藏。
- `GET /api/v1/collections`：按用户读取收藏，可按类型、收藏状态和关键词筛选。
- `GET /api/v1/subjects`：搜索本地条目。
- `GET /api/v1/subjects/{id}`：读取条目详情。
- `GET /api/v1/subjects/{id}/similar`：基于标签、作者、制作公司、制作方、主题、受众和简介关键词计算相似条目。
- 前端已经定义工具调用状态，并支持显示 Tool 的输入、输出、成功或失败状态。
- 前端已经定义聊天 SSE 事件格式，但当前助手页面仍然是演示回复，后端尚未实现 `/api/v1/chat`。

### 2.2 当前缺失的数据

目前 Bangumi 收藏同步只保存条目基础资料和收藏状态，没有完整保存以下关系：

- 动画监督、导演、脚本、系列构成等制作人员；
- 漫画作者、原作、作画等创作者；
- 角色与声优的配音关系；
- 条目之间的前传、续作、改编等关系；
- 足够完整的公共标签和元数据。

因此“同 CV 推荐”目前不能只靠现有 `subjects` 表可靠完成，必须增加人物关系的数据同步与存储。

Bangumi 官方 OpenAPI 已提供下列只读接口，可用于补全数据：

- `GET /v0/subjects/{subject_id}`：条目详情；
- `GET /v0/subjects/{subject_id}/persons`：条目相关制作人员；
- `GET /v0/subjects/{subject_id}/characters`：条目相关角色；
- `GET /v0/characters/{character_id}/persons`：角色对应人物，可用于建立 CV 关系；
- `GET /v0/persons/{person_id}/subjects`：人物参与的其他条目；
- `GET /v0/subjects/{subject_id}/subjects`：关联条目。

官方定义参考：[Bangumi OpenAPI v0](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)。

## 3. 总体架构

```text
用户同步 Bangumi 收藏
        │
        ▼
collections/sync/bgm ──► subjects + collections
        │
        ├──► 创建元数据补全任务
        │       ├── 制作人员/作者
        │       ├── 角色/CV
        │       └── 关联作品/标签
        │
        ▼
生成用户偏好画像和推荐缓存
        │
        ▼
用户向 AI 助手提问
        │
        ▼
Chat Orchestrator（模型只看到 Tool 描述）
        │
        ├──► 收藏 Tool
        ├──► 条目搜索 Tool
        ├──► 人物关系 Tool
        ├──► 相似推荐 Tool
        └──► 推荐解释 Tool
        │
        ▼
流式回答 + 推荐卡片 + 可展开的 Tool 调用过程
```

推荐算法在后端完成，模型主要负责：

1. 理解用户问题；
2. 选择 Tool 和组织调用顺序；
3. 把结构化结果解释成自然语言；
4. 不能凭空编造作者、声优或推荐理由。

## 4. Tool 设计原则

1. **单一职责**：一个 Tool 只完成一种查询或计算。
2. **用户身份不由模型传入**：`user_id` 必须由登录态或后端请求上下文注入，禁止把它暴露为 Tool 参数。
3. **默认只读**：自动调用的 Tool 不修改收藏、不触发外部同步。
4. **写操作需确认**：以后若增加“加入想看”等 Tool，必须先让用户明确确认。
5. **结果有上限**：列表默认最多返回 10 条，硬上限 30 条，减少延迟和 Token 消耗。
6. **返回推荐证据**：每个推荐结果必须包含结构化的 `reasons`，不能只返回一个不透明分数。
7. **优先查询本地库**：Bangumi API 只用于同步和后台补全，不应在每轮聊天中被模型直接调用。
8. **隐私最小化**：默认不向模型返回用户长评论、Access Token 或完整浏览历史。

## 5. 建议封装的 Tools

### 5.1 第一阶段：可利用现有数据实现

| Tool 名称 | 用途 | 对应现有能力 |
| --- | --- | --- |
| `get_my_collection_overview` | 获取收藏数量、状态分布、评分分布 | `collections` 聚合查询 |
| `list_my_collections` | 按状态、类型、评分、关键词读取收藏 | `GET /collections` |
| `search_subjects` | 搜索本地作品库 | `GET /subjects` |
| `get_subject_detail` | 获取某个作品的详情 | `GET /subjects/{id}` |
| `find_similar_subjects` | 获取与指定作品相似的条目及理由 | `GET /subjects/{id}/similar` |
| `compare_subjects` | 对比多个作品的标签、作者、制作公司和评分 | 组合查询 |
| `recommend_from_my_library` | 根据收藏和评分生成个性化候选 | 新增推荐服务 |
| `explain_recommendation` | 返回某条推荐与用户偏好的匹配证据 | 新增解释服务 |

### 5.2 第二阶段：补全人物关系后实现

| Tool 名称 | 用途 | 所需数据 |
| --- | --- | --- |
| `get_subject_credits` | 查询作者、监督、脚本、制作公司、角色与 CV | 条目人物关系 |
| `find_subjects_by_person` | 查询同作者、同导演、同脚本或同 CV 的作品 | 人物参与作品关系 |
| `get_my_taste_profile` | 统计用户偏好的题材、作者、Staff、CV、公司 | 收藏 + 人物关系 |
| `recommend_by_people` | 以作者、制作人员或 CV 为主要依据推荐 | 人物关系 + 推荐评分 |
| `find_franchise_entries` | 查询前传、续作、外传和改编作品 | 条目关系 |
| `refresh_subject_metadata` | 后台补全指定条目资料 | Bangumi 同步任务；不直接暴露给普通对话 |

### 5.3 后续可选 Tools

- `get_unfinished_watching`：找出“在看”但长期未更新进度的作品。
- `build_watch_plan`：根据篇幅、状态和用户时间生成观看顺序。
- `get_weekly_updates`：结合追番日历回答本周更新情况。
- `add_to_collection`：加入想看/在看；属于写操作，调用前必须二次确认。
- `update_collection_progress`：更新集数；属于写操作，调用前必须二次确认。

## 6. 核心 Tool 参数与返回结构

下面采用与 Function Calling 兼容的 JSON Schema 风格。实际代码可用 Pydantic 模型生成 Schema，避免手写定义和后端参数不一致。

### 6.1 `get_my_collection_overview`

用途：先用少量聚合信息判断用户是否已同步收藏，以及其收藏规模和评分习惯。

```json
{
  "name": "get_my_collection_overview",
  "description": "读取当前登录用户的收藏概览和评分分布。用户身份由后端上下文决定。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_type": {
        "type": ["integer", "null"],
        "description": "1=书籍，2=动画，4=游戏，6=三次元；null 表示全部"
      }
    },
    "additionalProperties": false
  }
}
```

建议返回：

```json
{
  "synced": true,
  "total": 286,
  "by_status": {"wish": 80, "collect": 132, "doing": 18, "on_hold": 31, "dropped": 25},
  "rated_count": 104,
  "average_user_rate": 7.6,
  "last_synced_at": "2026-09-14T12:00:00Z"
}
```

### 6.2 `list_my_collections`

```json
{
  "name": "list_my_collections",
  "description": "按条件读取当前用户的收藏条目。适合查找高分作品、在看作品或用户提到的收藏。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_type": {"type": ["integer", "null"]},
      "collection_status": {"type": ["integer", "null"], "minimum": 1, "maximum": 5},
      "keyword": {"type": ["string", "null"], "maxLength": 100},
      "min_user_rate": {"type": ["integer", "null"], "minimum": 0, "maximum": 10},
      "sort": {"type": "string", "enum": ["updated", "user_rate", "subject_score"]},
      "limit": {"type": "integer", "minimum": 1, "maximum": 30, "default": 10}
    },
    "additionalProperties": false
  }
}
```

返回字段只保留推荐需要的数据：`subject_id`、标题、封面、收藏状态、用户评分、公共评分、标签和更新时间。用户评论默认不返回。

### 6.3 `search_subjects`

```json
{
  "name": "search_subjects",
  "description": "在 AniNexus 本地公共作品库中搜索动画、漫画、游戏或三次元条目。",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "minLength": 1, "maxLength": 100},
      "subject_type": {"type": ["integer", "null"]},
      "year_from": {"type": ["integer", "null"], "minimum": 1900, "maximum": 2200},
      "score_from": {"type": ["number", "null"], "minimum": 0, "maximum": 10},
      "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 8}
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

### 6.4 `get_subject_detail`

```json
{
  "name": "get_subject_detail",
  "description": "读取一个本地作品条目的基础详情、标签及可用元数据。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_id": {"type": "integer", "minimum": 1},
      "include_credits": {"type": "boolean", "default": false}
    },
    "required": ["subject_id"],
    "additionalProperties": false
  }
}
```

### 6.5 `find_similar_subjects`

```json
{
  "name": "find_similar_subjects",
  "description": "按标签、内容、作者、Staff、制作公司或 CV 查找相似作品，并返回可解释的匹配原因。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_id": {"type": "integer", "minimum": 1},
      "dimensions": {
        "type": "array",
        "items": {"type": "string", "enum": ["tag", "story", "creator", "staff", "studio", "voice_actor"]},
        "uniqueItems": true
      },
      "exclude_collected": {"type": "boolean", "default": true},
      "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 10}
    },
    "required": ["subject_id"],
    "additionalProperties": false
  }
}
```

建议返回：

```json
{
  "items": [
    {
      "subject_id": 123,
      "title": "示例作品",
      "score": 8.1,
      "relevance": 0.86,
      "reasons": [
        {"dimension": "voice_actor", "label": "同声优", "value": "示例声优", "weight": 0.18},
        {"dimension": "tag", "label": "共同标签", "value": "奇幻", "weight": 0.12}
      ],
      "already_collected": false
    }
  ]
}
```

### 6.6 `get_subject_credits`

```json
{
  "name": "get_subject_credits",
  "description": "读取作品的作者、制作人员、制作公司、主要角色和声优。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_id": {"type": "integer", "minimum": 1},
      "credit_types": {
        "type": "array",
        "items": {"type": "string", "enum": ["creator", "staff", "studio", "character", "voice_actor"]},
        "uniqueItems": true
      },
      "limit_per_type": {"type": "integer", "minimum": 1, "maximum": 30, "default": 10}
    },
    "required": ["subject_id"],
    "additionalProperties": false
  }
}
```

### 6.7 `find_subjects_by_person`

不要让模型直接用姓名做数据库模糊匹配后就认定是同一个人。应优先使用稳定的 `person_id`，姓名只用于先搜索候选人物。

```json
{
  "name": "find_subjects_by_person",
  "description": "查找某位作者、制作人员或声优参与的其他作品。",
  "parameters": {
    "type": "object",
    "properties": {
      "person_id": {"type": ["integer", "null"], "minimum": 1},
      "person_name": {"type": ["string", "null"], "maxLength": 100},
      "credit_type": {"type": "string", "enum": ["creator", "director", "script", "staff", "voice_actor", "any"]},
      "exclude_collected": {"type": "boolean", "default": true},
      "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 10}
    },
    "required": ["credit_type"],
    "additionalProperties": false
  }
}
```

后端应校验 `person_id` 和 `person_name` 至少存在一个；如果姓名对应多人，返回 `ambiguous: true` 和候选人物，不应擅自选择。

### 6.8 `get_my_taste_profile`

```json
{
  "name": "get_my_taste_profile",
  "description": "基于当前用户的收藏状态和评分，读取可解释的兴趣画像。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_type": {"type": ["integer", "null"]},
      "dimensions": {
        "type": "array",
        "items": {"type": "string", "enum": ["tag", "creator", "staff", "studio", "voice_actor", "year"]},
        "uniqueItems": true
      },
      "top_n": {"type": "integer", "minimum": 1, "maximum": 20, "default": 8}
    },
    "additionalProperties": false
  }
}
```

画像返回的是统计结论而不是人格判断，例如“高评分收藏中有 8 部科幻作品”，不要输出“你一定是什么性格”之类的推断。

### 6.9 `recommend_from_my_library`

```json
{
  "name": "recommend_from_my_library",
  "description": "根据当前用户的收藏、评分和偏好维度推荐尚未收藏的作品。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_type": {"type": "integer", "default": 2},
      "seed_subject_ids": {"type": "array", "items": {"type": "integer"}, "maxItems": 10},
      "dimensions": {
        "type": "array",
        "items": {"type": "string", "enum": ["tag", "story", "creator", "staff", "studio", "voice_actor"]},
        "uniqueItems": true
      },
      "min_subject_score": {"type": "number", "minimum": 0, "maximum": 10, "default": 6},
      "exclude_collected": {"type": "boolean", "default": true},
      "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 8}
    },
    "additionalProperties": false
  }
}
```

### 6.10 `compare_subjects`

```json
{
  "name": "compare_subjects",
  "description": "从题材、故事、Staff、作者、CV、制作公司、评分和用户偏好匹配度比较 2 至 4 部作品。",
  "parameters": {
    "type": "object",
    "properties": {
      "subject_ids": {"type": "array", "items": {"type": "integer"}, "minItems": 2, "maxItems": 4},
      "include_user_fit": {"type": "boolean", "default": true}
    },
    "required": ["subject_ids"],
    "additionalProperties": false
  }
}
```

## 7. 推荐算法

### 7.1 用户偏好信号

建议按下列规则生成正负反馈：

| 用户行为 | 建议权重 |
| --- | ---: |
| 看过且评分 9～10 | +3.0 |
| 看过且评分 7～8 | +2.0 |
| 看过但未评分 | +1.0 |
| 在看 | +1.2 |
| 想看 | +0.5 |
| 搁置 | -0.4 |
| 抛弃 | -1.5 |
| 评分 0～4 | -2.0 |

用户自定义标签可作为额外信号，但不能把 Bangumi 公共标签和用户私有标签混为一谈。

### 7.2 候选作品得分

第一版可以使用可解释的加权评分，不必一开始就引入向量数据库：

```text
final_score =
    0.25 × tag_similarity
  + 0.22 × creator_similarity
  + 0.18 × voice_actor_similarity
  + 0.12 × studio_similarity
  + 0.10 × story_similarity
  + 0.08 × public_quality
  + 0.05 × popularity_confidence
  - negative_preference_penalty
```

当用户明确说“主要看同 CV”时，编排器传入 `dimensions=["voice_actor"]`，推荐服务临时提高 CV 权重，而不是让大模型自行计算分数。

### 7.3 默认排除规则

- 排除用户已收藏的作品，除非用户明确要求从收藏中挑选；
- 排除同一条目本身；
- 默认只推荐相同 `subject_type`；
- 可选排除总评分过低或评分人数过少的条目；
- 对续作设置去重策略，避免同一系列霸占整个结果列表；
- 缺少某一维度数据时不计该维度，并在结果中返回 `data_completeness`。

### 7.4 推荐理由

每条结果至少返回 1 条、最多返回 4 条证据，例如：

- “你给《A》打了 9 分，本作与它共享‘科幻’和‘时间循环’标签。”
- “与你高分收藏中的 3 部作品由同一位监督执导。”
- “主要角色包含你高频观看作品中的声优 X。”
- “同作者作品，且你尚未收藏。”

这些理由必须由后端匹配结果生成，模型只能润色，不能补造事实。

## 8. 建议新增的数据表

### 8.1 `people`

```text
id                 AniNexus 内部 ID
source             bangumi
source_id          Bangumi person ID
name
name_cn
image
metadata_json
source_updated_at
```

唯一键：`(source, source_id)`。

### 8.2 `subject_person_credits`

用于作者、监督、脚本、系列构成、制作公司等关系。

```text
subject_id
person_id
relation_type      creator | director | script | staff | studio
relation_label     Bangumi 返回的原始职位名称
position           展示顺序
```

唯一键：`(subject_id, person_id, relation_type, relation_label)`。

如果制作公司在上游不是普通 Person，也可以新增统一的 `entities` 表；第一版可先按 Person 关系保存，并保留原始标签。

### 8.3 `characters`

```text
id
source
source_id
name
name_cn
image
```

### 8.4 `subject_character_credits`

```text
subject_id
character_id
role_type           main | supporting | guest | other
position
```

### 8.5 `character_person_credits`

用于保存角色的声优关系。

```text
character_id
person_id
relation_type       voice_actor
language            可为空；上游可判断时再保存
```

推荐查询可将这三张关系表连接起来得到“某声优参与了哪些作品”。为了提升性能，可以额外维护只读的 `subject_voice_actors` 物化表或缓存，但不要放弃规范化的原始关系。

### 8.6 `user_preference_profiles`

```text
user_id
subject_type
profile_json        各标签、人物、公司、年份的权重和证据数量
source_version      算法版本
generated_at
```

收藏发生变化或 Bangumi 同步完成后异步重建；聊天期间优先读取缓存，避免每次扫描全部收藏。

### 8.7 `subject_enrichment_jobs`

```text
subject_id
status              pending | running | succeeded | failed
attempts
next_retry_at
last_error
updated_at
```

用于限流、失败重试和断点续传，不要在同步几百条收藏的 HTTP 请求中串行抓取所有人物关系。

## 9. 同步与自动读取流程

“自动读取”建议理解为：同步完成后由后端自动生成可供助手查询的本地数据，而不是每次打开助手都重新访问 Bangumi。

1. 用户主动点击“同步 Bangumi 收藏”。
2. 后端读取当前 Token 对应账号并更新 `subjects`、`collections`。
3. 对资料不完整或已过期的条目创建 `subject_enrichment_jobs`。
4. 后台 Worker 按 Bangumi 限流要求补全 Staff、角色、CV 和关联条目。
5. 数据补全后重新生成用户偏好画像。
6. 助手打开时先调用 `get_my_collection_overview`。
7. 若 `synced=false`，助手提示用户同步；若已同步，则按问题调用其他 Tool。

Access Token 只能保存在后端环境变量或密钥文件中，绝不能返回给前端或放进 Tool 输出。

## 10. AI 编排示例

### 示例一：推荐同 CV 的作品

用户：

> 我很喜欢《葬送的芙莉莲》，推荐几部有相同主要声优的动画。

建议调用链：

```text
search_subjects("葬送的芙莉莲")
  → get_subject_credits(subject_id, ["voice_actor"])
  → find_similar_subjects(subject_id, ["voice_actor"], exclude_collected=true)
  → 返回作品卡片和具体声优匹配理由
```

### 示例二：按个人口味推荐

用户：

> 根据我看过的作品推荐 8 部动画，不要我已经收藏的。

建议调用链：

```text
get_my_collection_overview(subject_type=2)
  → get_my_taste_profile(subject_type=2, dimensions=[tag, creator, staff, studio, voice_actor])
  → recommend_from_my_library(subject_type=2, exclude_collected=true, limit=8)
  → explain_recommendation(仅在推荐结果证据不足时调用)
```

### 示例三：同作者推荐

用户：

> 我收藏里有哪些作品是同一个作者的？

建议调用链：

```text
get_my_taste_profile(subject_type=null, dimensions=[creator], top_n=20)
  → 对参与收藏数大于 1 的作者返回分组结果
```

### 示例四：有歧义的作品名

用户：

> 推荐和 Fate 相似的。

`search_subjects` 如果返回多个高相关候选，助手应展示候选并让用户选择，不得擅自认定具体是哪一部。

## 11. 后端模块建议

```text
backend/src/aninexus_backend/
├── api/
│   ├── chat.py                  # /chat、/chat/history、SSE
│   └── recommendations.py       # 非模型调用也可使用的推荐 API
├── assistant/
│   ├── orchestrator.py          # 模型对话和 Tool 循环
│   ├── registry.py              # Tool 注册表、权限、超时和结果裁剪
│   ├── schemas.py               # Tool 输入输出 Pydantic 模型
│   └── tools/
│       ├── collections.py
│       ├── subjects.py
│       ├── people.py
│       ├── profiles.py
│       └── recommendations.py
├── recommendations/
│   ├── profile_builder.py
│   ├── candidate_generator.py
│   ├── scorer.py
│   └── explainer.py
├── integrations/
│   └── bangumi.py               # Bangumi 客户端和限流
└── workers/
    └── metadata_enrichment.py
```

Tool 注册表示意：

```python
@tool(
    name="find_similar_subjects",
    input_model=FindSimilarInput,
    output_model=RecommendationList,
    permission="library:read",
    timeout_seconds=5,
)
def find_similar_subjects_tool(
    payload: FindSimilarInput,
    context: ToolContext,
) -> RecommendationList:
    return recommendation_service.find_similar(
        session=context.db,
        user_id=context.user_id,
        subject_id=payload.subject_id,
        dimensions=payload.dimensions,
        exclude_collected=payload.exclude_collected,
        limit=payload.limit,
    )
```

`ToolContext.user_id` 由服务端认证中间件构造，不允许模型赋值。

## 12. Chat API 与前端事件

建议接口：

```text
POST /api/v1/chat
GET  /api/v1/chat/history?thread_id=...
```

`POST /chat` 使用 SSE 返回：

```text
event: tool_start
data: {"id":"call_123","name":"get_my_taste_profile","inputs":{"subject_type":2}}

event: tool_end
data: {"id":"call_123","name":"get_my_taste_profile","output":{"top_tags":[...]}}

event: message_chunk
data: {"content":"根据你的高分收藏……"}

event: done
data: {"thread_id":"..."}
```

建议在现有 `ToolCall` 类型中保留服务端提供的 `call_id`，不要再用“工具名 + 时间戳”猜测唯一标识。Tool 输出过大时，前端只展示摘要，完整结果保留在服务端日志中并进行脱敏。

助手最终回答可以同时返回结构化卡片：

```json
{
  "type": "subject_recommendations",
  "items": [
    {
      "subject_id": 123,
      "title": "示例作品",
      "cover": "https://...",
      "reasons": ["同声优：示例声优", "共同标签：奇幻"]
    }
  ]
}
```

点击卡片继续进入现有 `/subjects/{id}` 详情页，返回助手页时复用项目现有的滚动位置记忆机制。

## 13. 权限、隐私与安全边界

- 正式部署前必须替换当前开发环境的默认用户机制，使用真实登录态鉴权。
- 所有收藏 Tool 只能查询当前登录用户，不能接受任意 `user_id` 或 Bangumi 用户名。
- 前端传来的模型 API Key 当前通过请求头发送；后端不得写入普通日志或聊天历史。
- Bangumi Access Token 仅供服务端同步使用，不向大模型提供。
- Tool 调用设置超时、最大调用次数和单轮总耗时，防止模型无限循环。
- 每轮最多建议 6～8 次 Tool 调用；同参数调用应在单轮内去重。
- 对用户评论、标签等自由文本进行提示注入隔离：它们属于数据，不是系统指令。
- 自动 Tool 只读；新增、修改、删除收藏等写操作必须在界面上明确确认。
- 聊天记录、偏好画像应支持用户清空；删除账号时应同步删除私人数据。

## 14. 实施顺序

### 阶段 A：先让助手真正可用

1. 实现 `/api/v1/chat` 和 Tool 调用循环。
2. 封装 `get_my_collection_overview`、`list_my_collections`、`search_subjects`、`get_subject_detail`、`find_similar_subjects`。
3. 接通前端现有的 `chatWithBackend`，替换演示回复。
4. 修正 ToolCall 使用服务端 `call_id`。
5. 增加鉴权、调用上限、超时和结构化错误。

这一阶段已经可以回答“根据高分收藏推荐相似题材”和“同作者/同公司推荐”，但准确度取决于现有目录元数据。

### 阶段 B：补齐作者、Staff 和 CV

1. 新增人物、角色和关系表。
2. 把 Bangumi 请求逻辑提取成可复用客户端。
3. 增加后台补全队列和限流重试。
4. 封装 `get_subject_credits`、`find_subjects_by_person`、`recommend_by_people`。
5. 在同步完成界面显示“收藏已同步 / 人物资料补全中 / 推荐画像已更新”。

### 阶段 C：个性化排序与解释

1. 生成 `user_preference_profiles`。
2. 实现候选生成、负反馈、系列去重和多样性排序。
3. 封装 `recommend_from_my_library`、`get_my_taste_profile`、`compare_subjects`。
4. 为每条结果保存可验证的推荐证据。

### 阶段 D：交互完善

1. 增加类似 OtakuNeko 的 Tools 面板，让用户启用或关闭“读取收藏”“人物关系”“追番日历”等 Tool 组。
2. 推荐结果使用作品卡片展示，并支持打开详情页。
3. 保留工具调用折叠面板，但默认只展示友好名称和摘要。
4. 以后再增加需要确认的写操作 Tool。

## 15. 验收标准

- 未同步收藏时，助手不会伪造用户偏好，会明确提示先同步。
- 同步后，助手能读取当前用户的收藏数量和高分作品。
- “推荐相似题材”至少返回 5 条未收藏作品，并为每条提供真实匹配依据。
- “同作者”结果使用人物稳定 ID，不只依赖姓名字符串。
- “同 CV”结果能追溯到具体角色和声优关系。
- 用户明确要求排除已收藏作品时，结果中不出现已收藏条目。
- Tool 无法取到数据时返回“资料不完整”，模型不得补造事实。
- 不同用户之间无法通过 Tool 读取彼此收藏。
- 单次请求超时、上游 Bangumi 失败或模型失败时，前端有可理解的错误提示。
- Tool 调用过程能通过现有前端状态展示，最终回答可渲染推荐作品卡片。

## 16. 第一版建议范围

第一版不要同时完成所有功能。建议先交付下面 7 个只读 Tool：

1. `get_my_collection_overview`
2. `list_my_collections`
3. `search_subjects`
4. `get_subject_detail`
5. `find_similar_subjects`
6. `get_my_taste_profile`
7. `recommend_from_my_library`

然后再增加人物关系表和 3 个关系型 Tool：

1. `get_subject_credits`
2. `find_subjects_by_person`
3. `recommend_by_people`

这种拆分可以先让 AI 助手基于现有数据工作，再逐步把同作者、同 Staff 和同 CV 推荐做准，而不会让第一版被大规模数据补全工作卡住。
