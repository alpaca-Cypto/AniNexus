import type { Collection, SearchResult } from './search';
import { request } from './client';

// 同步收藏请求参数
export interface CollectionSyncRequest {
  subject_type?: number;
  collection_type?: number;
  limit?: number;
  offset?: number;
}

// 同步收藏响应
export interface CollectionSyncResponse {
  message: string;
  username: string;
  sync_count: number;
  import_count: number;
  subject_type?: number;
  source: string;
}

export interface BangumiTokenStatus {
  configured: boolean;
  username: string | null;
}

// 收藏项类型
export interface CollectionItem {
  id: string;
  title: string;
  cover: string;
  type: string;
  status: string;
  score: number;
  eps?: number;
  source: string;
  source_id: string;
}

// 收藏列表响应
export interface CollectionListResponse {
  total: number;
  items: Array<SearchResult & { collection: Collection }>;
}

export interface CollectionStatusResponse {
  subject_ids: number[];
}

export interface CollectionSaveRequest {
  subject: {
    source: string;
    source_id: string;
    type: number;
    name: string;
    name_cn?: string | null;
    summary?: string | null;
    date?: string | null;
    platform?: string | null;
    eps?: number | null;
    volumes?: number | null;
    image?: string | null;
    score?: number | null;
    tags?: string[];
  };
  collection: {
    type: number;
    rate?: number | null;
    comment?: string | null;
    ep_status?: number;
    vol_status?: number;
    tags?: string[];
  };
}

export type CollectionSaveResponse = SearchResult & {
  message: string;
  collection: Collection;
};

export const COLLECTIONS_UPDATED_EVENT = 'aninexus:collections-updated';

// 获取收藏列表请求参数
export interface GetCollectionsRequest {
  subject_type?: number;
  status?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
}

// 豆瓣 JSON 上传请求参数
export interface DoubanUploadRequest {
  subject_type?: string;
  data: unknown[];
}

// 收藏服务
export const collectionService = {
  async getCollectionStatuses(subjectIds: number[]): Promise<CollectionStatusResponse> {
    const params = new URLSearchParams();
    subjectIds.forEach((id) => params.append('subject_ids', String(id)));
    return request<CollectionStatusResponse>(`/collections/status?${params.toString()}`);
  },

  async getCollection(subjectId: number): Promise<SearchResult> {
    return request<SearchResult>(`/collections/${subjectId}`);
  },

  // 保存单个条目及其收藏状态，存在时更新，不存在时创建
  async saveCollection(data: CollectionSaveRequest): Promise<CollectionSaveResponse> {
    return request<CollectionSaveResponse>('/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 同步用户的 Bangumi 收藏数据到本地数据库
  async syncBgm(data: CollectionSyncRequest = {}): Promise<CollectionSyncResponse> {
    return request<CollectionSyncResponse>('/collections/sync/bgm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getBangumiTokenStatus(): Promise<BangumiTokenStatus> {
    return request<BangumiTokenStatus>('/collections/import/bangumi/token');
  },

  async saveBangumiToken(accessToken: string): Promise<BangumiTokenStatus> {
    return request<BangumiTokenStatus>('/collections/import/bangumi/token', {
      method: 'PUT',
      body: JSON.stringify({ access_token: accessToken }),
    });
  },

  async deleteBangumiToken(): Promise<void> {
    return request<void>('/collections/import/bangumi/token', { method: 'DELETE' });
  },

  async importBangumi(accessToken: string | null, subjectType: number | null): Promise<CollectionSyncResponse> {
    return request<CollectionSyncResponse>('/collections/import/bangumi', {
      method: 'POST',
      body: JSON.stringify({ ...(accessToken ? { access_token: accessToken } : {}), subject_type: subjectType }),
    });
  },

  // 获取收藏列表
  async getCollections(data: GetCollectionsRequest = {}): Promise<CollectionListResponse> {
    // 构建查询参数
    const params = new URLSearchParams();
    if (data.subject_type !== undefined) params.append('subject_type', data.subject_type.toString());
    if (data.status !== undefined) params.append('status', data.status.toString());
    if (data.keyword) params.append('keyword', data.keyword);
    if (data.limit) params.append('limit', data.limit.toString());
    if (data.offset) params.append('offset', data.offset.toString());
    if (data.sort_by) params.append('sort_by', data.sort_by);

    const queryString = params.toString();
    const endpoint = `/collections${queryString ? `?${queryString}` : ''}`;

    return request<CollectionListResponse>(endpoint, {
      method: 'GET',
    });
  },

  // 上传豆瓣 JSON 数据
  async uploadDouban(data: DoubanUploadRequest): Promise<CollectionSyncResponse> {
    return request<CollectionSyncResponse>('/collections/upload/douban', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
