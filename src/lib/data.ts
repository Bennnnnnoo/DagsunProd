import type { Artist, NewsPost, Release } from "./types";

// Placeholder content. Swap for a CMS or database later.

export const artists: Artist[] = [
  { slug: "artist-one", name: "Artist One", bio: "Placeholder bio." },
  { slug: "artist-two", name: "Artist Two", bio: "Placeholder bio." },
];

export const releases: Release[] = [
  {
    slug: "first-release",
    title: "First Release",
    artistSlug: "artist-one",
    catalogNumber: "DAG001",
    releaseDate: "2026-01-01",
    format: "ep",
    tracks: [{ title: "Track 1" }, { title: "Track 2" }],
  },
  {
    slug: "second-release",
    title: "Second Release",
    artistSlug: "artist-two",
    catalogNumber: "DAG002",
    releaseDate: "2026-06-01",
    format: "single",
    tracks: [{ title: "Track 1" }],
  },
];

export const news: NewsPost[] = [
  {
    slug: "label-launch",
    title: "Dagsun Sounds launches",
    date: "2026-01-01",
    body: "Placeholder news post.",
  },
];

export function getArtist(slug: string) {
  return artists.find((a) => a.slug === slug);
}

export function getRelease(slug: string) {
  return releases.find((r) => r.slug === slug);
}

export function getReleasesByArtist(artistSlug: string) {
  return releases.filter((r) => r.artistSlug === artistSlug);
}

export function getNewsPost(slug: string) {
  return news.find((n) => n.slug === slug);
}
