import type { Metadata } from "next";
import Link from "next/link";
import { artists } from "@/lib/data";

export const metadata: Metadata = { title: "Artists" };

export default function ArtistsPage() {
  return (
    <section>
      <h1>Artists</h1>
      <ul>
        {artists.map((a) => (
          <li key={a.slug}>
            <Link href={`/artists/${a.slug}`}>{a.name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
