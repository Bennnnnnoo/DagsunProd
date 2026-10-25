"use client";

import { usePathname } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import styles from "./CableMenu.module.css";
import { type Point, useMenu } from "./SiteMenu";

type Props = {
  /** The speaker/character artwork box (1024 x 1040 art coordinates). */
  art: RefObject<HTMLElement | null>;
  /** The wordmark above the art: the top of the arc stays above it. */
  wordmark: RefObject<HTMLElement | null>;
  /** Other things the labels must keep clear of (e.g. the contacts box). */
  avoid?: RefObject<HTMLElement | null>[];
};

// Where each item's cable plugs into the speaker cabinet, in art coordinates,
// in menu order (left to right round the arc): left side, top, back corner.
const PLUGS: Point[] = [
  { x: 92, y: 430 },
  { x: 150, y: 175 },
  { x: 300, y: 150 },
  { x: 440, y: 230 },
  { x: 520, y: 330 },
];
const ARC = { padX: 130, padY: 60, aboveWordmark: 34, margin: 16 }; // px
// Below this stage width there's no room for the arc: the labels hang in a
// row across the top instead (still on their cables).
const ROW_BELOW = 700;
const ROW_Y = 22; // px
const WORDMARK_GAP = 12; // px kept between labels and the wordmark
const SAG = 0.35; // how far cables droop, relative to their length

// Pixel cable look, matching the decks' cables.
const PIXEL = 2; // CSS px per cable pixel
const WIDTH = 3; // cable pixels
const OUTLINE = "#131312";
const BODY = "#606060";
const HIGHLIGHT = "#878787";

/** Offset of an element within an ancestor, ignoring transforms (the art is scaled on /events). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

const NONE: RefObject<HTMLElement | null>[] = [];

type Layout = { labels: Point[]; plugs: Point[]; width: number; height: number };

/**
 * The home stage's half of the menu: places the labels (rendered by SiteMenu)
 * on an invisible semicircle round the main art, each hanging off a pixel
 * cable plugged into the speaker.
 */
export default function CableMenu({ art, wordmark, avoid = NONE }: Props) {
  const pathname = usePathname();
  const { nav, setArc } = useMenu();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  // Arc and plug positions, in px within the stage.
  useEffect(() => {
    const stage = canvasRef.current?.parentElement;
    if (!stage) return;
    const measure = () => {
      const artEl = art.current;
      const wordEl = wordmark.current;
      if (!artEl || artEl.offsetWidth === 0) return;
      const a = offsetWithin(artEl, stage);
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      const wordTop = wordEl ? offsetWithin(wordEl, stage).y : a.y;
      const n = site.nav.length;
      const row = W < ROW_BELOW;
      // Label sizes (rendered, possibly hidden), to keep them off the wordmark.
      const sizes = [...(nav.current?.querySelectorAll("a") ?? [])].map((el) => ({
        w: el.offsetWidth,
        h: el.offsetHeight,
      }));
      const obstacles = [wordEl, ...avoid.map((r) => r.current)]
        .filter((el): el is HTMLElement => !!el && el.offsetWidth > 0)
        .map((el) => offsetWithin(el, stage));
      const place = (rx: number, ry: number) =>
        site.nav.map((_, i) => {
          if (row) return { x: (W * (i + 0.5)) / n, y: ROW_Y };
          const angle = Math.PI - (i * Math.PI) / (n - 1); // left (180°) round the top to right (0°)
          return {
            x: Math.min(Math.max(cx + rx * Math.cos(angle), ARC.margin * 3), W - ARC.margin * 3),
            y: Math.min(Math.max(cy - ry * Math.sin(angle), ARC.margin * 1.5), H - ARC.margin),
          };
        });
      const clashes = (labels: Point[]) =>
        labels.some((p, i) => {
          const sz = sizes[i] ?? { w: 120, h: 32 };
          const g = WORDMARK_GAP;
          return obstacles.some(
            (o) =>
              p.x - sz.w / 2 < o.x + o.w + g &&
              o.x - g < p.x + sz.w / 2 &&
              p.y - sz.h / 2 < o.y + o.h + g &&
              o.y - g < p.y + sz.h / 2,
          );
        });
      // Start snug round the art, then find the smallest change to the arc's
      // width and height that keeps every label clear of the obstacles.
      const baseRx = Math.min(a.w / 2 + ARC.padX, W / 2 - ARC.margin * 2);
      const baseRy = Math.max(a.h / 2 + ARC.padY, cy - wordTop + ARC.aboveWordmark);
      let labels = place(baseRx, baseRy);
      if (!row && clashes(labels)) {
        let best: Point[] | null = null;
        let bestCost = Infinity;
        for (let dy = 0; dy <= 240; dy += 8)
          for (let dx = -80; dx <= 240; dx += 8) {
            const cost = Math.abs(dx) + dy;
            if (cost >= bestCost) continue;
            const rx = Math.min(baseRx + dx, W / 2 - ARC.margin * 2);
            const candidate = place(rx, baseRy + dy);
            if (!clashes(candidate)) {
              best = candidate;
              bestCost = cost;
            }
          }
        if (best) labels = best;
      }
      const plugs = PLUGS.map((p) => ({ x: a.x + (p.x / 1024) * a.w, y: a.y + (p.y / 1040) * a.h }));
      setLayout({ labels, plugs, width: W, height: H });
      // The labels live in a fixed layer over the page: hand them viewport px.
      const box = stage.getBoundingClientRect();
      setArc(labels.map((p) => ({ x: box.left + p.x, y: box.top + p.y })));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (art.current) observer.observe(art.current);
    return () => {
      observer.disconnect();
      setArc(null);
    };
  }, [art, wordmark, avoid, nav, setArc]);

  // Cables: drawn soft, then snapped to hard pixels in three layers (outline,
  // body, highlight) with a checker shadow, like the decks' cables.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const w = Math.ceil(layout.width / PIXEL);
    const h = Math.ceil(layout.height / PIXEL);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w * PIXEL}px`;
    canvas.style.height = `${h * PIXEL}px`;
    const ctx = canvas.getContext("2d");
    const scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    const sctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx || !sctx) return;

    const paths = layout.labels.map((label, i) => {
      const a = { x: label.x / PIXEL, y: label.y / PIXEL };
      const b = { x: layout.plugs[i].x / PIXEL, y: layout.plugs[i].y / PIXEL };
      const droop = Math.hypot(b.x - a.x, b.y - a.y) * SAG;
      const path = new Path2D();
      path.moveTo(a.x, a.y);
      path.bezierCurveTo(a.x, a.y + droop, b.x, b.y + droop, b.x, b.y);
      return path;
    });
    const out = ctx.createImageData(w, h);
    const stamp = (
      colour: string,
      lineWidth: number,
      dx = 0,
      dy = 0,
      keep: (x: number, y: number) => boolean = () => true,
    ) => {
      sctx.clearRect(0, 0, w, h);
      sctx.strokeStyle = colour;
      sctx.lineWidth = lineWidth;
      sctx.lineCap = "round";
      sctx.save();
      sctx.translate(dx, dy);
      for (const p of paths) sctx.stroke(p);
      sctx.restore();
      const src = sctx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (src[i + 3] < 128 || !keep(x, y)) continue;
          out.data[i] = src[i];
          out.data[i + 1] = src[i + 1];
          out.data[i + 2] = src[i + 2];
          out.data[i + 3] = 255;
        }
    };
    stamp(OUTLINE, WIDTH, 1, 1.5, (x, y) => (x + y) % 2 === 0);
    stamp(OUTLINE, WIDTH);
    stamp(BODY, WIDTH - 2 || 1);
    stamp(HIGHLIGHT, 1, -0.5, -0.5);
    ctx.putImageData(out, 0, 0);
  }, [layout]);

  // Off home the labels leave for the bar, so their cables go straight away.
  return (
    <canvas
      ref={canvasRef}
      className={`${styles.cables} ${pathname === "/" ? "" : styles.unplugged}`}
      aria-hidden="true"
    />
  );
}
