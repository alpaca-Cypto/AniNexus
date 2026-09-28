import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  ChevronRight,
  CirclePlay,
  Clock3,
  Compass,
  Heart,
  Library,
  Menu,
  Search,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";

type VariantKey = "a" | "b" | "c" | "d";

const variants = {
  a: {
    season: "春",
    name: "山岚新卷",
    banner: "/banners/spring.png",
    note: "轻盈、留白、松石绿",
    hero: "风从新故事里来",
    description: "在山岚与花信之间，发现本季值得追看的动画、漫画与创作者。",
    feature: "春日放送特辑",
  },
  b: {
    season: "夏",
    name: "莲境放送",
    banner: "/banners/summer.png",
    note: "清透、明快、水光青",
    hero: "盛夏，向更远处出发",
    description: "从清晨的第一集到夜晚的最终话，把喜欢的作品收进自己的夏日片单。",
    feature: "盛夏冒险专题",
  },
  c: {
    season: "秋",
    name: "红叶剧场",
    banner: "/banners/autumn-v3.png",
    note: "热烈、丰盈、朱砂橙",
    hero: "好故事正在成熟",
    description: "新番口碑、长篇回顾与角色专题，都在这一季汇入你的观看地图。",
    feature: "秋季口碑榜",
  },
  d: {
    season: "冬",
    name: "雪庭夜话",
    banner: "/banners/winter-v2.png",
    note: "安静、通透、霜蓝紫",
    hero: "在雪落时重逢",
    description: "把想看的、舍不得完结的和适合重温的作品，安静地整理在一起。",
    feature: "冬日重温计划",
  },
} satisfies Record<VariantKey, {
  season: string;
  name: string;
  banner: string;
  note: string;
  hero: string;
  description: string;
  feature: string;
}>;

const recommendations = [
  { title: "葬送的芙莉莲", meta: "奇幻 · 28 集", score: "9.4", position: "18%" },
  { title: "跃动青春", meta: "校园 · 12 集", score: "8.7", position: "47%" },
  { title: "迷宫饭", meta: "冒险 · 24 集", score: "8.8", position: "73%" },
];

const schedule = [
  { time: "19:00", title: "胆大党", episode: "第 8 话", tone: "coral" },
  { time: "21:30", title: "我独自升级", episode: "第 12 话", tone: "jade" },
  { time: "23:00", title: "药屋少女的呢喃", episode: "第 19 话", tone: "violet" },
];

const tools = [
  { href: "/collections", icon: Library, title: "收藏库", copy: "管理想看、在看与已完成" },
  { href: "/timetable", icon: CalendarDays, title: "追番计划", copy: "按播出时间安排本周观看" },
  { href: "/assistant", icon: Bot, title: "动漫助手", copy: "比较作品并获取具体推荐" },
  { href: "/personal", icon: UserRound, title: "我的空间", copy: "管理收藏与追番计划" },
];

export function generateStaticParams() {
  return Object.keys(variants).map((variant) => ({ variant }));
}

export default async function SeasonalPreview({ params }: { params: Promise<{ variant: string }> }) {
  const { variant: rawVariant } = await params;
  const key = rawVariant.toLowerCase() as VariantKey;
  const theme = variants[key];
  if (!theme) notFound();

  return (
    <div className={`season-preview theme-${key}`}>
      <header className="season-header">
        <Link className="season-brand" href="/preview/a" aria-label="AniNexus 四季预览首页">
          <span className="season-brand-mark">AN</span>
          <span><strong>AniNexus</strong><small>动画与漫画的四季入口</small></span>
        </Link>
        <nav className="season-nav" aria-label="预览主导航">
          <a href="#discover">发现</a>
          <Link href="/collections">收藏库</Link>
          <Link href="/timetable">追番计划</Link>
          <Link href="/assistant">AI 助手</Link>
        </nav>
        <div className="season-header-actions">
          <button className="season-search" aria-label="搜索作品"><Search size={19} /></button>
          <Link className="season-profile" href="/personal"><UserRound size={17} /> 我的空间</Link>
          <button className="season-menu" aria-label="打开菜单"><Menu size={21} /></button>
        </div>
      </header>

      <main>
        <section className="season-hero" style={{ backgroundImage: `url(${theme.banner})` }}>
          <div className="season-hero-shade" />
          <div className="season-hero-content">
            <p className="season-edition"><span>{theme.season}</span> 二〇二六 · 当季精选</p>
            <h1>{theme.hero}</h1>
            <p className="season-hero-copy">{theme.description}</p>
            <div className="season-hero-actions">
              <a className="season-primary" href="#discover"><Compass size={18} /> 浏览本季推荐</a>
              <Link className="season-secondary" href="/collections"><Heart size={18} /> 打开我的片单</Link>
            </div>
          </div>
          <div className="season-stamp" aria-hidden="true"><b>{theme.season}</b><span>{theme.name}</span></div>
          <a className="season-scroll" href="#discover"><span>向下浏览</span><ArrowRight size={15} /></a>
        </section>

        <section className="season-intro" id="discover">
          <div>
            <p className="season-kicker">本周策展</p>
            <h2>{theme.feature}</h2>
          </div>
          <p>从口碑、更新热度与你的收藏偏好中，选出此刻最值得打开的作品。</p>
          <Link href="/collections">查看全部推荐 <ArrowRight size={16} /></Link>
        </section>

        <section className="season-feature-grid" aria-label="本周推荐">
          <article className="season-lead-story">
            <div className="season-story-image" style={{ backgroundImage: `url(${theme.banner})` }}>
              <span>编辑推荐</span>
              <button aria-label="播放预告"><CirclePlay size={34} /></button>
            </div>
            <div className="season-story-copy">
              <p>本周主打 · 奇幻公路片</p>
              <h3>走过漫长旅途，才读懂短暂相遇</h3>
              <span>一部适合慢慢观看的作品，关于记忆、时间与再次出发。</span>
              <Link href="/collections">查看作品详情 <ChevronRight size={16} /></Link>
            </div>
          </article>

          <div className="season-ranking">
            <div className="season-section-heading"><h3>正在升温</h3><span>综合趋势</span></div>
            {recommendations.map((item, index) => (
              <Link href="/collections" className="season-rank-item" key={item.title}>
                <b>0{index + 1}</b>
                <span className="season-rank-thumb" style={{ backgroundImage: `url(${theme.banner})`, backgroundPosition: `${item.position} center` }} />
                <span className="season-rank-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
                <span className="season-score"><Star size={13} fill="currentColor" /> {item.score}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="season-lower-grid">
          <div className="season-schedule">
            <div className="season-section-heading">
              <div><p>今天 · 周三</p><h3>今晚放送</h3></div>
              <Link href="/timetable">完整日历 <ArrowRight size={15} /></Link>
            </div>
            <div className="season-timeline">
              {schedule.map((item) => (
                <article key={item.time}>
                  <time><Clock3 size={14} />{item.time}</time>
                  <i className={item.tone} />
                  <div><strong>{item.title}</strong><span>{item.episode}</span></div>
                  <button aria-label={`标记 ${item.title} 为想看`}><Heart size={16} /></button>
                </article>
              ))}
            </div>
          </div>

          <aside className="season-assistant">
            <Sparkles size={24} />
            <p>不知道下一部看什么？</p>
            <h3>告诉助手你此刻的心情</h3>
            <span>它会结合题材、时长和你的历史偏好，给出三部具体作品。</span>
            <Link href="/assistant">询问动漫助手 <ArrowRight size={16} /></Link>
          </aside>
        </section>

        <section className="season-tools" aria-label="个人工具">
          <div className="season-tools-heading"><p>你的 AniNexus</p><h2>内容之外，也照顾观看本身</h2></div>
          <div className="season-tool-list">
            {tools.map(({ href, icon: Icon, title, copy }) => (
              <Link href={href} key={href}><Icon size={21} /><span><strong>{title}</strong><small>{copy}</small></span><ArrowRight size={16} /></Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="season-footer">
        <Link className="season-brand" href="/preview/a"><span className="season-brand-mark">AN</span><span><strong>AniNexus</strong><small>每一季，都有故事值得相遇</small></span></Link>
        <p>发现、收藏并规划你的动画与漫画世界。</p>
        <span>© 2026 AniNexus</span>
      </footer>

      <aside className="preview-switcher" aria-label="切换设计预览">
        {(Object.entries(variants) as [VariantKey, (typeof variants)[VariantKey]][]).map(([variant, item]) => (
          <Link
            href={`/preview/${variant}`}
            className={variant === key ? "active" : ""}
            key={variant}
            title={`${variant.toUpperCase()} · ${item.name}`}
            aria-current={variant === key ? "page" : undefined}
          >
            <b>{variant.toUpperCase()}</b><span>{item.season}</span>
          </Link>
        ))}
      </aside>
    </div>
  );
}
