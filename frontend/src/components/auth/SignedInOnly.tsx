"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useOwnerStatus } from "./useOwnerStatus";

export function SignedInOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useOwnerStatus();
  if (loading) return <p role="status" style={{ margin: "auto", padding: 24, textAlign: "center" }}>正在检查登录状态…</p>;
  if (!user) {
    return (
      <main style={{ margin: "auto", maxWidth: 520, padding: 24, textAlign: "center" }}>
        <h1>登录后使用个人功能</h1>
        <p>请先使用右上角的“登录 / 注册”，再查看自己的空间和追番计划。</p>
        <Link href="/">返回发现页</Link>
      </main>
    );
  }
  return children;
}
