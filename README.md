# Dagsun Sounds

Record label website. Next.js (App Router) + TypeScript.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Structure

```
src/
  app/
    page.tsx               Home (latest releases + news)
    releases/              Catalogue list + /releases/[slug]
    artists/               Roster list + /artists/[slug]
    news/                  News list + /news/[slug]
    about/  contact/
    layout.tsx             Shell: header, main, footer, metadata
    not-found.tsx
  components/              SiteHeader, SiteFooter
  lib/
    site.ts                Label name, nav, contact email
    types.ts               Artist, Release, Track, NewsPost
    data.ts                Placeholder content + lookup helpers
```

Content is hard-coded in `src/lib/data.ts` for now; replace with a CMS or database later.
No styling yet beyond a minimal reset in `src/app/globals.css`.
