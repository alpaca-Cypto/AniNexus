"use client";

import { useEffect, useState } from "react";

type ApiState = "checking" | "online" | "offline";

const labels: Record<ApiState, string> = {
  checking: "正在检查 API",
  online: "API 运行正常",
  offline: "API 尚未启动",
};

export function HealthStatus() {
  const [state, setState] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    async function checkHealth() {
      try {
        const response = await fetch(`${apiUrl}/api/v1/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        setState(response.ok ? "online" : "offline");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setState("offline");
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, []);

  return (
    <div className="status" data-state={state} role="status">
      <span className="status-dot" aria-hidden="true" />
      {labels[state]}
    </div>
  );
}
