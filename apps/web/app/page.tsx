import { HealthStatus } from "@/components/health-status";

const foundations = [
  "FastAPI 服务与版本化健康接口",
  "Next.js App Router 与 TypeScript",
  "MySQL、Redis、Qdrant 开发环境",
  "代码质量、测试与持续集成门禁",
];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">PROJECT FOUNDATION · V0.1</p>
        <h1 id="page-title">AniNexus</h1>
        <p className="subtitle">次元枢纽</p>
        <p className="description">
          面向动漫与漫画爱好者的一站式内容发现、收藏管理和 AI 助手平台。
        </p>
        <HealthStatus />
      </section>

      <section className="foundation" aria-labelledby="foundation-title">
        <div>
          <p className="section-index">01</p>
          <h2 id="foundation-title">当前基线</h2>
        </div>
        <ul>
          {foundations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
