"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Bot, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Library, LoaderCircle, Search, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import TiltedCardLink from "@/components/motion/TiltedCardLink";
import type { SearchResult } from "@/services/search";
import { searchService } from "@/services/search";
import "./search-home.css";

type MediaTab = "anime" | "manga";
type SortKey = "score" | "date" | "title";
const HISTORY_KEY = "aninexus-search-history";
const PAGE_SIZE = 36;

const quickLinks = [
  { href: "/collections", icon: Library, label: "打开收藏库" },
  { href: "/Timetable", icon: CalendarDays, label: "查看追番日历" },
  { href: "/assistant", icon: Bot, label: "询问动漫助手" },
];

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
  } catch { return []; }
}

export default function Home() {
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  }, [page, totalPages]);

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
    let active = true;
    setLoading(true);
    setError("");
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
  }, [activeQuery, page, scoreFrom, sort, tab, yearFrom]);

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
    <div className="search-portal">
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
          {loading ? <div className="search-portal__skeletons">{Array.from({ length: PAGE_SIZE }, (_, index) => <div className="search-portal__skeleton" key={index}><i /><span /><span /></div>)}</div>
          : results && results.length > 0 ? <>
            <div className="search-portal__result-heading"><div><h2>{tab === "anime" ? "动漫" : "漫画"}搜索结果</h2><p>第 {page} / {totalPages} 页，共 {total.toLocaleString("zh-CN")} 个条目</p></div></div>
            <div className="search-portal__grid" key={`${tab}-${page}-${activeQuery}-${yearFrom}-${scoreFrom}-${sort}`}>{results.map(({ subject }, index) => {
              const title = subject.name_cn || subject.name;
              const cover = subject.images?.large || subject.images?.common || subject.image;
              const score = Number(subject.rating?.score || subject.score || 0);
              const sourceId = subject.source_id || subject.id;
              return <TiltedCardLink className="search-portal__card" href={`/subjects/${subject.id}`} key={`${subject.source}-${sourceId}`} style={{ "--card-index": Math.min(index, 11) } as CSSProperties}>
                <div className="search-portal__cover">{cover ? <Image src={cover} alt={`${title} 封面`} fill sizes="(max-width: 760px) 46vw, 180px" referrerPolicy="no-referrer" /> : <div className="search-portal__cover-empty">AN</div>}<span>{subject.type === 2 ? "动画" : "书籍"}</span></div>
                <div className="search-portal__card-copy"><h3>{title}</h3>{subject.name !== title && <p>{subject.name}</p>}<div>{score > 0 ? <span><Star size={14} fill="currentColor" /> {score.toFixed(1)}</span> : <span>暂无评分</span>}<time>{subject.date?.slice(0, 4) || "年份未知"}</time></div></div>
              </TiltedCardLink>;
            })}</div>
            {totalPages > 1 && <nav className="search-portal__pagination" aria-label="搜索结果分页">
              <button type="button" onClick={() => changePage(page - 1)} disabled={page === 1} aria-label="上一页"><ChevronLeft size={17} /><span>上一页</span></button>
              <div>{pageNumbers.map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? "active" : ""} aria-current={pageNumber === page ? "page" : undefined} onClick={() => changePage(pageNumber)}>{pageNumber}</button>)}</div>
              <button type="button" onClick={() => changePage(page + 1)} disabled={page === totalPages} aria-label="下一页"><span>下一页</span><ChevronRight size={17} /></button>
            </nav>}
          </>
          : results ? <div className="search-portal__state"><Search size={38} /><h2>{error ? "作品数据库暂不可用" : "没有找到匹配结果"}</h2><p>{error || "可以缩短关键词，或调整年份和评分条件。"}</p></div>
          : <div className="search-portal__welcome"><p>输入关键词开始搜索，也可以先进入你的个人内容空间。</p><div>{quickLinks.map(({ href, icon: Icon, label }) => <Link href={href} key={href}><Icon size={19} /><span>{label}</span></Link>)}</div></div>}
        </section>
      </main>
    </div>
  );
}
