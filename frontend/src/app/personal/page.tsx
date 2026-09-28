"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookMarked, Bot, CalendarDays, RefreshCw } from "lucide-react";
import { useOwnerStatus } from "@/components/auth/useOwnerStatus";
import { request } from "@/services/client";
import "./personal.css";

type LibraryStats = { total: number; anime: number; books: number; games: number };

export default function PersonalPage() {
  const { user } = useOwnerStatus();
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void request<LibraryStats>("/dashboard/stats")
      .then((result) => { if (active) { setStats(result); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [user, refresh]);

  return (
    <div className="personal-overview">
      <div className="personal-overview__inner">
        <header className="personal-overview__heading">
          <p className="personal-overview__eyebrow">我的空间</p>
          <h1>{user ? `${user.username}，欢迎回来` : "正在读取账号…"}</h1>
          <p>从自己的收藏和追番计划继续。头像可在页面右上角更换。</p>
        </header>

        <section className="personal-overview__summary" aria-labelledby="personal-library-title">
          <div>
            <h2 id="personal-library-title">我的收藏</h2>
            {error ? (
              <p role="alert">暂时无法读取收藏数量。</p>
            ) : (
              <p role="status">{stats ? `已收藏 ${stats.total} 部作品，其中动画 ${stats.anime} 部。` : "正在读取收藏数量…"}</p>
            )}
          </div>
          {error ? (
            <button onClick={() => setRefresh((value) => value + 1)} type="button"><RefreshCw size={16} />重新读取</button>
          ) : (
            <Link href="/collections">管理收藏 <ArrowRight size={17} /></Link>
          )}
        </section>

        <nav className="personal-overview__links" aria-label="个人功能">
          <Link href="/collections">
            <BookMarked size={23} aria-hidden="true" />
            <span><strong>收藏库</strong><small>查看和整理自己的作品</small></span>
            <ArrowRight size={19} aria-hidden="true" />
          </Link>
          <Link href="/timetable">
            <CalendarDays size={23} aria-hidden="true" />
            <span><strong>追番计划</strong><small>安排本周要看的内容</small></span>
            <ArrowRight size={19} aria-hidden="true" />
          </Link>
          {user?.is_owner && <Link href="/personal/ai">
            <Bot size={23} aria-hidden="true" />
            <span><strong>AI 角色设置</strong><small>管理仅自己可用的助手角色</small></span>
            <ArrowRight size={19} aria-hidden="true" />
          </Link>}
        </nav>
      </div>
    </div>
  );
}
