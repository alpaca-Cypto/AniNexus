# Services 模块

前端 API 服务层，封装与后端 `http://localhost:8000/api/v1` 的通信。

## 核心文件

| 文件 | 职责 | 依赖 |
|------|------|------|
| `client.ts` | 通用 `request<T>()` 封装，使用同站 HttpOnly 会话 Cookie，统一错误处理 | 原生 `fetch` |
| `auth.ts` | 登录/用户检查/Bangumi 用户同步 | `client.ts` |
| `collections.ts` | 收藏 CRUD、Bangumi 同步、豆瓣上传 | `client.ts` |
| `scheduleService.ts` | 排班数据获取与批量 upsert（含收藏→排班转换逻辑） | `client.ts` |
| `bangumiService.ts` | Bangumi 日历数据获取与类型定义（BangumiItem, SubjectInfo, CollectionInfo） | `client.ts` |
| `CalendarService.ts` | 日历事件生成（CSV 导出、iCal 结构） | `dayjs`, `bangumiService.ts` |
| `rss.ts` | RSS 订阅源管理（规则 CRUD、订阅项列表） | `client.ts` |
| `dashboard.ts` | 仪表板统计数据 | `client.ts` |
| `search.ts` | 条目搜索 | 原生 `fetch`（**未使用 client.ts**） |

## 类型体系

核心数据模型定义分布在：
- [bangumiService.ts](bangumiService.ts) — `BangumiItem`, `SubjectInfo`, `CollectionInfo`, `WatchType` 枚举
- [collections.ts](collections.ts) — `CollectionItem`, `CollectionListResponse`
- [scheduleService.ts](scheduleService.ts) — `ScheduleBase`, `ScheduleRead`, `ScheduleUpsertList`
- [auth.ts](auth.ts) — `LoginRequest`, `LoginResponse`, `UserInfo`

## 注意事项

- 当前主登录入口在 `components/auth/AuthControl.tsx`。旧 `auth.ts`/`LoginModal.tsx` 未接入页面，接口模型已过时，不应重新用于生产登录。
- `search.ts` 未复用 `client.ts` 的 `request()`，存在代码风格不一致
- `scheduleService.ts` 包含业务逻辑（收藏搜索空结果时回退到 subjects 接口），职责略超 API 层
