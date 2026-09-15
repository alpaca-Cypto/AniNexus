import Image from "next/image";
import Link from "next/link";
import styles from "./brand-preview.module.css";

const concepts = [
  {
    id: "01",
    name: "典藏衬线",
    description: "偏漫画杂志与资料库气质，稳重、有作品感。",
    className: styles.editorial,
  },
  {
    id: "02",
    name: "现代几何",
    description: "清晰克制，适合长期作为产品主字标。",
    className: styles.modern,
  },
  {
    id: "03",
    name: "亲和圆润",
    description: "略带轻松感，与羊驼角色的可爱气质更接近。",
    className: styles.friendly,
  },
  {
    id: "04",
    name: "未来压缩",
    description: "更像番剧数据库与数字档案，识别度直接。",
    className: styles.technical,
  },
  {
    id: "05",
    name: "双重人格",
    description: "Ani 保持温度，Nexus 用更有力量的字重收尾。",
    className: styles.hybrid,
    split: true,
  },
];

export default function BrandPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <div>
          <p>ANINEXUS / BRAND TYPE STUDY</p>
          <h1>字标方向预览</h1>
          <span>所有方案都使用你刚选定的羊驼 AN 图标，并按真实页头尺寸展示。</span>
        </div>
        <Link href="/">返回首页</Link>
      </header>

      <section className={styles.comparison} aria-label="AniNexus 字标方案">
        {concepts.map((concept) => (
          <article className={styles.row} key={concept.id}>
            <div className={styles.meta}>
              <span>{concept.id}</span>
              <div>
                <h2>{concept.name}</h2>
                <p>{concept.description}</p>
              </div>
            </div>

            <div className={styles.headerSample}>
              <div className={styles.lockup}>
                <Image src="/branding/aninexus-an-alpaca-1cf0fe78.png" alt="" width={44} height={44} priority={concept.id === "01"} />
                <strong className={concept.className}>
                  {concept.split ? (
                    <>
                      <span>Ani</span><b>Nexus</b>
                    </>
                  ) : (
                    "AniNexus"
                  )}
                </strong>
              </div>
              <nav aria-label={`${concept.name}示意导航`}>
                <span>搜索</span>
                <span>收藏</span>
                <span>追番日历</span>
              </nav>
            </div>
          </article>
        ))}
      </section>

      <footer className={styles.note}>选择编号即可继续应用到全站；字号与间距还会针对手机端单独校正。</footer>
    </main>
  );
}
