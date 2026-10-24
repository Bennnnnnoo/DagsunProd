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
    page.tsx               Home: the logo hero
    layout.tsx             Root layout, metadata, theme init script
    globals.css            Reset + light/dark palettes (light by default)
  components/
    Hero.tsx               Wordmark, layered artwork, decks and cables over the particle field
    ParticleField.tsx      three.js dithered particle field (fake kick, pointer stir, live controls)
    particleFieldShaders.ts
    Faders.tsx             Draggable faders on the decks' mixer -> particle field controls
    PixelCables.tsx        Pixel-art cables from the decks into the speaker, routed on a grid
    DeckPlayer.tsx         Full-size decks as a player: spinning covers, CUE/PLAY buttons
  assets/
    wordmark.png           Cropped from LOGO_WITH_TEXT.png
    art/                   Artwork split into cabinet, speaker cones and character (+ dark variants)
    decks.png              DJ decks with the fader caps painted out
    fader-cap.png, crossfader-cap.png
  lib/
    site.ts                Label name
    theme.ts               Theme hook (dark only via <html data-theme="dark">)
    themeScript.ts         Applies a saved theme before first paint
scripts/
  split-art.py             "SVG IMAGE.svg" -> src/assets/art (layers, cones, drivers.ts)
  prepare-decks.py         "NEW dj decks.jpeg" -> decks.png + fader cap sprites
  load-local-tracks.py     Test audio -> public/local-tracks/ (git-ignored)
```

## Test tracks on the decks

Scrolling down the home page grows the decks; at full size they play the
tracks listed in `public/local-tracks/tracks.json`. That folder is
git-ignored test audio for localhost only. To load some:

```bash
python3 scripts/load-local-tracks.py "path/Artist - Title.mp3" "path/other.mp3::Artist::Title"
```

Real label releases should replace this before anything is deployed.

Both scripts need ImageMagick (`magick`); `split-art.py` also needs `rsvg-convert`.
