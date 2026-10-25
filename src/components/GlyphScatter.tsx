"use client";

import { type RefObject, useEffect, useRef } from "react";
import { type SpriteName, sprites } from "@/assets/sprites";
import { GLYPH_BOX, PHYREXIAN_GLYPHS } from "@/lib/phyrexian";
import styles from "./GlyphScatter.module.css";

type Props = {
  /** The decks: the blue band runs across the bottom of the screen behind them,
   *  and the figures and glyphs line up to their right. */
  decks: RefObject<HTMLElement | null>;
  /**
   * Receives the glyph mask each time it changes, covering this layer's box
   * at 1 px per cell: red = the signs, green = a wider halo around them. The
   * particle field draws the signs and thins itself out in the halo.
   */
  onMask: (mask: HTMLCanvasElement) => void;
  /** A sprite appeared or vanished, centred at this client-px point. */
  onSpriteChange?: (x: number, y: number) => void;
  /** Fires "beat" (detail = beat number) on each kick of the fake audio; items swap in time. */
  beats?: EventTarget;
};

// Phyrexian-style glyphs (lib/phyrexian), as Path2D, by index.
const LETTERS = PHYREXIAN_GLYPHS.map((_, i) => i);
const COUNTS = { letter: 3, sprite: 4 };
// Only the stick-figure sprites from sprite_sheet.jpg (scripts/cut-sprites.py), at their natural size.
const SPRITES: SpriteName[] = ["figure", "figureMedium", "figureSmall"];
const BIGGEST_FIGURE: SpriteName = "figure";
const PIXEL = 2; // CSS px per layout cell (and per mask pixel)
// Large, because each sign is drawn by however many particles fall inside it;
// nearly uniform, so they read as one script.
const SIZE = { min: 64, max: 70 }; // glyph size, in cells
const DENSITY = { min: 0.85, max: 1 }; // how strongly a sign's particles are inked
const STROKE = 14; // glyph line width, in GLYPH_BOX units: thick enough to catch particles
const GLYPH_SCALE = 1.1 / GLYPH_BOX.height; // glyph height is 1.1x the size
const INSIDE = 0.5; // a sign's filled-in interior, relative to its outline
const SOFTEN = 1; // blur (in cells), so edges fade out across a few particles
const HALO = 7; // blur (in cells) of the clearing the field leaves around each sign
// Figures dance to the beat, choppily, like a low-frame-rate sprite: each has
// one of MOVES moves (bounce, sway, shuffle) and snaps POSES_PER_BEAT times per
// beat through a four-pose cycle, no easing in between.
const MOVES = 3;
const POSES_PER_BEAT = 2;
const DANCE = {
  hop: [0, -6, 0, -6], // px: down on the beat, up on the off-beat
  sway: [-0.16, 0, 0.16, 0], // radians: lean left, upright, lean right, upright
  step: [-4, 0, 4, 0], // px: step left, centre, right, centre
  squash: 0.1, // on the beat only
};
// One bright blue band across the bottom of the screen, from just above the
// decks down. In it, left to right: figures, decks (centred), glyphs. Sizes in cells.
const PANEL_COLOUR = "#0047ff";
// Around the decks: a squared-off frame of dense particles following their
// outline (white on the band). Sizes in cells.
const OPENING = { pad: 7, strength: 0.85 };
// On top of that, painted: solid white round the decks' body, breaking up into
// particle-sized flecks over FADE.width cells as it fades out into the blue.
const FADE = { width: 16, fleck: 2 }; // cells; fleck = px per fleck
// The decks' body (plinth) within decks.png, as fractions, so the frame follows
// the decks themselves rather than the cables above and the tangle below.
const DECKS_BODY = { l: 20 / 1024, t: 205 / 1040, r: 1005 / 1024, b: 846 / 1040 };
const BAND = {
  pad: 8, // band above the decks' top edge
  gap: 12, // between the decks, the figures and the glyphs
  figure: 28, // spacing between figure spots (there's one spare, so they can hop)
  glyph: 56, // spacing between glyphs
};
// On each kick one glyph changes in place or one figure hops to the spare spot;
// on the first beat of each bar all the glyphs are rewritten.

// Positions in cells. Letters: y is the baseline. Sprites: y is the top.
type Item =
  | { kind: "letter"; letter: number; x: number; y: number; size: number; density: number; row: number }
  | { kind: "sprite"; name: SpriteName; x: number; y: number; move: number };

type Rect = { l: number; t: number; r: number; b: number };
type Slot = { cx: number; baseline: number; row: number };

const bounds = (it: Item): Rect =>
  it.kind === "letter"
    ? { l: it.x - it.size * 0.08, t: it.y - it.size * 1.05, r: it.x + it.size * 0.78, b: it.y + it.size * 0.15 }
    : { l: it.x, t: it.y, r: it.x + sprites[it.name].width / PIXEL, b: it.y + sprites[it.name].height / PIXEL };

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Home-screen decoration in a blue band along the bottom, changing on the beat:
 * Phyrexian-style glyphs, drawn by the particle field itself (this only makes
 * their mask), and HUD sprites, drawn here as they are.
 */
export default function GlyphScatter({ decks, onMask, onSpriteChange, beats }: Props) {
  const spriteCanvasRef = useRef<HTMLCanvasElement>(null);
  const panelCanvasRef = useRef<HTMLCanvasElement>(null);
  const invertCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const spriteCanvas = spriteCanvasRef.current;
    const panelCanvas = panelCanvasRef.current;
    const invertCanvas = invertCanvasRef.current;
    const glowCanvas = glowCanvasRef.current;
    const host = spriteCanvas?.parentElement;
    if (!spriteCanvas || !panelCanvas || !invertCanvas || !glowCanvas || !host) return;
    const mask = document.createElement("canvas");
    const halo = document.createElement("canvas");
    const paths = PHYREXIAN_GLYPHS.map((d) => new Path2D(d));
    let glyphs: Item[] = [];
    let cancelled = false;
    const images = new Map(
      SPRITES.map((name) => {
        const img = new Image();
        img.src = sprites[name].src;
        return [name, img];
      }),
    );

    // Glyphs centre in their slot; figures stand on its baseline.
    const make = (kind: Item["kind"], slot: Slot): Item => {
      const { cx, baseline } = slot;
      if (kind === "sprite") {
        const name = pick(SPRITES);
        const { width, height } = sprites[name];
        return {
          kind,
          name,
          x: Math.round(cx - width / PIXEL / 2),
          y: Math.round(baseline - height / PIXEL),
          move: Math.floor(Math.random() * MOVES),
        };
      }
      const size = SIZE.min + Math.floor(Math.random() * (SIZE.max - SIZE.min + 1));
      const density = DENSITY.min + Math.random() * (DENSITY.max - DENSITY.min);
      return { kind, letter: pick(LETTERS), size, density, x: cx - size * 0.35, y: baseline, row: slot.row };
    };

    // The band and the spots in it, from where the decks are. Wide screens:
    // figures on the decks' left, glyphs on their right. Narrow ones (no room beside the
    // decks): the band grows upward and the figures stand on the decks' top edge.
    const band = (w: number, h: number) => {
      const box = host.getBoundingClientRect();
      const r = decks.current?.getBoundingClientRect();
      if (!r || r.width === 0) return { rect: null, opening: null, figures: [] as Slot[], letters: [] as Slot[] };
      const d = {
        l: (r.left - box.left) / PIXEL,
        t: (r.top - box.top) / PIXEL,
        r: (r.right - box.left) / PIXEL,
        b: (r.bottom - box.top) / PIXEL,
      };
      const dw = d.r - d.l;
      const dh = d.b - d.t;
      const opening = {
        l: d.l + dw * DECKS_BODY.l - OPENING.pad,
        t: d.t + dh * DECKS_BODY.t - OPENING.pad,
        r: d.l + dw * DECKS_BODY.r + OPENING.pad,
        b: d.t + dh * DECKS_BODY.b + OPENING.pad,
      };
      const spots = COUNTS.sprite + 1;
      const figuresWidth = spots * BAND.figure;
      const glyphHeight = SIZE.max * 1.1;
      // Figures on the decks' left, glyphs on their right.
      const figureStart = d.l - BAND.gap - figuresWidth;
      if (figureStart >= BAND.gap) {
        const top = d.t - BAND.pad;
        const figures = Array.from({ length: spots }, (_, i) => ({
          cx: figureStart + (i + 0.5) * BAND.figure,
          baseline: d.b - 2,
          row: 0,
        }));
        const glyphStart = d.r + BAND.gap * 2;
        // Glyphs centred in the band's height (a glyph spans y - size .. y + 0.1 size).
        const glyphBaseline = (top + h) / 2 + SIZE.max * 0.45;
        const letters = Array.from({ length: COUNTS.letter }, (_, i) => ({
          cx: glyphStart + (i + 0.5) * BAND.glyph,
          baseline: glyphBaseline,
          row: 0,
        })).filter((sl) => sl.cx + BAND.glyph / 2 <= w - BAND.gap && glyphHeight <= h - top);
        return { rect: { l: 0, t: top, r: w, b: h }, opening, figures, letters };
      }
      const figureHeight = sprites[BIGGEST_FIGURE].height / PIXEL;
      const figures = Array.from({ length: spots }, (_, i) => ({
        cx: d.l + (i + 0.5) * BAND.figure,
        baseline: d.t - 2,
        row: 0,
      })).filter((sl) => sl.cx + BAND.figure / 2 <= w);
      return {
        rect: { l: 0, t: d.t - figureHeight - BAND.pad, r: w, b: h },
        opening,
        figures,
        letters: [] as Slot[],
      };
    };

    // Padded a little so figures don't touch.
    const fits = (item: Item, placed: Item[]) => {
      const { l, t, r, b } = bounds(item);
      const box = { l: l - 2, t: t - 2, r: r + 2, b: b + 2 };
      return !placed.map(bounds).some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b);
    };

    // The glyphs, one per glyph spot.
    const lines = (w: number, h: number) => band(w, h).letters.map((sl) => make("letter", sl));

    // The band, behind everything in it. Only redrawn on layout.
    const drawPanels = (w: number, h: number) => {
      const { rect, opening } = band(w, h);
      // The same rectangle twice: white (inverts the field) and blue (tints it).
      for (const [target, colour] of [
        [invertCanvas, "#fff"],
        [panelCanvas, PANEL_COLOUR],
      ] as const) {
        target.width = w * PIXEL;
        target.height = h * PIXEL;
        const ctx = target.getContext("2d");
        if (!ctx || !rect) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(
          Math.round(rect.l * PIXEL),
          Math.round(rect.t * PIXEL),
          Math.round((rect.r - rect.l) * PIXEL),
          Math.round((rect.b - rect.t) * PIXEL),
        );
      }
      drawGlow(w, h, opening);
    };

    // White round the decks: solid at their body (padded), then flecks that
    // thin out with distance from that rectangle, so its corners stay square.
    // A fixed hash decides each fleck, so the pattern doesn't shimmer on redraw.
    const drawGlow = (w: number, h: number, opening: Rect | null) => {
      glowCanvas.width = w * PIXEL;
      glowCanvas.height = h * PIXEL;
      const ctx = glowCanvas.getContext("2d");
      if (!ctx || !opening) return;
      ctx.fillStyle = "#fff";
      const inner = { l: opening.l * PIXEL, t: opening.t * PIXEL, r: opening.r * PIXEL, b: opening.b * PIXEL };
      ctx.fillRect(inner.l, inner.t, inner.r - inner.l, inner.b - inner.t);
      const fade = FADE.width * PIXEL;
      const f = FADE.fleck;
      const hash = (x: number, y: number) => {
        const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return n - Math.floor(n);
      };
      for (let y = Math.floor((inner.t - fade) / f) * f; y < inner.b + fade; y += f) {
        for (let x = Math.floor((inner.l - fade) / f) * f; x < inner.r + fade; x += f) {
          const dx = Math.max(inner.l - x, 0, x - inner.r);
          const dy = Math.max(inner.t - y, 0, y - inner.b);
          const dist = Math.max(dx, dy) / fade; // square fall-off
          if (dist <= 0 || dist >= 1) continue;
          if (hash(x, y) < (1 - dist) ** 2) ctx.fillRect(x, y, f, f);
        }
      }
    };

    // Free figure spots, clear of each other; adds up to `count` figures to `keep`.
    const scatter = (w: number, h: number, keep: Item[], count: number) => {
      const open = band(w, h).figures;
      const placed: Item[] = [...keep];
      const target = keep.length + count;
      for (let tries = 0; open.length && placed.length < target && tries < count * 40; tries++) {
        const item = make("sprite", pick(open));
        if (fits(item, placed)) placed.push(item);
      }
      return placed;
    };

    // Sprites: drawn as they are. Glyphs: painted soft and thickened into
    // the mask, at their own strength, for the particle field to pick up.
    const draw = () => {
      const box = host.getBoundingClientRect();
      const w = Math.ceil(box.width / PIXEL);
      const h = Math.ceil(box.height / PIXEL);
      if (mask.width !== w || mask.height !== h || glyphs.length === 0) {
        mask.width = w;
        mask.height = h;
        spriteCanvas.width = w * PIXEL;
        spriteCanvas.height = h * PIXEL;
        glyphs = scatter(w, h, lines(w, h), COUNTS.sprite);
        drawPanels(w, h);
      }
      drawFigures(performance.now());
      const mctx = mask.getContext("2d", { willReadFrequently: true });
      if (!mctx) return;
      mctx.filter = "none";
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, w, h);
      mctx.lineJoin = "round";
      mctx.lineCap = "round";
      for (const glyph of glyphs) {
        if (glyph.kind !== "letter") continue;
        const v = Math.round(glyph.density * 255);
        mctx.fillStyle = mctx.strokeStyle = `rgb(${v},${v},${v})`;
        // y is the baseline: the glyph box sits from y - size to y + 0.1 size.
        const k = glyph.size * GLYPH_SCALE;
        mctx.save();
        mctx.translate(glyph.x, glyph.y - glyph.size);
        mctx.scale(k, k);
        mctx.lineWidth = STROKE;
        mctx.stroke(paths[glyph.letter]);
        mctx.restore();
      }

      // The glyphs are line drawings, which catch few particles.
      // Fill each one in: flood the outside from the edges, and whatever isn't
      // outside or outline is interior, inked at INSIDE of the nearest outline.
      const img = mctx.getImageData(0, 0, w, h);
      const px = img.data;
      const outside = new Uint8Array(w * h);
      const stack: number[] = [];
      const visit = (i: number) => {
        if (!outside[i] && px[i * 4] === 0) {
          outside[i] = 1;
          stack.push(i);
        }
      };
      for (let x = 0; x < w; x++) {
        visit(x);
        visit((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        visit(y * w);
        visit(y * w + w - 1);
      }
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < w * (h - 1)) visit(i + w);
      }
      // Each row's interior takes its value from the last outline pixel to its left.
      for (let y = 0; y < h; y++) {
        let last = 0;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (px[i * 4] > 0) last = px[i * 4];
          else if (!outside[i]) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(last * INSIDE);
        }
      }
      mctx.putImageData(img, 0, 0);
      // Soften the edges a little (filter applies when drawing the canvas onto itself).
      mctx.filter = `blur(${SOFTEN}px)`;
      mctx.drawImage(mask, 0, 0);
      // Around the decks: their outline, padded, filled with dense particles
      // (the decks cover the middle, so it reads as a frame).
      const { opening } = band(w, h);
      if (opening) {
        const v = Math.round(OPENING.strength * 255);
        mctx.fillStyle = `rgb(${v},${v},${v})`;
        mctx.fillRect(opening.l, opening.t, opening.r - opening.l, opening.b - opening.t);
      }
      // Halo: a much blurrier copy, boosted so it reaches past the edges, into green.
      halo.width = w;
      halo.height = h;
      const hctx = halo.getContext("2d", { willReadFrequently: true });
      mctx.filter = "none";
      if (hctx) {
        hctx.filter = `blur(${HALO}px) brightness(3)`;
        hctx.drawImage(mask, 0, 0);
        const sign = mctx.getImageData(0, 0, w, h);
        const wide = hctx.getImageData(0, 0, w, h).data;
        for (let i = 0; i < sign.data.length; i += 4) {
          sign.data[i + 1] = wide[i];
          sign.data[i + 2] = 0;
        }
        mctx.putImageData(sign, 0, 0);
      }
      onMask(mask);
    };

    // The sprite images have to be loaded first; draw either way.
    void Promise.all([...images.values()].map((img) => img.decode()))
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        glyphs = [];
        draw();
      });

    const observer = new ResizeObserver(() => {
      glyphs = [];
      draw();
    });
    observer.observe(host);

    // Swap one item for a new one of the same kind, somewhere else.
    // A figure hops to a new slot, disrupting the field where it vanishes and appears.
    const hop = () => {
      const figures = glyphs.filter((g) => g.kind === "sprite");
      if (!figures.length) return;
      const gone = pick(figures);
      const before = glyphs;
      glyphs = scatter(
        mask.width,
        mask.height,
        glyphs.filter((g) => g !== gone),
        1,
      );
      if (!onSpriteChange) return;
      const box = host.getBoundingClientRect();
      const centre = (it: Item) => {
        const b = bounds(it);
        onSpriteChange(box.left + ((b.l + b.r) / 2) * PIXEL, box.top + ((b.t + b.b) / 2) * PIXEL);
      };
      centre(gone);
      const added = glyphs.find((g) => g.kind === "sprite" && !before.includes(g));
      if (added) centre(added);
    };
    // Glyphs stay put and change what they say.
    const retype = (which: Item[]) => {
      for (const g of which) if (g.kind === "letter") g.letter = pick(LETTERS);
    };
    // Beat clock for the dance, from the beat events: when the last kick landed,
    // which beat it was, and the measured time between kicks.
    let beatNo = 0;
    let beatAt = performance.now();
    let beatLength = 455;
    const drawFigures = (now: number) => {
      const ctx = spriteCanvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
      ctx.imageSmoothingEnabled = false;
      const still = reducedMotion;
      const t = Math.min((now - beatAt) / beatLength, 0.999); // 0 on the kick .. 1 at the next
      const frame = Math.floor(t * POSES_PER_BEAT);
      const pose = (beatNo * POSES_PER_BEAT + frame) % 4;
      for (const it of glyphs) {
        if (it.kind !== "sprite") continue;
        const img = images.get(it.name);
        if (!img?.complete) continue;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        ctx.save();
        // Pivot at the feet.
        ctx.translate(Math.round(it.x * PIXEL + w / 2), Math.round(it.y * PIXEL + h));
        if (!still) {
          if (it.move === 0) ctx.translate(0, DANCE.hop[pose]);
          if (it.move === 1) ctx.rotate(DANCE.sway[pose]);
          if (it.move === 2) {
            ctx.translate(DANCE.step[pose], 0);
            if (pose >= 2) ctx.scale(-1, 1); // turn round for the second half
          }
          if (frame === 0) ctx.scale(1 + DANCE.squash, 1 - DANCE.squash);
        }
        ctx.drawImage(img, -w / 2, -h);
        ctx.restore();
      }
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const dance = (now: number) => {
      drawFigures(now);
      raf = requestAnimationFrame(dance);
    };
    if (!reducedMotion) raf = requestAnimationFrame(dance);

    const onKick = (e: Event) => {
      const now = performance.now();
      const gap = now - beatAt;
      if (gap > 250 && gap < 900) beatLength = gap;
      beatAt = now;
      beatNo = (e as CustomEvent<number>).detail;
      if (glyphs.length === 0) return;
      const beat = (e as CustomEvent<number>).detail;
      const letters = glyphs.filter((g) => g.kind === "letter");
      if (beat % 4 === 0 && letters.length) {
        // New bar: rewrite one whole line.
        const row = pick(letters).row;
        retype(letters.filter((g) => g.row === row));
      } else if (beat % 2 === 0) {
        hop();
      } else if (letters.length) {
        retype([pick(letters)]);
      }
      draw();
    };
    beats?.addEventListener("beat", onKick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      beats?.removeEventListener("beat", onKick);
    };
  }, [decks, onMask, onSpriteChange, beats]);

  return (
    <>
      <canvas ref={invertCanvasRef} className={`${styles.glyphs} ${styles.panelInvert}`} aria-hidden="true" />
      <canvas ref={panelCanvasRef} className={`${styles.glyphs} ${styles.panels}`} aria-hidden="true" />
      <canvas ref={glowCanvasRef} className={styles.glyphs} aria-hidden="true" />
      <canvas ref={spriteCanvasRef} className={styles.glyphs} aria-hidden="true" />
    </>
  );
}
