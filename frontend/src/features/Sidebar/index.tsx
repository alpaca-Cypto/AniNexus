"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChevronDown, House, Library, MessageCircleMore, Settings, UserRound } from "lucide-react";
import { ThemeModeSwitcher } from "@/features/Theme/ThemeModeSwitcher";

const navigation = [
  { href: "/", label: "工作台", icon: House },
  { href: "/collections", label: "收藏库", icon: Library },
  { href: "/Timetable", label: "追番日历", icon: CalendarDays },
  { href: "/assistant", label: "AI 助手", icon: MessageCircleMore },
  { href: "/Personal", label: "个人画像", icon: UserRound },
];

export const DesktopSidebar = () => {
  const pathname = usePathname();
  return (
    <aside className="nexus-sidebar">
      <Link className="nexus-brand" href="/" aria-label="AniNexus 首页">
        <span className="nexus-brand-mark">A</span>
        <span className="nexus-brand-copy"><strong>AniNexus</strong><small>PRISM ARCHIVE</small></span>
      </Link>
      <div className="nexus-library-switcher">
        <span className="nexus-avatar">我</span><span><small>当前空间</small><strong>我的动漫宇宙</strong></span><ChevronDown size={15} />
      </div>
      <p className="nexus-nav-label">主菜单</p>
      <nav aria-label="主导航">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link className={pathname === href ? "active" : ""} href={href} key={href} title={label}><Icon size={18} /><span>{label}</span></Link>
        ))}
      </nav>
      <div className="nexus-sidebar-footer">
        <ThemeModeSwitcher />
        <Link href="/settings" title="设置"><Settings size={18} /><span>设置</span></Link>
        <div className="nexus-profile"><span>AN</span><div><strong>AniNexus User</strong><small>本地模式</small></div></div>
      </div>
    </aside>
  );
};
