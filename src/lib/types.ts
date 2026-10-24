export type Artist = {
  slug: string;
  name: string;
  bio: string;
  image?: string;
  links?: { label: string; url: string }[];
};

export type Track = {
  title: string;
  duration?: string;
};

export type Release = {
  slug: string;
  title: string;
  artistSlug: string;
  catalogNumber: string;
  releaseDate: string; // ISO date
  format: "single" | "ep" | "album" | "compilation";
  cover?: string;
  tracks: Track[];
  buyUrl?: string;
};

export type NewsPost = {
  slug: string;
  title: string;
  date: string; // ISO date
  body: string;
};
