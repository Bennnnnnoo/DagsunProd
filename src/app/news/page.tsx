import type { Metadata } from "next";
import Link from "next/link";
import { news } from "@/lib/data";

export const metadata: Metadata = { title: "News" };

export default function NewsPage() {
  const sorted = [...news].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section>
      <h1>News</h1>
      <ul>
        {sorted.map((n) => (
          <li key={n.slug}>
            <time dateTime={n.date}>{n.date}</time>{" "}
            <Link href={`/news/${n.slug}`}>{n.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
