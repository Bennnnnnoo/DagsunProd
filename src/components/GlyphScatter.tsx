"use client";

import { type RefObject, useEffect, useRef } from "react";
import { type SpriteName, sprites } from "@/assets/sprites";
import { GLYPH_BOX, PHYREXIAN_GLYPHS } from "@/lib/phyrexian";
import styles from "./GlyphScatter.module.css";

type Props = {
  /** Elements the glyphs keep clear of (logo, decks). */
  avoid: RefObject<HTMLElement | null>[];
  /** Kept clear of too when there's room; glyphs may sit behind it on small screens. */
  avoidIfRoom?: RefObject<HTMLElement | null>[];
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
const COUNTS = { letter: 7, sprite: 4 };
// Only the stick-figure sprites from sprite_sheet.jpg (scripts/cut-sprites.py), at their natural size.
const SPRITES: SpriteName[] = ["figure", "figureMedium", "figureSmall"];
const BIGGEST_FIGURE: SpriteName = "figure";
const PIXEL = 2; // CSS px per layout cell (and per mask pixel)
// Large, because each sign is drawn by however many particles fall inside it;
// nearly uniform, so they read as one script.
const SIZE = { min: 64, max: 70 }; // glyph size, in cells
const DENSITY = { min: 0.85, max: 1 }; // how strongly a sign's particles are inked
// Items sit in an invisible grid of slots (in cells), sharing baselines, so the
// background reads as a composed page of script rather than a scatter.
const SLOT = { w: 56, h: 96, baseline: 0.85 };
// Glyphs only sit on every TEXT_EVERY-th row, as lines of up to LINE_MAX side
// by side; figures use the rows in between.
const TEXT_EVERY = 3;
const LINE_MAX = 5;
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
const CLEARANCE = 16; // px kept clear around the avoided elements
// Bright blue panels behind the glyph lines and the figures' floor, snapped to
// the grid slots they use, padded by PANEL_PAD cells.
const PANEL_COLOUR = "#0047ff";
const PANEL_PAD = 6;
// On each kick one glyph changes in place or one figure hops to a new slot; on
// the first beat of each bar a whole line of glyphs is rewritten.

const NONE: RefObject<HTMLElement | null>[] = [];

// Positions in cells. Letters: y is the baseline. Sprites: y is the top.
type Item =
  | { kind: "letter"; letter: number; x: number; y: number; size: number; density: number; row: number }
  | { kind: "sprite"; name: SpriteName; x: number; y: number; move: number };

type Rect = { l: number; t: number; r: number; b: number };
type Slot = { cx: number; baseline: number; row: number; col: number };

const bounds = (it: Item): Rect =>
  it.kind === "letter"
    ? { l: it.x - it.size * 0.08, t: it.y - it.size * 1.05, r: it.x + it.size * 0.78, b: it.y + it.size * 0.15 }
    : { l: it.x, t: it.y, r: it.x + sprites[it.name].width / PIXEL, b: it.y + sprites[it.name].height / PIXEL };

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Home-screen decoration on an invisible grid, swapped on the beat:
 * Phyrexian-style glyphs, drawn by the particle field itself (this only makes
 * their mask), and HUD sprites, drawn here as they are.
 */
export default function GlyphScatter({ avoid, avoidIfRoom = NONE, onMask, onSpriteChange, beats }: Props) {
  const spriteCanvasRef = useRef<HTMLCanvasElement>(null);
  const panelCanvasRef = useRef<HTMLCanvasElement>(null);
  const invertCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const spriteCanvas = spriteCanvasRef.current;
    const panelCanvas = panelCanvasRef.current;
    const invertCanvas = invertCanvasRef.current;
    const host = spriteCanvas?.parentElement;
    if (!spriteCanvas || !panelCanvas || !invertCanvas || !host) return;
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

    // The grid, centred on the stage, starting under the menu bar.
    const slots = (w: number, h: number, top: number): Slot[] => {
      const cols = Math.floor(w / SLOT.w);
      const rows = Math.floor((h - top) / SLOT.h);
      const left = (w - cols * SLOT.w) / 2;
      const first = top + (h - top - rows * SLOT.h) / 2;
      const out: Slot[] = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          out.push({ cx: left + (c + 0.5) * SLOT.w, baseline: first + (r + SLOT.baseline) * SLOT.h, row: r, col: c });
      return out;
    };

    // The grid, plus what items must keep clear of: always (menu, logo, decks)
    // and, when there's room, the artwork too.
    const layout = (w: number, h: number) => {
      const box = host.getBoundingClientRect();
      const menu = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--menu-height")) || 0;
      const rects = (refs: RefObject<HTMLElement | null>[]) =>
        refs
          .map((ref) => ref.current?.getBoundingClientRect())
          .filter((r): r is DOMRect => !!r && r.width > 0)
          .map((r) => ({
            l: (r.left - box.left - CLEARANCE) / PIXEL,
            t: (r.top - box.top - CLEARANCE) / PIXEL,
            r: (r.right - box.left + CLEARANCE) / PIXEL,
            b: (r.bottom - box.top + CLEARANCE) / PIXEL,
          }));
      const always = [...rects(avoid), { l: 0, t: 0, r: w, b: (menu + CLEARANCE) / PIXEL }];
      return { grid: slots(w, h, (menu + CLEARANCE) / PIXEL), always, strict: [...always, ...rects(avoidIfRoom)] };
    };

    // Padded a little so items don't touch.
    const fits = (item: Item, blocked: Rect[], placed: Item[]) => {
      const { l, t, r, b } = bounds(item);
      const box = { l: l - 2, t: t - 2, r: r + 2, b: b + 2 };
      const hits = (o: Rect) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b;
      return !blocked.some(hits) && !placed.map(bounds).some(hits);
    };

    // Glyphs as lines of script: on each text row, a run of neighbouring slots,
    // centred in the longest free stretch of that row.
    const lines = (w: number, h: number) => {
      const { grid, strict, always } = layout(w, h);
      // Text rows, except the bottom row: that's the figures' floor.
      const bottom = floorRow(grid);
      const rows = [
        ...new Set(grid.filter((sl) => sl.row % TEXT_EVERY === 0 && sl.row !== bottom).map((sl) => sl.row)),
      ];
      const placed: Item[] = [];
      for (const blocked of [strict, always]) {
        for (let i = 0; i < rows.length && placed.length < COUNTS.letter; i++) {
          if (placed.some((it) => it.kind === "letter" && it.row === rows[i])) continue;
          const free = grid.filter((sl) => sl.row === rows[i] && fits(make("letter", sl), blocked, placed));
          // Longest run of consecutive columns.
          let best: Slot[] = [];
          let run: Slot[] = [];
          for (const sl of free) {
            run = run.length && sl.col === run[run.length - 1].col + 1 ? [...run, sl] : [sl];
            if (run.length > best.length) best = run;
          }
          const want = Math.min(LINE_MAX, best.length, Math.ceil((COUNTS.letter - placed.length) / (rows.length - i)));
          const start = Math.floor((best.length - want) / 2);
          for (const sl of best.slice(start, start + want)) placed.push(make("letter", sl));
        }
      }
      return placed;
    };

    // The figures' dance floor: the bottom row of the grid, in its leftmost
    // free slots (with the decks in the corner, that's the floor beside them).
    const floorRow = (grid: Slot[]) => Math.max(...grid.map((sl) => sl.row));
    const floor = (w: number, h: number) => {
      const { grid, strict, always } = layout(w, h);
      const bottom = floorRow(grid);
      // Tested against the biggest figure, so the floor (and its panel) is the
      // same every time rather than depending on which figure was drawn.
      const probe = (sl: Slot): Item => ({
        kind: "sprite",
        name: BIGGEST_FIGURE,
        x: Math.round(sl.cx - sprites[BIGGEST_FIGURE].width / PIXEL / 2),
        y: Math.round(sl.baseline - sprites[BIGGEST_FIGURE].height / PIXEL),
        move: 0,
      });
      // The figures are narrow, so the floor has two spots per grid slot.
      const spots = grid
        .filter((sl) => sl.row === bottom)
        .flatMap((sl) => [-1, 1].map((side) => ({ ...sl, cx: sl.cx + (side * SLOT.w) / 4 })));
      for (const blocked of [strict, always]) {
        const free = spots
          .filter((sl) => fits(probe(sl), blocked, []))
          .sort((a, b) => a.cx - b.cx)
          .slice(0, COUNTS.sprite + 1); // one spare, so they can hop
        if (free.length) return { slots: free, blocked };
      }
      return { slots: [], blocked: always };
    };

    // Panels: one per glyph line (its slots) and one for the figures' floor
    // (all its slots, so it doesn't move when they hop). Only redrawn on layout.
    const slotRect = (cx: number, baseline: number): Rect => ({
      l: cx - SLOT.w / 2,
      r: cx + SLOT.w / 2,
      t: baseline - SLOT.baseline * SLOT.h,
      b: baseline + (1 - SLOT.baseline) * SLOT.h,
    });
    const union = (rects: Rect[]): Rect => ({
      l: Math.min(...rects.map((r) => r.l)) - PANEL_PAD,
      t: Math.min(...rects.map((r) => r.t)) - PANEL_PAD,
      r: Math.max(...rects.map((r) => r.r)) + PANEL_PAD,
      b: Math.max(...rects.map((r) => r.b)) + PANEL_PAD,
    });
    const drawPanels = (w: number, h: number) => {
      const panels: Rect[] = [];
      const letters = glyphs.filter((g) => g.kind === "letter");
      for (const row of new Set(letters.map((g) => g.row))) {
        // A glyph's slot centre is x + 0.35 size (see make).
        panels.push(union(letters.filter((g) => g.row === row).map((g) => slotRect(g.x + g.size * 0.35, g.y))));
      }
      const floorSlots = floor(w, h).slots;
      if (floorSlots.length) {
        // Only as tall as the biggest figure (plus the padding), standing on the baseline.
        const spot = (sl: Slot) => ({ ...slotRect(sl.cx, sl.baseline), l: sl.cx - SLOT.w / 4, r: sl.cx + SLOT.w / 4 });
        const span = union(floorSlots.map(spot));
        const baseline = floorSlots[0].baseline;
        panels.push({
          ...span,
          t: baseline - sprites[BIGGEST_FIGURE].height / PIXEL - PANEL_PAD * 2,
          b: baseline + PANEL_PAD,
        });
      }
      // The same rectangles twice: white (inverts the field) and blue (tints it).
      for (const [target, colour] of [
        [invertCanvas, "#fff"],
        [panelCanvas, PANEL_COLOUR],
      ] as const) {
        target.width = w * PIXEL;
        target.height = h * PIXEL;
        const ctx = target.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = colour;
        for (const p of panels)
          ctx.fillRect(
            Math.round(p.l * PIXEL),
            Math.round(p.t * PIXEL),
            Math.round((p.r - p.l) * PIXEL),
            Math.round((p.b - p.t) * PIXEL),
          );
      }
    };

    // Free slots on the dance floor, clear of everything and each other; adds
    // up to `count` figures to `keep`.
    const scatter = (w: number, h: number, keep: Item[], count: number) => {
      const { slots: open, blocked } = floor(w, h);
      const placed: Item[] = [...keep];
      const target = keep.length + count;
      for (let tries = 0; open.length && placed.length < target && tries < count * 40; tries++) {
        const item = make("sprite", pick(open));
        if (fits(item, blocked, placed)) placed.push(item);
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
  }, [avoid, avoidIfRoom, onMask, onSpriteChange, beats]);

  return (
    <>
      <canvas ref={invertCanvasRef} className={`${styles.glyphs} ${styles.panelInvert}`} aria-hidden="true" />
      <canvas ref={panelCanvasRef} className={`${styles.glyphs} ${styles.panels}`} aria-hidden="true" />
      <canvas ref={spriteCanvasRef} className={styles.glyphs} aria-hidden="true" />
    </>
  );
}
