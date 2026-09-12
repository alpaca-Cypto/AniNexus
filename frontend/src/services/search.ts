// 定义搜索相关的类型接口
interface Subject {
  id: number;
  date?: string | null;
  images?: {
    small?: string;
    grid?: string;
    large?: string;
    medium?: string;
    common?: string;
  };
  name: string;
  name_cn: string;
  short_summary: string;
  tags?: Array<{
    name: string;
    count: number;
    total_cont: number;
  }>;
  score: number;
  type: number;
  eps: number;
  volumes: number;
  source: string;
  platform?: string;
  image?: string;
  source_id?: number;
  rating?: {
    score: number;
  };
  summary?: string;
}

interface Collection {
  type?: number;
  rate?: number;
  comment?: string;
  vol_status?: number;
  ep_status?: number;
  tags?: string[];
}

interface SearchResult {
  subject: Subject;
  collection?: Collection;
}

interface SearchResponse {
  items: SearchResult[];
  total: number;
}

// 搜索参数接口
interface SearchParams {
  keyword: string;
  type?: number;
  offset?: number;
  limit?: number;
  yearFrom?: number;
  scoreFrom?: number;
  sort?: 'score' | 'date' | 'title';
}

// 搜索服务
class SearchService {
  // 基础 API URL
  private baseUrl = '/api/v1';

  /**
   * 搜索条目
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async searchSubjectsPage(params: SearchParams): Promise<SearchResponse> {
    const {
      keyword,
      type,
      offset = 0,
      limit = 10,
      yearFrom,
      scoreFrom,
      sort = 'score',
    } = params;

    try {
      const token = localStorage.getItem('token');
      const query = new URLSearchParams({
        q: keyword,
        limit: String(limit),
        offset: String(offset),
        sort,
      });
      if (type) query.set('type', String(type));
      if (yearFrom) query.set('year_from', String(yearFrom));
      if (scoreFrom !== undefined) query.set('score_from', String(scoreFrom));
      const response = await fetch(
        `${this.baseUrl}/subjects?${query.toString()}`,
        {
          method: 'GET',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data: SearchResponse = await response.json();
      return { items: data.items || [], total: data.total || 0 };
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  async searchSubjects(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.searchSubjectsPage(params);
    return response.items;
  }

  async getSubject(id: number): Promise<SearchResult> {
    const response = await fetch(`${this.baseUrl}/subjects/${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(response.status === 404 ? 'Subject not found' : `Detail failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * 加载更多搜索结果
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async loadMoreSubjects(params: SearchParams): Promise<SearchResult[]> {
    return this.searchSubjects(params);
  }
}

// 导出单例实例
export const searchService = new SearchService();

// 导出类型
export type { Subject, Collection, SearchResult, SearchParams, SearchResponse };
