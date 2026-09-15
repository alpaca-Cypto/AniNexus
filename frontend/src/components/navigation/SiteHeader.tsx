"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, Library, Search } from "lucide-react";
import { ThemeModeSwitcher } from "@/features/Theme/ThemeModeSwitcher";
import { AuthControl } from "@/components/auth/AuthControl";

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
        <span className="site-header__brand-mark" aria-hidden="true">
          <Image src="/branding/aninexus-an-alpaca-1cf0fe78.png" alt="" width={40} height={40} priority />
        </span>
        <strong className="site-header__wordmark">
          <span>Ani</span>
          <b>Nexus</b>
        </strong>
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
        <AuthControl />
      </div>
    </header>
  );
}
