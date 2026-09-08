"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Compass,
  ExternalLink,
  Library,
  ListFilter,
  Play,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { CursorEffects } from "@/components/CursorEffects";

const workspace = [
  { href: "/collections", icon: Library, title: "我的收藏库", description: "整理想看、在看和看过的作品", accent: "violet" },
  { href: "/Timetable", icon: CalendarDays, title: "追番日历", description: "查看每周放送并安排观看计划", accent: "cyan" },
  { href: "/assistant", icon: Bot, title: "AI 动漫助手", description: "搜索资料、比较作品并获取推荐", accent: "rose" },
  { href: "/Personal", icon: UserRound, title: "个人画像", description: "管理偏好、角色和推荐依据", accent: "amber" },
];

const resources = [
  { href: "https://bgm.tv/", domain: "bgm.tv", tag: "资料 / 评分", title: "Bangumi 番组计划", description: "查看作品条目、评分、角色与制作人员资料", icon: "B", color: "#f09199" },
  { href: "https://www.bilibili.com/anime", domain: "bilibili.com", tag: "正版观看", title: "哔哩哔哩番剧", description: "浏览正版番剧、热播榜与新番时间表", icon: "哔", color: "#32b9df" },
  { href: "https://anilist.co/search/anime", domain: "anilist.co", tag: "趋势 / 发现", title: "AniList", description: "发现当季热门、趋势作品和全球榜单", icon: "A", color: "#5c7cff" },
  { href: "https://myanimelist.net/anime/season", domain: "myanimelist.net", tag: "季度索引", title: "MyAnimeList", description: "按季度浏览新番、排名和用户评价", icon: "M", color: "#5473c8" },
];

export default function Home() {
  return (
    <div className="admin-dashboard resource-dashboard">
      <CursorEffects />
      <header className="admin-topbar">
        <div><p className="admin-breadcrumb">NEXUS / HOME</p><h1>AniNexus 导航台</h1></div>
        <div className="admin-top-actions">
          <Link href="/collections" className="admin-add-button"><Search size={16} /> 搜索我的收藏</Link>
        </div>
      </header>

      <div className="admin-content">
        <section className="resource-hero">
          <div>
            <span className="admin-eyebrow"><Sparkles size={14} /> ANIME STARTS HERE</span>
            <h2>从一个入口，前往<br /><em>你的动画世界。</em></h2>
            <p>不展示没有数据来源的统计，只保留真正可以使用的功能与站点。</p>
            <div className="admin-hero-actions">
              <Link href="/collections">打开收藏库 <ArrowRight size={16} /></Link>
              <a href="https://bgm.tv/" target="_blank" rel="noreferrer">浏览 Bangumi <ExternalLink size={15} /></a>
            </div>
          </div>
          <div className="resource-prism" aria-hidden="true">
            <span className="geo-main">AN</span><i className="geo-ring" /><b className="geo-square" />
            <span className="geo-dot" /><span className="geo-zigzag">〰</span><span className="geo-star">✦</span>
          </div>
        </section>

        <section className="resource-section">
          <div className="resource-heading"><div><span>WORKSPACE</span><h2>项目功能</h2></div><p>所有入口均连接现有页面</p></div>
          <div className="workspace-grid">
            {workspace.map(({ href, icon: Icon, title, description, accent }) => (
              <Link href={href} className={`workspace-card ${accent}`} key={href}>
                <span className="workspace-icon"><Icon size={21} /></span>
                <div><strong>{title}</strong><p>{description}</p></div><ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </section>

        <section className="resource-section">
          <div className="resource-heading"><div><span>DISCOVER</span><h2>动漫站点</h2></div><p>在新窗口安全打开，不破坏当前工作台</p></div>
          <div className="site-grid">
            {resources.map((site, index) => (
              <a href={site.href} target="_blank" rel="noreferrer" className={`site-card site-card-${index + 1}`} key={site.href}>
                <div className="site-card-top"><span className="site-logo" style={{ background: site.color }}>{site.icon}</span><span className="site-tag">{site.tag}</span><ExternalLink size={15} /></div>
                <strong>{site.title}</strong><p>{site.description}</p><small>{site.domain}</small>
              </a>
            ))}
          </div>
        </section>

        <section className="resource-callout">
          <Compass size={22} /><div><strong>想加入其他站点？</strong><p>后续可以继续添加官网、资料库、正版播放平台或自建服务。</p></div>
          <Link href="/assistant"><ListFilter size={16} /> 让助手帮我筛选</Link>
        </section>
      </div>
    </div>
  );
}
