"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarDays, Library, Search, Sparkles } from "lucide-react";
import { ThemeModeSwitcher } from "@/features/Theme/ThemeModeSwitcher";
import { AuthControl } from "@/components/auth/AuthControl";
import { useOwnerStatus } from "@/components/auth/useOwnerStatus";

const navigation = [
  { href: "/", label: "发现", icon: Search },
  { href: "/collections", label: "收藏库", icon: Library },
  { href: "/timetable", label: "追番计划", icon: CalendarDays },
  { href: "/updates", label: "更新", icon: Sparkles },
  { href: "/assistant", label: "AI 助手", icon: Bot },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { isOwner } = useOwnerStatus();

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
        {navigation.filter(({ href }) => isOwner || href !== "/assistant").map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/" && pathname.startsWith("/subjects/"));
          return (
          <Link className={active ? "active" : ""} href={href} key={href} title={label} aria-label={label} aria-current={active ? "page" : undefined}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </Link>
          );
        })}
      </nav>

      <div className="site-header__tools">
        <ThemeModeSwitcher />
        <AuthControl />
      </div>
    </header>
  );
}
