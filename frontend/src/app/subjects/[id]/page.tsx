"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BellOff, BellRing, BookOpen, CalendarDays, ExternalLink, Film, Globe2, PlayCircle, Star } from "lucide-react";
import { hasUpdateReminder, toggleUpdateReminder } from "@/lib/updateReminders";
import type { Subject } from "@/services/search";
import { searchService } from "@/services/search";
import "./subject-detail.css";

const videoPlatforms = [
  { name: "哔哩哔哩", buildUrl: (title: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}` },
  { name: "腾讯视频", buildUrl: (title: string) => `https://v.qq.com/x/search/?q=${encodeURIComponent(title)}` },
  { name: "爱奇艺", buildUrl: (title: string) => `https://so.iqiyi.com/so/q_${encodeURIComponent(title)}` },
];

export default function SubjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);

  useEffect(() => {
    const subjectId = Number(id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      setError("这个作品地址无效。");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void searchService.getSubject(subjectId)
      .then(({ subject: nextSubject }) => {
        if (!active) return;
        setSubject(nextSubject);
        setReminderEnabled(hasUpdateReminder({ subject: nextSubject }));
      })
      .catch(() => {
        if (active) setError("没有找到这个作品，或详情服务暂时不可用。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const sourceWebsite = useMemo(() => {
    if (!subject?.source_id) return null;
    const source = subject.source.toLocaleLowerCase();
    if (source === "myanimelist") {
      const category = subject.type === 2 ? "anime" : "manga";
      return {
        name: "MyAnimeList",
        url: `https://myanimelist.net/${category}/${subject.source_id}`,
      };
    }
    if (source === "bangumi") {
      return { name: "Bangumi", url: `https://bgm.tv/subject/${subject.source_id}` };
    }
    return null;
  }, [subject]);

  const handleBack = () => {
    if (document.referrer.startsWith(window.location.origin)) router.back();
    else router.push("/");
  };

  const handleReminder = () => {
    if (!subject) return;
    const reminder = toggleUpdateReminder({ subject });
    setReminderEnabled(reminder.enabled);
  };

  if (loading) {
    return (
      <div className="subject-detail">
        <div className="subject-detail__loading" aria-label="正在加载作品详情">
          <i /><div><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  if (!subject || error) {
    return (
      <div className="subject-detail subject-detail--centered">
        <div className="subject-detail__error">
          <h1>作品详情未找到</h1>
          <p>{error}</p>
          <button type="button" onClick={() => router.push("/")}><ArrowLeft size={17} />返回搜索首页</button>
        </div>
      </div>
    );
  }

  const title = subject.name_cn || subject.name;
  const cover = subject.images?.large || subject.images?.common || subject.image;
  const isAnime = subject.type === 2;
  const score = Number(subject.rating?.score || subject.score || 0);
  const tags = subject.tags?.map((tag) => tag.name).filter(Boolean) || [];

  return (
    <div className="subject-detail">
      <div className="subject-detail__shell">
        <button className="subject-detail__back" type="button" onClick={handleBack} aria-label="返回上一页">
          <ArrowLeft size={19} />
        </button>

        <article className="subject-detail__sheet">
          <header className="subject-detail__top">
            <div className="subject-detail__poster">
              {cover ? <Image src={cover} alt={`${title} 封面`} fill priority sizes="(max-width: 720px) 150px, 230px" referrerPolicy="no-referrer" /> : <span>AN</span>}
            </div>

            <div className="subject-detail__intro">
              <div className="subject-detail__badges">
                <span>{isAnime ? <Film size={14} /> : <BookOpen size={14} />}{isAnime ? "动画" : "漫画"}</span>
                {subject.platform && <span>{subject.platform}</span>}
              </div>
              <h1>{title}</h1>
              {subject.name !== title && <p className="subject-detail__original-title">{subject.name}</p>}

              <div className="subject-detail__stats">
                <div><span>评分</span><strong>{score > 0 ? score.toFixed(2) : "暂无"}</strong></div>
                <div><span>{isAnime ? "集数" : "卷数"}</span><strong>{(isAnime ? subject.eps : subject.volumes) || "未知"}</strong></div>
                <div><span>年份</span><strong>{subject.date?.slice(0, 4) || "未知"}</strong></div>
              </div>

              <button className={`subject-detail__reminder ${reminderEnabled ? "active" : ""}`} type="button" onClick={handleReminder}>
                {reminderEnabled ? <BellOff size={17} /> : <BellRing size={17} />}
                {reminderEnabled ? "关闭更新提醒" : "开启更新提醒"}
              </button>
            </div>
          </header>

          <div className="subject-detail__columns">
            <div className="subject-detail__content">
              <section>
                <h2>详细信息</h2>
                <dl className="subject-detail__facts">
                  <div><dt>内容类型</dt><dd>{isAnime ? "动画" : "漫画 / 书籍"}</dd></div>
                  <div><dt>首发日期</dt><dd>{subject.date || "暂无信息"}</dd></div>
                  <div><dt>{isAnime ? "总集数" : "总卷数"}</dt><dd>{(isAnime ? subject.eps : subject.volumes) || "暂无信息"}</dd></div>
                  <div><dt>媒体形式</dt><dd>{subject.platform || "暂无信息"}</dd></div>
                  <div><dt>数据来源</dt><dd>{sourceWebsite?.name || subject.source || "暂无信息"}</dd></div>
                </dl>
              </section>

              <section>
                <h2>作品简介</h2>
                <p className="subject-detail__summary">{subject.summary || subject.short_summary || "当前数据源暂未提供作品简介。"}</p>
              </section>

              {tags.length > 0 && (
                <section>
                  <h2>标签</h2>
                  <div className="subject-detail__tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </section>
              )}
            </div>

            <aside className="subject-detail__actions" aria-label="观看与外部链接">
              {isAnime && (
                <section>
                  <div className="subject-detail__aside-heading"><PlayCircle size={18} /><div><h2>正版观看渠道</h2><p>前往平台搜索本作，版权情况以所在地区为准。</p></div></div>
                  <div className="subject-detail__platforms">
                    {videoPlatforms.map((platform) => <a key={platform.name} href={platform.buildUrl(title)} target="_blank" rel="noreferrer">搜索{platform.name}<ExternalLink size={14} /></a>)}
                  </div>
                </section>
              )}

              <section>
                <div className="subject-detail__aside-heading"><Globe2 size={18} /><div><h2>来源网站</h2><p>这是可选的外部链接，不会自动跳转。</p></div></div>
                {sourceWebsite ? (
                  <a className="subject-detail__source-link" href={sourceWebsite.url} target="_blank" rel="noreferrer">
                    <span><strong>访问 {sourceWebsite.name}</strong><small>{sourceWebsite.url}</small></span><ExternalLink size={16} />
                  </a>
                ) : <p className="subject-detail__unavailable">当前条目没有来源网站地址。</p>}
              </section>
            </aside>
          </div>
        </article>
      </div>
    </div>
  );
}
