"use client";

import { type RefObject, useEffect, useRef } from "react";
import styles from "./PixelCables.module.css";

type Point = { x: number; y: number };

/** Points on an element, as fractions of its box. */
export type CableStart = { ref: RefObject<HTMLElement | null>; points: Point[] };
export type CableEnd = { ref: RefObject<HTMLElement | null>; x: number; y: number };

type Props = {
  /** Where the cables leave the decks image (its own cables' cut ends), left to right. */
  from: CableStart;
  /** Where the cables plug into the speaker. */
  to: CableEnd;
  /** Plug direction going in, degrees clockwise from pointing right (the speaker's perspective). */
  entryAngle: number;
  /** Source height of the decks image, to match its pixel size and cable thickness.
   *  (Height, because the decks are stretched wider; the cables keep square pixels.) */
  decksImageHeight: number;
  /** Changes whenever the decks move by transform, which ResizeObserver can't see. */
  layoutKey?: string | number;
  /** Fires "beat" on each kick: a signal pulse runs from the decks to the speaker,
   *  arriving as the next kick lands. */
  beats?: EventTarget;
};

// The signal pulse: bright blue like the background panels.
const PULSE_COLOUR = [0, 71, 255];
const PULSE_LENGTH = 40; // art pixels of cable lit at once, fading behind the head
const ARRIVAL = 0.15; // fraction of a beat the plug stays lit after the pulse lands

const GRID = 16; // invisible routing grid, CSS px
const BEND = GRID / 2; // corner radius on the grid, CSS px
const PLUG = 24; // plug length, CSS px

// Measured from the decks art: ~3 source px per art pixel, cables ~14 source px wide.
const ART_PIXEL = 3;
const CABLE_WIDTH = 14;

// Palette from the decks' own cables and jacks, desaturated to 30% like the decks.
const OUTLINE = "#131312";
const CABLES = [
  { body: "#60605d", highlight: "#88877e" }, // left cable: lighter
  { body: "#454541", highlight: "#60605d" }, // right cable: darker
];
const METAL = { body: "#9e9e9e", highlight: "#c0bfbf" };

const snap = (v: number) => Math.round(v / GRID) * GRID;

type Route = { grid: Point[]; plugBack: Point; tip: Point; angle: number };

/**
 * Along grid lines: up from the decks to a grid row, across to a grid column
 * left of the speaker, up that column to a point below-left of the plug, then
 * one smooth curve into the plug at the speaker's perspective angle.
 */
function route(start: Point, tip: Point, entryAngle: number): Route {
  const angle = (entryAngle * Math.PI) / 180;
  const plugBack = { x: tip.x - Math.cos(angle) * PLUG, y: tip.y - Math.sin(angle) * PLUG };
  const row = Math.max(GRID, snap(start.y - GRID));
  const leaveRow = snap(plugBack.y + 2 * GRID);
  const column = Math.max(GRID, Math.min(snap(plugBack.x - 3 * GRID), snap(plugBack.x - GRID)));
  return {
    grid: [start, { x: start.x, y: row }, { x: column, y: row }, { x: column, y: leaveRow }],
    plugBack,
    tip,
    angle,
  };
}

/** The same route shifted down-right, so a second cable runs alongside without crossing. */
function shift(r: Route, d: number): Route {
  const move = (p: Point) => ({ x: p.x + d, y: p.y + d });
  return { grid: r.grid.map(move), plugBack: move(r.plugBack), tip: move(r.tip), angle: r.angle };
}

function cablePath({ grid, plugBack, angle }: Route, scale: number) {
  const s = (p: Point) => ({ x: p.x * scale, y: p.y * scale });
  const g = grid.map(s);
  const back = s(plugBack);
  const path = new Path2D();
  path.moveTo(g[0].x, g[0].y);
  for (let i = 1; i < g.length - 1; i++) path.arcTo(g[i].x, g[i].y, g[i + 1].x, g[i + 1].y, BEND * scale);
  // Off the grid: leave heading the way the run was going, arrive along the plug.
  const leave = g[g.length - 1];
  const before = g[g.length - 2];
  const run = Math.hypot(leave.x - before.x, leave.y - before.y) || 1;
  const reach = Math.max(GRID * scale, Math.hypot(back.x - leave.x, back.y - leave.y) * 0.6);
  path.lineTo(leave.x, leave.y);
  path.bezierCurveTo(
    leave.x + ((leave.x - before.x) / run) * reach,
    leave.y + ((leave.y - before.y) / run) * reach,
    back.x - Math.cos(angle) * reach,
    back.y - Math.sin(angle) * reach,
    back.x,
    back.y,
  );
  return path;
}

/** The cable's centre line as points about 1 art pixel apart, decks to plug tip. */
function samplePath({ grid, plugBack, tip, angle }: Route, scale: number): Point[] {
  const s = (p: Point) => ({ x: p.x * scale, y: p.y * scale });
  const g = grid.map(s);
  const back = s(plugBack);
  const end = s(tip);
  const out: Point[] = [];
  const line = (a: Point, b: Point) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 0; i < n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  for (let i = 0; i < g.length - 1; i++) line(g[i], g[i + 1]); // grid corners are near enough at this scale
  // Same curve as cablePath.
  const leave = g[g.length - 1];
  const before = g[g.length - 2];
  const run = Math.hypot(leave.x - before.x, leave.y - before.y) || 1;
  const reach = Math.max(GRID * scale, Math.hypot(back.x - leave.x, back.y - leave.y) * 0.6);
  const c1 = { x: leave.x + ((leave.x - before.x) / run) * reach, y: leave.y + ((leave.y - before.y) / run) * reach };
  const c2 = { x: back.x - Math.cos(angle) * reach, y: back.y - Math.sin(angle) * reach };
  let prev = leave;
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    const u = 1 - t;
    const p = {
      x: u * u * u * leave.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * back.x,
      y: u * u * u * leave.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * back.y,
    };
    line(prev, p);
    prev = p;
  }
  line(back, end);
  out.push(end);
  return out;
}

/** Jack plug as rectangles along +x from the tip backwards, in art pixels. */
function plugShape(ctx: CanvasRenderingContext2D, r: Route, scale: number, width: number, inset: number) {
  ctx.save();
  ctx.translate(r.tip.x * scale, r.tip.y * scale);
  ctx.rotate(r.angle);
  const len = PLUG * scale;
  const h = width + 2 - inset * 2;
  ctx.fillRect(-len + inset, -h / 2, len * 0.75 - inset * 2, h); // barrel
  ctx.fillRect(-len * 0.25 - inset, -h / 4, len * 0.25, h / 2); // tip
  ctx.restore();
}

/**
 * Pixel-art compositing: each layer is drawn with the canvas's usual
 * antialiasing on a scratch canvas, then snapped to hard pixels (alpha >= 50%)
 * and stamped into the output in order, so nothing ends up blended.
 */
function render(out: ImageData, scratch: CanvasRenderingContext2D, routes: Route[], scale: number, width: number) {
  const { width: w, height: h } = out;
  const stamp = (colour: string, draw: () => void, keep: (x: number, y: number) => boolean = () => true) => {
    scratch.clearRect(0, 0, w, h);
    scratch.fillStyle = colour;
    scratch.strokeStyle = colour;
    draw();
    const src = scratch.getImageData(0, 0, w, h).data;
    const dst = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] < 128 || !keep(x, y)) continue;
        dst[i] = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = 255;
      }
    }
  };
  const strokeAll =
    (lineWidth: number, dx = 0, dy = 0, only?: number) =>
    () => {
      scratch.lineWidth = lineWidth;
      scratch.lineCap = "round";
      scratch.lineJoin = "round";
      scratch.save();
      scratch.translate(dx, dy);
      routes.forEach((r, i) => {
        if (only === undefined || only === i) scratch.stroke(cablePath(r, scale));
      });
      scratch.restore();
    };

  // Checkerboard drop shadow down-right, like the decks' own cables.
  stamp(
    OUTLINE,
    () => {
      strokeAll(width, 1.5, 2.5)();
      scratch.save();
      scratch.translate(1.5, 2.5);
      routes.forEach((r) => plugShape(scratch, r, scale, width, 0));
      scratch.restore();
    },
    (x, y) => (x + y) % 2 === 0,
  );
  // Each cable: outline, body, highlight strip toward the upper left.
  routes.forEach((_, i) => {
    stamp(OUTLINE, strokeAll(width, 0, 0, i));
    stamp(CABLES[i % CABLES.length].body, strokeAll(Math.max(1, width - 2), 0, 0, i));
    stamp(CABLES[i % CABLES.length].highlight, strokeAll(Math.max(1, Math.round((width - 2) / 3)), -0.6, -0.6, i));
  });
  // Plugs in the speaker.
  stamp(OUTLINE, () => routes.forEach((r) => plugShape(scratch, r, scale, width, 0)));
  stamp(METAL.body, () => routes.forEach((r) => plugShape(scratch, r, scale, width, 1)));
  stamp(METAL.highlight, () =>
    routes.forEach((r) => {
      scratch.save();
      scratch.translate(-0.6, -0.8);
      plugShape(scratch, r, scale, Math.max(1, width - 3), 1.5);
      scratch.restore();
    }),
  );
}

export default function PixelCables({ from, to, entryAngle, decksImageHeight, layoutKey, beats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pulse = pulseRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !pulse || !host) return;
    const scratchCanvas = document.createElement("canvas");
    let tracks: Point[][] = [];
    let cableWidth = 3;

    let frame = 0;
    const draw = () => {
      const box = host.getBoundingClientRect();
      const decks = from.ref.current?.getBoundingClientRect();
      const target = to.ref.current?.getBoundingClientRect();
      if (!decks || !target || decks.height === 0) return;

      // One canvas pixel per art pixel, so the cable matches the decks' pixel size.
      const decksScale = decks.height / decksImageHeight;
      const pixel = Math.max(1, Math.round(ART_PIXEL * decksScale));
      const scale = 1 / pixel;
      const w = Math.ceil(box.width * scale);
      const h = Math.ceil(box.height * scale);
      canvas.width = scratchCanvas.width = w;
      canvas.height = scratchCanvas.height = h;
      canvas.style.width = pulse.style.width = `${w * pixel}px`;
      canvas.style.height = pulse.style.height = `${h * pixel}px`;
      pulse.width = w;
      pulse.height = h;
      const ctx = canvas.getContext("2d");
      const scratch = scratchCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !scratch) return;

      const at = (r: DOMRect, x: number, y: number) => ({
        x: r.left - box.left + x * r.width,
        y: r.top - box.top + y * r.height,
      });
      const starts = from.points.map((p) => at(decks, p.x, p.y));
      const tip = at(target, to.x, to.y);
      // Cables run as a pair: the first sets the route, the rest follow it
      // shifted by their spacing at the decks.
      const first = route(starts[0], tip, entryAngle);
      const routes = starts.map((s, i) => (i === 0 ? first : shift(first, s.x - starts[0].x)));

      const out = ctx.createImageData(w, h);
      const width = Math.max(3, Math.round((CABLE_WIDTH * decksScale) / pixel));
      render(out, scratch, routes, scale, width);
      ctx.putImageData(out, 0, 0);
      tracks = routes.map((r) => samplePath(r, scale));
      cableWidth = width;
    };

    // Signal pulse, timed off the beat events: leaves the decks on a kick and
    // reaches the plug as the next one lands, which then lights up.
    let beatAt = performance.now();
    let beatLength = 455;
    const onBeat = () => {
      const now = performance.now();
      const gap = now - beatAt;
      if (gap > 250 && gap < 900) beatLength = gap;
      beatAt = now;
    };
    beats?.addEventListener("beat", onBeat);
    const [pr, pg, pb] = PULSE_COLOUR;
    const lightPulse = (now: number) => {
      const ctx = pulse.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, pulse.width, pulse.height);
      const t = Math.min((now - beatAt) / beatLength, 1);
      const body = Math.max(3, cableWidth); // the full cable width (room for a white core)
      for (const track of tracks) {
        if (!track.length) continue;
        // Once it has arrived, wait for the next kick rather than sitting at the plug.
        const head = t < 1 ? Math.floor(t * (track.length - 1)) : -1;
        for (let i = 0; i < PULSE_LENGTH; i++) {
          const p = track[head - i];
          if (!p) break;
          // Solid at the head, then a checker dither thinning out behind it.
          const keep = 1 - i / PULSE_LENGTH;
          const x = Math.round(p.x - body / 2);
          const y = Math.round(p.y - body / 2);
          for (let dy = 0; dy < body; dy++)
            for (let dx = 0; dx < body; dx++) {
              if (keep <= 0.6 && ((x + dx + y + dy) & 1) !== (i & 1)) continue;
              // White core at the head, so it shows over the blue panels too.
              const core = keep > 0.6 && dx > 0 && dy > 0 && dx < body - 1 && dy < body - 1;
              ctx.fillStyle = core ? "#fff" : `rgb(${pr},${pg},${pb})`;
              ctx.fillRect(x + dx, y + dy, 1, 1);
            }
        }
        // Arrival: the plug end glows for a moment after the kick.
        if (t < ARRIVAL) {
          const end = track[track.length - 1];
          const r = body * 2 + 1;
          ctx.fillRect(Math.round(end.x - r), Math.round(end.y - r), r * 2, r * 2);
        }
      }
    };
    let pulseFrame = 0;
    const animate = (now: number) => {
      lightPulse(now);
      pulseFrame = requestAnimationFrame(animate);
    };
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) pulseFrame = requestAnimationFrame(animate);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    for (const el of [from.ref.current, to.ref.current]) {
      if (el) observer.observe(el.parentElement ?? el);
    }
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pulseFrame);
      observer.disconnect();
      beats?.removeEventListener("beat", onBeat);
    };
  }, [from, to, entryAngle, decksImageHeight, layoutKey, beats]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.cables} aria-hidden="true" />
      <canvas ref={pulseRef} className={styles.cables} aria-hidden="true" />
    </>
  );
}
