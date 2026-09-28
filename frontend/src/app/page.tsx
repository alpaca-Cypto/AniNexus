"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Bot, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Heart, Library, LoaderCircle, Search, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import { toast } from "@lobehub/ui";
import TiltedCardLink from "@/components/motion/TiltedCardLink";
import SubjectModal from "@/components/Modal/SubjectModal";
import CoverImage from "@/components/media/CoverImage";
import {
  consumeHomeNavigationState,
  saveHomeNavigationState,
  type HomeMediaTab,
  type HomeSortKey,
} from "@/lib/homeNavigationMemory";
import type { SearchResult } from "@/services/search";
import { searchService } from "@/services/search";
import { getSubjectCover } from "@/lib/coverImage";
import { useOwnerStatus } from "@/components/auth/useOwnerStatus";
import { COLLECTIONS_UPDATED_EVENT, collectionService } from "@/services/collections";
import "./search-home.css";

type MediaTab = HomeMediaTab;
type SortKey = HomeSortKey;
const HISTORY_KEY = "aninexus-search-history";
const PAGE_SIZE = 36;

const quickLinks = [
  { href: "/collections", icon: Library, label: "打开收藏库" },
  { href: "/timetable", icon: CalendarDays, label: "查看追番计划" },
  { href: "/assistant", icon: Bot, label: "询问动漫助手" },
];

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
  } catch { return []; }
}

function displaySource(source?: string | null): string {
  if (source === "bangumi") return "Bangumi";
  if (source === "myanimelist") return "MAL";
  if (source === "douban") return "豆瓣";
  return "AniNexus";
}

export default function Home() {
  const { user, isOwner, loading: accountLoading } = useOwnerStatus();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [navigationReady, setNavigationReady] = useState(false);
  const [tab, setTab] = useState<MediaTab>("anime");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>(readHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [yearFrom, setYearFrom] = useState("");
  const [scoreFrom, setScoreFrom] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeQuery, setActiveQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<SearchResult | null>(null);
  const [collectionLoadingId, setCollectionLoadingId] = useState<number | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<{ userId: number; resultIds: string; savedIds: Set<number> } | null>(null);
  const [collectionStatusVersion, setCollectionStatusVersion] = useState(0);
  const skipRestoredFetchRef = useRef(false);
  const restoredScrollTopRef = useRef<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const userId = user?.id ?? null;
  const resultIds = results?.map(({ subject }) => subject.id).join(",") ?? "";
  const savedIds = collectionStatus?.userId === userId && collectionStatus.resultIds === resultIds
    ? collectionStatus.savedIds
    : null;
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  }, [page, totalPages]);

  useEffect(() => {
    const savedState = consumeHomeNavigationState();
    if (savedState) {
      skipRestoredFetchRef.current = true;
      restoredScrollTopRef.current = savedState.scrollTop;
      // Hydration from sessionStorage must happen after the client mounts.
      setTab(savedState.tab);
      setQuery(savedState.query);
      setShowFilters(savedState.showFilters);
      setYearFrom(savedState.yearFrom);
      setScoreFrom(savedState.scoreFrom);
      setSort(savedState.sort);
      setResults(savedState.results);
      setTotal(savedState.total);
      setPage(savedState.page);
      setActiveQuery(savedState.activeQuery);
    }
    setNavigationReady(true);
  }, []);

  const runSearch = (keyword = query, remember = true) => {
    const normalized = keyword.trim();
    setShowHistory(false);
    setPage(1);
    setActiveQuery(normalized);
    if (remember && normalized) {
      const next = [normalized, ...history.filter((item) => item !== normalized)].slice(0, 6);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    }
  };

  useEffect(() => {
    if (!navigationReady) return;
    if (skipRestoredFetchRef.current) {
      skipRestoredFetchRef.current = false;
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
    });
    void searchService.searchSubjectsPage({
      keyword: activeQuery,
      type: tab === "anime" ? 2 : 1,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      yearFrom: yearFrom ? Number(yearFrom) : undefined,
      scoreFrom: scoreFrom ? Number(scoreFrom) : undefined,
      sort,
    }).then((response) => {
      if (!active) return;
      setResults(response.items);
      setTotal(response.total);
    }).catch(() => {
      if (!active) return;
      setResults([]);
      setTotal(0);
      setError("暂时无法连接作品数据库，请确认后端服务已经启动。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [activeQuery, navigationReady, page, scoreFrom, sort, tab, yearFrom]);

  useEffect(() => {
    if (!navigationReady || restoredScrollTopRef.current === null) return;

    const scrollTop = restoredScrollTopRef.current;
    restoredScrollTopRef.current = null;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: scrollTop });
      secondFrame = requestAnimationFrame(() => scrollContainerRef.current?.scrollTo({ top: scrollTop }));
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [navigationReady, results]);

  useEffect(() => {
    const onCollectionsUpdated = () => setCollectionStatusVersion((version) => version + 1);
    window.addEventListener(COLLECTIONS_UPDATED_EVENT, onCollectionsUpdated);
    return () => window.removeEventListener(COLLECTIONS_UPDATED_EVENT, onCollectionsUpdated);
  }, []);

  useEffect(() => {
    if (accountLoading || userId === null || !results?.length) return;
    let active = true;
    const ids = results.map(({ subject }) => subject.id);
    const key = ids.join(",");
    void collectionService.getCollectionStatuses(ids).then(({ subject_ids }) => {
      if (active) setCollectionStatus({ userId, resultIds: key, savedIds: new Set(subject_ids) });
    }).catch(() => {
      if (active) toast.error({ title: "暂时无法读取收藏状态", description: "请稍后刷新页面重试。" });
    });
    return () => { active = false; };
  }, [accountLoading, userId, results, collectionStatusVersion]);

  const rememberListPosition = (targetSubjectId: number) => {
    if (!results) return;
    saveHomeNavigationState({
      tab,
      query,
      showFilters,
      yearFrom,
      scoreFrom,
      sort,
      results,
      total,
      page,
      activeQuery,
      scrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      targetSubjectId,
    });
  };

  const openCollection = async (subjectId: number) => {
    if (collectionLoadingId !== null) return;
    setCollectionLoadingId(subjectId);
    try {
      const item = await collectionService.getCollection(subjectId);
      setSelectedCollection(item);
    } catch (error) {
      toast.error({
        title: "无法打开收藏",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setCollectionLoadingId(null);
    }
  };

  const submitSearch = (event: FormEvent) => { event.preventDefault(); runSearch(); };
  const switchTab = (next: MediaTab) => { setTab(next); setPage(1); setResults(null); setError(""); };
  const changePage = (nextPage: number) => {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    if (boundedPage === page) return;
    setPage(boundedPage);
    requestAnimationFrame(() => {
      document.querySelector(".search-portal__results")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <div className="search-portal" ref={scrollContainerRef}>
      <main className="search-portal__main">
        <section className="search-portal__hero">
          <i className="search-portal__shape search-portal__shape--ring" aria-hidden="true" />
          <i className="search-portal__shape search-portal__shape--diamond" aria-hidden="true" />
          <p className="search-portal__edition"><Sparkles size={15} /> 动画与漫画资料库</p>
          <h1>アニメをもっと探そう</h1>
          <p className="search-portal__subtitle">发现下一部值得投入时间的作品</p>

          <div className="search-portal__tabs" role="tablist" aria-label="内容类型">
            <button role="tab" aria-selected={tab === "anime"} className={tab === "anime" ? "active" : ""} onClick={() => switchTab("anime")}>动漫</button>
            <button role="tab" aria-selected={tab === "manga"} className={tab === "manga" ? "active" : ""} onClick={() => switchTab("manga")}>漫画</button>
          </div>

          <form className="search-portal__search" onSubmit={submitSearch}>
            <div className="search-portal__input-wrap">
              <Search size={21} aria-hidden="true" />
              <input aria-label={`搜索${tab === "anime" ? "动漫" : "漫画"}`} placeholder={`搜索${tab === "anime" ? "动漫" : "漫画"}名称，例如：芙莉莲`} value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => history.length > 0 && setShowHistory(true)} />
              {query && <button className="search-portal__clear" type="button" aria-label="清空搜索词" onClick={() => setQuery("")}><X size={17} /></button>}
              {showHistory && history.length > 0 && (
                <div className="search-portal__history">
                  <div><span>最近搜索</span><button type="button" onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); setShowHistory(false); }}>清空</button></div>
                  {history.map((item) => <button type="button" key={item} onClick={() => { setQuery(item); runSearch(item); }}><Clock3 size={14} />{item}</button>)}
                </div>
              )}
            </div>
            <button className="search-portal__submit" type="submit" aria-label="搜索" disabled={loading}>{loading ? <LoaderCircle className="search-portal__spinner" size={19} /> : <Search size={19} />}<span>搜索</span></button>
          </form>

          <button className={`search-portal__filter-toggle ${showFilters ? "active" : ""}`} type="button" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={15} /> 筛选条件 <ChevronDown className={showFilters ? "rotated" : ""} size={15} /></button>
          {showFilters && (
            <div className="search-portal__filters">
              <label>起始年份<input type="number" min="1900" max={new Date().getFullYear()} placeholder="例如 2020" value={yearFrom} onChange={(event) => { setYearFrom(event.target.value); setPage(1); }} /></label>
              <label>最低评分<input type="number" min="0" max="10" step="0.1" placeholder="例如 8.0" value={scoreFrom} onChange={(event) => { setScoreFrom(event.target.value); setPage(1); }} /></label>
              <label>排序方式<select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }}><option value="score">评分优先</option><option value="date">最新作品</option><option value="title">标题顺序</option></select></label>
            </div>
          )}
        </section>

        <section className="search-portal__results" aria-live="polite" aria-busy={loading}>
          {!navigationReady || loading ? <div className="search-portal__skeletons">{Array.from({ length: PAGE_SIZE }, (_, index) => <div className="search-portal__skeleton" key={index}><i /><span /><span /></div>)}</div>
          : results && results.length > 0 ? <>
            <div className="search-portal__result-heading"><div><h2>{tab === "anime" ? "动漫" : "漫画"}搜索结果</h2><p>第 {page} / {totalPages} 页，共 {total.toLocaleString("zh-CN")} 个条目</p></div></div>
            <div className="search-portal__grid" key={`${tab}-${page}-${activeQuery}-${yearFrom}-${scoreFrom}-${sort}`}>{results.map((result, index) => {
              const { subject } = result;
              const title = subject.name_cn || subject.name;
              const cover = getSubjectCover(subject);
              const score = Number(subject.rating?.score || subject.score || 0);
              const scoreSource = displaySource(result.score_source || result.primary_source || subject.source);
              const sourceId = subject.source_id || subject.id;
              const isSaved = savedIds?.has(subject.id) ?? false;
              const collectionLabel = userId !== null && savedIds === null
                ? `查看 ${title} 的收藏状态`
                : `${isSaved ? "已收藏，编辑" : "收藏"} ${title}`;
              return <TiltedCardLink
                className="search-portal__card"
                href={`/subjects/${subject.id}`}
                key={`${subject.source}-${sourceId}`}
                style={{ "--card-index": Math.min(index, 11) } as CSSProperties}
                onClick={() => rememberListPosition(subject.id)}
                cover={<CoverImage src={cover} alt={`${title} 封面`} fill sizes="(max-width: 760px) 31vw, 180px" fallback={<div className="search-portal__cover-empty">AN</div>} />}
                badge={subject.type === 2 ? "动画" : "漫画"}
                details={<><h3>{title}</h3>{subject.name !== title && <p>{subject.name}</p>}<div>{score > 0 ? <span title={`评分来源：${scoreSource}`}><Star size={14} fill="currentColor" /> {scoreSource} {score.toFixed(1)}</span> : <span>暂无评分</span>}<span className="search-portal__freshness">{result.is_stale && <em title={result.data_updated_at ? `数据更新时间：${result.data_updated_at}` : "数据等待后台刷新"}>待更新</em>}<time>{subject.date?.slice(0, 4) || "年份未知"}</time></span></div></>}
                action={<button className={`search-portal__favorite${isSaved ? " is-saved" : ""}`} type="button" aria-label={collectionLabel} title={collectionLabel} disabled={collectionLoadingId === subject.id} onClick={() => void openCollection(subject.id)}>
                  {collectionLoadingId === subject.id ? <LoaderCircle className="search-portal__spinner" size={21} aria-hidden="true" /> : <Heart size={21} strokeWidth={2.5} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />}
                </button>}
              />;
            })}</div>
            {totalPages > 1 && <nav className="search-portal__pagination" aria-label="搜索结果分页">
              <button type="button" onClick={() => changePage(page - 1)} disabled={page === 1} aria-label="上一页"><ChevronLeft size={17} /><span>上一页</span></button>
              <div>{pageNumbers.map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? "active" : ""} aria-current={pageNumber === page ? "page" : undefined} onClick={() => changePage(pageNumber)}>{pageNumber}</button>)}</div>
              <button type="button" onClick={() => changePage(page + 1)} disabled={page === totalPages} aria-label="下一页"><span>下一页</span><ChevronRight size={17} /></button>
            </nav>}
          </>
          : results ? <div className="search-portal__state"><Search size={38} /><h2>{error ? "作品数据库暂不可用" : "没有找到匹配结果"}</h2><p>{error || "可以缩短关键词，或调整年份和评分条件。"}</p></div>
          : <div className="search-portal__welcome"><p>输入关键词开始搜索，也可以先进入你的个人内容空间。</p><div>{quickLinks.filter(({ href }) => isOwner || href !== "/assistant").map(({ href, icon: Icon, label }) => <Link href={href} key={href}><Icon size={19} /><span>{label}</span></Link>)}</div></div>}
        </section>
      </main>
      {selectedCollection && <SubjectModal isOpen onClose={() => setSelectedCollection(null)} initialValues={selectedCollection} />}
    </div>
  );
}
