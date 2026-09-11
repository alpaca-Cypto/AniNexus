"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, Library, Search, UserRound } from "lucide-react";
import { ThemeModeSwitcher } from "@/features/Theme/ThemeModeSwitcher";

const navigation = [
  { href: "/", label: "搜索", icon: Search },
  { href: "/collections", label: "收藏", icon: Library },
  { href: "/Timetable", label: "追番日历", icon: CalendarDays },
  { href: "/assistant", label: "AI 助手", icon: Bot },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/" aria-label="AniNexus 首页">
        <span aria-hidden="true">AN</span>
        <strong>AniNexus</strong>
      </Link>

      <nav className="site-header__nav" aria-label="主导航">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link className={pathname === href ? "active" : ""} href={href} key={href} aria-current={pathname === href ? "page" : undefined}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="site-header__tools">
        <ThemeModeSwitcher />
        <Link className={pathname === "/Personal" ? "site-header__profile active" : "site-header__profile"} href="/Personal" aria-label="我的空间" aria-current={pathname === "/Personal" ? "page" : undefined}>
          <UserRound size={17} aria-hidden="true" />
          <span>我的空间</span>
        </Link>
      </div>
    </header>
  );
}
