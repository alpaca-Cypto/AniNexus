export type RefreshAction =
  | 'all' | 'changed' | 'created' | 'updated' | 'linked' | 'unchanged'
  | 'review' | 'skipped' | 'failed';

export interface CatalogRefreshRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  scanned: number;
  created: number;
  updated: number;
  linked: number;
  unchanged: number;
  review: number;
  skipped: number;
  failed: number;
  error_kind: string | null;
}

export interface CatalogRefreshItem {
  id: number;
  subject_id: number | null;
  bangumi_id: string;
  subject_type: number | null;
  name: string | null;
  action: Exclude<RefreshAction, 'all' | 'changed'>;
  error_kind: string | null;
  recorded_at: string;
  image: string | null;
}

export interface CatalogRefreshResponse {
  runs: CatalogRefreshRun[];
  selected_run_id: number | null;
  total: number;
  items: CatalogRefreshItem[];
}

export async function getCatalogRefresh(params: {
  runId?: number | null;
  action?: RefreshAction;
  offset?: number;
  signal?: AbortSignal;
} = {}): Promise<CatalogRefreshResponse> {
  const query = new URLSearchParams({
    action: params.action || 'changed',
    limit: '50',
    offset: String(params.offset || 0),
  });
  if (params.runId) query.set('run_id', String(params.runId));
  const response = await fetch(`/api/v1/catalog-refresh?${query}`, {
    cache: 'no-store', signal: params.signal,
  });
  if (!response.ok) throw new Error('无法读取数据更新记录');
  return response.json() as Promise<CatalogRefreshResponse>;
}
