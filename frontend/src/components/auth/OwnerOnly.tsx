"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useOwnerStatus } from "./useOwnerStatus";

export function OwnerOnly({ children }: { children: ReactNode }) {
  const { isOwner, loading } = useOwnerStatus();
  if (loading) return <p role="status" style={{ margin: "auto", padding: 24, textAlign: "center" }}>正在检查访问权限…</p>;
  if (!isOwner) {
    return (
      <main style={{ margin: "auto", maxWidth: 520, padding: 24, textAlign: "center" }}>
        <h1>页面暂未开放</h1>
        <p>这个功能目前仅供站点所有者测试。</p>
        <Link href="/">返回发现页</Link>
      </main>
    );
  }
  return children;
}
