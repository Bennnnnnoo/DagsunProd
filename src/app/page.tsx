import Link from "next/link";
import ParticleField from "@/components/ParticleField";
import { news, releases } from "@/lib/data";
import { site } from "@/lib/site";
import styles from "./page.module.css";

export default function Home() {
  const latestReleases = [...releases]
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .slice(0, 3);
  const latestNews = [...news].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <>
      <section className={styles.hero}>
        <ParticleField />
        <div className={styles.heroContent}>
          <h1>{site.name}</h1>
          <p>{site.description}</p>
        </div>
      </section>

      <section>
        <h2>Latest releases</h2>
        <ul>
          {latestReleases.map((r) => (
            <li key={r.slug}>
              <Link href={`/releases/${r.slug}`}>
                {r.catalogNumber} — {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>News</h2>
        <ul>
          {latestNews.map((n) => (
            <li key={n.slug}>
              <Link href={`/news/${n.slug}`}>{n.title}</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
