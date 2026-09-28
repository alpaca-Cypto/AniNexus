'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, CircleAlert, Clock3, DatabaseZap, RefreshCw } from 'lucide-react';
import CoverImage from '@/components/media/CoverImage';
import {
  getCatalogRefresh,
  type CatalogRefreshResponse,
  type CatalogRefreshRun,
  type RefreshAction,
} from '@/services/catalogRefresh';
import './updates.css';

const actionLabels: Record<RefreshAction, string> = {
  all: '全部', changed: '有变化', created: '新增', updated: '内容变更', linked: '关联旧库',
  unchanged: '无变化', review: '待复核', skipped: '已跳过', failed: '失败',
};
const filters: RefreshAction[] = [
  'changed', 'all', 'created', 'updated', 'linked', 'unchanged', 'review', 'skipped', 'failed',
];
const pageSize = 50;

function displayTime(value: string | null): string {
  if (!value) return '进行中';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function runStatus(run: CatalogRefreshRun): string {
  if (run.status === 'running') return '正在刷新';
  if (run.status === 'failed') return '运行失败';
  if (run.status === 'partial') return '部分完成';
  return '已完成';
}

export default function UpdatesPage() {
  const [data, setData] = useState<CatalogRefreshResponse | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [action, setAction] = useState<RefreshAction>('changed');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getCatalogRefresh({ runId, action, offset: (page - 1) * pageSize, signal: controller.signal })
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : '无法读取数据更新记录');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [runId, action, page, tick]);

  const selected = data?.runs.find((run) => run.id === data.selected_run_id);
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  function selectRun(id: number) {
    setRunId(id);
    setAction('changed');
    setPage(1);
    setLoading(true);
  }

  function selectAction(value: RefreshAction) {
    setAction(value);
    setPage(1);
    setLoading(true);
  }

  return (
    <div className="updates-page">
      <div className="updates-page__inner">
        <header className="updates-page__header">
          <div>
            <p className="updates-page__section-label">BANGUMI · 数据记录</p>
            <h1>数据更新</h1>
            <p>查看每日刷新了哪些作品，以及它们如何进入 AniNexus 作品库。</p>
          </div>
          <button className="updates-page__reload" type="button" onClick={() => { setLoading(true); setTick((value) => value + 1); }} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> 刷新记录
          </button>
        </header>

        {error && (
          <div className="updates-page__error" role="alert">
            <CircleAlert size={19} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => { setLoading(true); setTick((value) => value + 1); }}>重试读取</button>
          </div>
        )}

        {loading && !data ? (
          <div className="updates-page__loading" aria-label="正在加载更新记录">
            <span /><span /><span />
          </div>
        ) : data?.runs.length === 0 ? (
          <div className="updates-page__empty">
            <DatabaseZap size={30} aria-hidden="true" />
            <h2>还没有保存的刷新记录</h2>
            <p>下一次 Bangumi 定向刷新完成后，运行结果和条目变化会显示在这里。</p>
            <Link href="/">浏览作品库 <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
        ) : data && selected ? (
          <>
            <section className="updates-page__overview" aria-label="所选刷新概况">
              <div className="updates-page__overview-main">
                <span className={`updates-page__status updates-page__status--${selected.status}`}>{runStatus(selected)}</span>
                <h2>{displayTime(selected.started_at)} 的更新</h2>
                <p>检查 {selected.scanned} 条 · {selected.finished_at ? `结束于 ${displayTime(selected.finished_at)}` : '结果仍在写入'}</p>
                {selected.error_kind && <p className="updates-page__run-error">中断原因：{selected.error_kind}</p>}
              </div>
              <dl className="updates-page__counts">
                <div><dt>新增</dt><dd>{selected.created}</dd></div>
                <div><dt>内容变更</dt><dd>{selected.updated}</dd></div>
                <div><dt>关联旧库</dt><dd>{selected.linked}</dd></div>
                <div><dt>失败</dt><dd>{selected.failed}</dd></div>
              </dl>
            </section>

            <div className="updates-page__workspace">
              <aside className="updates-page__history" aria-label="最近运行">
                <h2><Clock3 size={17} aria-hidden="true" /> 最近运行</h2>
                <div className="updates-page__history-list">
                  {data.runs.map((run) => (
                    <button key={run.id} type="button" className={run.id === selected.id ? 'active' : ''} aria-current={run.id === selected.id ? 'true' : undefined} onClick={() => selectRun(run.id)}>
                      <span>{displayTime(run.started_at)}</span>
                      <small>{runStatus(run)} · {run.scanned} 条</small>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="updates-page__results" aria-label="条目变化">
                <div className="updates-page__results-head">
                  <div><h2>条目记录</h2><p>每条记录可查看对应作品；无变化的条目也会保留检查结果。</p></div>
                  <span>{data.total} 条</span>
                </div>
                <div className="updates-page__filters" role="group" aria-label="筛选更新结果">
                  {filters.map((value) => (
                    <button key={value} type="button" className={action === value ? 'active' : ''} aria-pressed={action === value} onClick={() => selectAction(value)}>{actionLabels[value]}</button>
                  ))}
                </div>

                {loading ? (
                  <div className="updates-page__loading updates-page__loading--rows" aria-label="正在加载条目"><span /><span /><span /></div>
                ) : data.items.length ? (
                  <ul className="updates-page__items">
                    {data.items.map((item) => {
                      const content = (
                        <>
                          <div className="updates-page__cover">
                            <CoverImage src={item.image} alt="" fill sizes="48px" fallback={<span>AN</span>} />
                          </div>
                          <div className="updates-page__item-copy">
                            <strong>{item.name || `Bangumi 条目 ${item.bangumi_id}`}</strong>
                            <span>Bangumi #{item.bangumi_id}{item.subject_type === 1 ? ' · 书籍' : item.subject_type === 2 ? ' · 动画' : ''}</span>
                          </div>
                          <span className={`updates-page__action updates-page__action--${item.action}`}>{actionLabels[item.action]}</span>
                          {item.subject_id && <ArrowUpRight className="updates-page__item-arrow" size={17} aria-hidden="true" />}
                        </>
                      );
                      return <li key={item.id}>{item.subject_id ? <Link href={`/subjects/${item.subject_id}`}>{content}</Link> : <div>{content}</div>}</li>;
                    })}
                  </ul>
                ) : (
                  <div className="updates-page__no-items">这一轮没有“{actionLabels[action]}”条目。可以切换筛选查看其他结果。</div>
                )}

                {totalPages > 1 && (
                  <nav className="updates-page__pagination" aria-label="条目记录分页">
                    <button type="button" disabled={page === 1 || loading} onClick={() => { setPage((value) => value - 1); setLoading(true); }}>上一页</button>
                    <span>第 {page} / {totalPages} 页</span>
                    <button type="button" disabled={page === totalPages || loading} onClick={() => { setPage((value) => value + 1); setLoading(true); }}>下一页</button>
                  </nav>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
