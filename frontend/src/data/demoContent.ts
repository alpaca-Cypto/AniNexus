import type { SearchResult } from '@/services/search';
import type { BangumiItem } from '@/services/bangumiService';
import { WatchType } from '@/services/bangumiService';

export const DEMO_SEARCH_RESULTS: SearchResult[] = [
  { subject: { id: 1, source_id: 1, source: 'demo', type: 2, name: 'Sousou no Frieren', name_cn: '葬送的芙莉莲', date: '2023-09-29', short_summary: '勇者一行击败魔王之后，精灵魔法使重新理解时间与羁绊。', score: 9.4, rating: { score: 9.4 }, eps: 28, volumes: 0, image: '/banners/spring.png', tags: [{ name: '奇幻', count: 0, total_cont: 0 }, { name: '旅行', count: 0, total_cont: 0 }] }, collection: { type: 3, rate: 10 } },
  { subject: { id: 2, source_id: 2, source: 'demo', type: 2, name: 'Dungeon Meshi', name_cn: '迷宫饭', date: '2024-01-04', short_summary: '一支冒险小队一边探索迷宫，一边研究魔物料理。', score: 8.8, rating: { score: 8.8 }, eps: 24, volumes: 0, image: '/banners/autumn-v3.png', tags: [{ name: '冒险', count: 0, total_cont: 0 }, { name: '美食', count: 0, total_cont: 0 }] }, collection: { type: 2, rate: 9 } },
  { subject: { id: 3, source_id: 3, source: 'demo', type: 2, name: 'Bocchi the Rock!', name_cn: '孤独摇滚！', date: '2022-10-09', short_summary: '不擅长社交的少女加入乐队，在舞台上慢慢找到自己的位置。', score: 8.7, rating: { score: 8.7 }, eps: 12, volumes: 0, image: '/banners/summer.png', tags: [{ name: '音乐', count: 0, total_cont: 0 }, { name: '喜剧', count: 0, total_cont: 0 }] }, collection: { type: 2, rate: 9 } },
  { subject: { id: 4, source_id: 4, source: 'demo', type: 2, name: 'Kusuriya no Hitorigoto', name_cn: '药屋少女的呢喃', date: '2023-10-22', short_summary: '猫猫凭借药理知识解开后宫中的一连串谜团。', score: 8.5, rating: { score: 8.5 }, eps: 24, volumes: 0, image: '/banners/winter-v2.png', tags: [{ name: '推理', count: 0, total_cont: 0 }, { name: '古风', count: 0, total_cont: 0 }] }, collection: { type: 3, rate: 8 } },
  { subject: { id: 5, source_id: 5, source: 'demo', type: 2, name: 'Violet Evergarden', name_cn: '紫罗兰永恒花园', date: '2018-01-11', short_summary: '自动手记人偶通过代写书信，寻找爱的含义。', score: 8.6, rating: { score: 8.6 }, eps: 13, volumes: 0, image: '/banners/winter.png', tags: [{ name: '治愈', count: 0, total_cont: 0 }, { name: '成长', count: 0, total_cont: 0 }] }, collection: { type: 1, rate: 0 } },
  { subject: { id: 6, source_id: 6, source: 'demo', type: 2, name: 'Skip and Loafer', name_cn: '跃动青春', date: '2023-04-04', short_summary: '从乡下到东京求学的少女，开始一段明亮又笨拙的校园生活。', score: 8.3, rating: { score: 8.3 }, eps: 12, volumes: 0, image: '/banners/spring.png', tags: [{ name: '校园', count: 0, total_cont: 0 }, { name: '日常', count: 0, total_cont: 0 }] }, collection: { type: 1, rate: 0 } },
  { subject: { id: 7, source_id: 7, source: 'demo', type: 1, name: 'Blue Period', name_cn: '蓝色时期', date: '2017-06-24', short_summary: '优等生矢口八虎被绘画吸引，决定挑战东京艺术大学。', score: 8.4, rating: { score: 8.4 }, eps: 0, volumes: 15, image: '/banners/summer.png', tags: [{ name: '漫画', count: 0, total_cont: 0 }, { name: '艺术', count: 0, total_cont: 0 }] }, collection: { type: 3, rate: 9 } },
  { subject: { id: 8, source_id: 8, source: 'demo', type: 1, name: 'Witch Hat Atelier', name_cn: '尖帽子的魔法工坊', date: '2016-07-22', short_summary: '憧憬魔法的少女发现秘密后，踏入魔法师的世界。', score: 8.9, rating: { score: 8.9 }, eps: 0, volumes: 13, image: '/banners/autumn.png', tags: [{ name: '漫画', count: 0, total_cont: 0 }, { name: '魔法', count: 0, total_cont: 0 }] }, collection: { type: 1, rate: 0 } },
];

export const DEMO_SCHEDULES: BangumiItem[] = DEMO_SEARCH_RESULTS.slice(0, 6).map((item, index) => ({
  subject: { ...item.subject, source_id: String(item.subject.source_id ?? item.subject.id), images: { ...item.subject.images, common: item.subject.image || '', large: item.subject.image || '' } },
  collection: { source: 'demo', source_id: String(item.subject.source_id ?? item.subject.id), user_id: 1, type: item.collection?.type },
  watch_day: [0, 1, 2, 4, 5, 6][index],
  watch_time: ['19:00', '20:20', '21:00', '22:00', '18:40', '21:40'][index],
  watch_type: index < 2 ? WatchType.MEAL : index < 4 ? WatchType.NEW : WatchType.LEISURE,
  duration: 1,
}));
