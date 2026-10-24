import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { artists, getArtist, getReleasesByArtist } from "@/lib/data";

export function generateStaticParams() {
  return artists.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/artists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getArtist(slug)?.name };
}

export default async function ArtistPage({ params }: PageProps<"/artists/[slug]">) {
  const { slug } = await params;
  const artist = getArtist(slug);
  if (!artist) notFound();

  const artistReleases = getReleasesByArtist(artist.slug);

  return (
    <article>
      <h1>{artist.name}</h1>
      <p>{artist.bio}</p>

      <h2>Releases</h2>
      <ul>
        {artistReleases.map((r) => (
          <li key={r.slug}>
            <Link href={`/releases/${r.slug}`}>
              {r.catalogNumber} — {r.title}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
