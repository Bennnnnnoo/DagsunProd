import type { Metadata } from "next";
import Link from "next/link";
import { getArtist, releases } from "@/lib/data";

export const metadata: Metadata = { title: "Releases" };

export default function ReleasesPage() {
  const sorted = [...releases].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  return (
    <section>
      <h1>Releases</h1>
      <ul>
        {sorted.map((r) => (
          <li key={r.slug}>
            <Link href={`/releases/${r.slug}`}>
              {r.catalogNumber} — {getArtist(r.artistSlug)?.name} — {r.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
