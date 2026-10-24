import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArtist, getRelease, releases } from "@/lib/data";

export function generateStaticParams() {
  return releases.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/releases/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getRelease(slug)?.title };
}

export default async function ReleasePage({ params }: PageProps<"/releases/[slug]">) {
  const { slug } = await params;
  const release = getRelease(slug);
  if (!release) notFound();

  const artist = getArtist(release.artistSlug);

  return (
    <article>
      <h1>{release.title}</h1>
      {artist && (
        <p>
          <Link href={`/artists/${artist.slug}`}>{artist.name}</Link>
        </p>
      )}
      <dl>
        <dt>Catalog no.</dt>
        <dd>{release.catalogNumber}</dd>
        <dt>Format</dt>
        <dd>{release.format}</dd>
        <dt>Released</dt>
        <dd>
          <time dateTime={release.releaseDate}>{release.releaseDate}</time>
        </dd>
      </dl>

      <h2>Tracklist</h2>
      <ol>
        {release.tracks.map((t) => (
          <li key={t.title}>
            {t.title}
            {t.duration && ` (${t.duration})`}
          </li>
        ))}
      </ol>

      {release.buyUrl && <a href={release.buyUrl}>Buy</a>}
    </article>
  );
}
