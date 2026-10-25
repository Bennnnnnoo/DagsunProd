"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import character from "@/assets/art/character.png";
import characterDark from "@/assets/art/character-dark.png";
import { drivers } from "@/assets/art/drivers";
import speakerDark from "@/assets/art/speaker-dark.png";
import speaker from "@/assets/art/speaker.png";
import zoomArtDark from "@/assets/art/zoom-dark.png";
import zoomArt from "@/assets/art/zoom.png";
import decks from "@/assets/decks.png";
import wordmark from "@/assets/wordmark.png";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";
import GlyphScatter from "./GlyphScatter";
import CableMenu from "./CableMenu";
import DeckPlayer, { type NowPlaying } from "./DeckPlayer";
import EventsCalendar from "./EventsCalendar";
import PixelCables from "./PixelCables";
import Faders from "./Faders";
import type { FieldControls, GlyphMask } from "./ParticleField";
import styles from "./Hero.module.css";

// The field (three.js, the biggest script) loads after the page has painted:
// the art and decks show straight away and the particles fade in behind them.
const ParticleField = dynamic(() => import("./ParticleField"), { ssr: false });

const FIELD_COLORS = {
  light: { color: "#111111", accent: "#2b4fc2", background: "#ffffff" },
  dark: { color: "#f2f2f2", accent: "#7fa2ff", background: "#000000" },
};

const DRIVER_STRENGTHS = drivers.map((d) => d.strength);
const DEFAULT_FIELD_CONTROLS: FieldControls = {
  flow: 0.5,
  warp: 0.5,
  bass: 0.5,
  grain: 0.5,
};

// Cable ends. Start: where the decks' own two cables are cut off at the top
// of decks.png (1024x1040: x 697 and 751, nudged 6px in so there's no seam).
// End: the speaker cabinet's left side (artwork 90,450 of 1024x1040).
const DECKS_CABLE_EXITS = [
  { x: 697 / 1024, y: 6 / 1040 },
  { x: 751.5 / 1024, y: 6 / 1040 },
];
const SPEAKER_BACK = { x: 90 / 1024, y: 450 / 1040 };
// Perspective of the cabinet: its front-face top edge runs (190,100) -> (505,280),
// so "straight into the side panel" points down-right at that angle on screen.
const SPEAKER_ENTRY_ANGLE = (Math.atan2(280 - 100, 505 - 190) * 180) / Math.PI;

// Each page is a view of the same stage: on /tracks the decks grow to centre
// stage; on /events everything zooms into the hole in the character's staff,
// where a calendar page is waiting. Switching pages animates between views.
type View = { grow: number; zoom: number };
const VIEWS: Record<string, View> = {
  "/": { grow: 0, zoom: 0 },
  "/tracks": { grow: 1, zoom: 0 },
  "/events": { grow: 0, zoom: 1 },
};
const TRANSITION_MS = 1100;
// The hole in the top of the upright staff, in the 1024x1040 artwork.
const STAFF_HOLE = { x: 865, y: 139, rx: 10, ry: 18 };
const ZOOM_MAX = 300; // scale at which the hole covers any screen
const GROWN_MARGIN = 24; // px around the full-size decks
const READOUT_SPACE = 56; // px kept free under them for the now-playing readout
const WORDMARK_GAP = 12; // px between the wordmark and the full-size decks
const CABLES_FPS = 20; // the cables redraw (a pixel loop) at most this often while moving

// The artwork layers are 1024px rasters shown at most 560px wide (90vw on
// phones); a higher quality than the default keeps their halftone crisp.
const ART_SIZES = "(max-width: 622px) 90vw, 560px";
const ART_QUALITY = 90;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export default function Hero() {
  const driverRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const decksRef = useRef<HTMLDivElement>(null);
  // Particle field style, set by the faders on the decks; the field reads it every frame.
  const fieldControls = useRef<FieldControls>({ ...DEFAULT_FIELD_CONTROLS });
  const onFader = useCallback((key: keyof FieldControls, value: number) => {
    fieldControls.current[key] = value;
  }, []);
  const speakerBackRef = useRef<HTMLSpanElement>(null);
  const cablesFrom = useMemo(() => ({ ref: decksRef, points: DECKS_CABLE_EXITS }), []);
  const cablesTo = useMemo(() => ({ ref: speakerBackRef, x: 0.5, y: 0.5 }), []);
  const artRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const pathname = usePathname();
  const stageRef = useRef<HTMLElement>(null);
  // Set up by the layout effect below; animates the stage to a view.
  const goTo = useRef<(target: View) => void>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const holeRef = useRef<HTMLSpanElement>(null);
  // Glyphs: GlyphScatter paints their mask, the particle field draws them.
  const glyphMask = useRef<GlyphMask>({ canvas: null, version: 0, strength: 1, bursts: [] });
  const onGlyphMask = useCallback((canvas: HTMLCanvasElement) => {
    glyphMask.current.canvas = canvas;
    glyphMask.current.version++;
  }, []);
  const onSpriteChange = useCallback((x: number, y: number) => {
    if (glyphMask.current.strength > 0.5) glyphMask.current.bursts.push({ x, y });
  }, []);
  const [grown, setGrown] = useState(false); // full size: the decks are playable
  const [calendarOpen, setCalendarOpen] = useState(false); // zoomed all the way into the hole
  const [decksLayout, setDecksLayout] = useState(""); // the decks' transform, for the cables
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const decksEl = decksRef.current;
    const wordmarkEl = wordmarkRef.current;
    const holeEl = holeRef.current;
    if (!stage || !decksEl || !wordmarkEl || !holeEl) return;
    const snap = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let lastCables = 0;
    // Written straight to the DOM; React only re-renders when "grown" or
    // "calendarOpen" flips.
    const apply = ({ grow: g, zoom: z }: View, now: number) => {
      // Full size is a centred stack under the menu bar: wordmark, decks (as large
      // as fits), readout. Everything moves there from where it sits in the
      // corner layout (offset* ignore transforms).
      const menu = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--menu-height")) || 0;
      const wordmarkH = wordmarkEl.offsetHeight;
      const roomW = stage.clientWidth - 2 * GROWN_MARGIN;
      const roomH = stage.clientHeight - menu - 2 * GROWN_MARGIN - READOUT_SPACE - wordmarkH - WORDMARK_GAP;
      const scale = Math.min(roomW / decksEl.offsetWidth, roomH / decksEl.offsetHeight);
      const stackTop = menu + GROWN_MARGIN + (roomH - decksEl.offsetHeight * scale) / 2;
      const decksTop = stackTop + wordmarkH + WORDMARK_GAP;

      const tx = (stage.clientWidth - decksEl.offsetWidth * scale) / 2 - decksEl.offsetLeft;
      const ty = decksTop - decksEl.offsetTop;
      const transform = `translate(${(tx * g).toFixed(1)}px, ${(ty * g).toFixed(1)}px) scale(${(1 + (scale - 1) * g).toFixed(4)})`;
      decksEl.style.transform = transform;

      // The wordmark sits in .content, which sits in the stage.
      const content = wordmarkEl.offsetParent as HTMLElement;
      const wx = (stage.clientWidth - wordmarkEl.offsetWidth) / 2 - (content.offsetLeft + wordmarkEl.offsetLeft);
      const wy = stackTop - (content.offsetTop + wordmarkEl.offsetTop);
      wordmarkEl.style.transform = `translate(${(wx * g).toFixed(1)}px, ${(wy * g).toFixed(1)}px)`;

      // Zoom: scale the logo and artwork about the staff's hole (exponentially,
      // so it feels like a steady dive), and grow the calendar's window with it.
      const artEl = holeEl.offsetParent as HTMLElement; // .artWrap, inside .content
      const ox = artEl.offsetLeft + holeEl.offsetLeft;
      const oy = artEl.offsetTop + holeEl.offsetTop;
      const zoomScale = ZOOM_MAX ** z;
      const artScale = artEl.offsetWidth / 1024;
      content.style.transformOrigin = `${ox}px ${oy}px`;
      content.style.transform = z > 0 ? `scale(${zoomScale.toFixed(3)})` : "";
      content.style.visibility = z >= 1 ? "hidden" : "";
      // While zooming, a flat raster of the artwork stands in for its SVG layers.
      if (z > 0) stage.dataset.zooming = "";
      else delete stage.dataset.zooming;
      stage.style.setProperty("--hole-x", `${(content.offsetLeft + ox).toFixed(1)}px`);
      stage.style.setProperty("--hole-y", `${(content.offsetTop + oy).toFixed(1)}px`);
      stage.style.setProperty("--hole-rx", `${(STAFF_HOLE.rx * artScale * zoomScale).toFixed(1)}px`);
      stage.style.setProperty("--hole-ry", `${(STAFF_HOLE.ry * artScale * zoomScale).toFixed(1)}px`);
      stage.style.setProperty("--zoom", z.toFixed(3));
      setCalendarOpen(z >= 1);

      stage.style.setProperty("--grow", g.toFixed(3));
      // The glyphs belong to the home view: fade them with the decks and the zoom.
      glyphMask.current.strength = (1 - g) * (1 - Math.min(1, z * 4));
      // The now-playing readout sits just under the full-size decks.
      const readoutTop = decksTop + decksEl.offsetHeight * scale + 8;
      stage.style.setProperty("--readout-top", `${Math.round(readoutTop)}px`);
      setGrown(g >= 0.999 && z === 0);
      // The cables are hidden at full size and fade as the decks grow, so a
      // throttled redraw is enough; always redraw once movement settles.
      const settled = !raf;
      if (settled || now - lastCables > 1000 / CABLES_FPS) {
        lastCables = now;
        setDecksLayout(transform);
      }
    };

    let shown: View = { grow: 0, zoom: 0 };
    let raf = 0;
    let first = true;
    goTo.current = (target) => {
      cancelAnimationFrame(raf);
      raf = 0;
      // The first call (page load, or opening a view's page directly) jumps straight there.
      if (snap || first || (target.grow === shown.grow && target.zoom === shown.zoom)) {
        first = false;
        shown = target;
        apply(shown, performance.now());
        return;
      }
      const from = shown;
      let start = -1;
      const frame = (now: number) => {
        if (start < 0) start = now;
        const t = Math.min((now - start) / TRANSITION_MS, 1);
        const e = easeInOut(t);
        shown = { grow: from.grow + (target.grow - from.grow) * e, zoom: from.zoom + (target.zoom - from.zoom) * e };
        if (t < 1) raf = requestAnimationFrame(frame);
        else raf = 0;
        apply(shown, now);
      };
      raf = requestAnimationFrame(frame);
    };

    const onResize = () => apply(shown, performance.now());
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      goTo.current = null;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    goTo.current?.(VIEWS[pathname] ?? VIEWS["/"]);
  }, [pathname]);

  // Pump the speaker cones on each kick (written straight to the DOM so the
  // per-frame envelope doesn't re-render React), and tell the background glyphs
  // when a new beat lands so they change in time.
  const beats = useMemo(() => new EventTarget(), []);
  const lastBeat = useRef(-1);
  const onBeat = useCallback(
    (envelope: number, beat: number) => {
      artRef.current?.style.setProperty("--kick", envelope.toFixed(3));
      if (beat !== lastBeat.current) {
        lastBeat.current = beat;
        beats.dispatchEvent(new CustomEvent("beat", { detail: beat }));
      }
    },
    [beats],
  );

  return (
    <section ref={stageRef} className={styles.hero}>
      <ParticleField
        sourceRefs={driverRefs}
        sourceStrengths={DRIVER_STRENGTHS}
        onBeat={onBeat}
        controls={fieldControls}
        glyphMask={glyphMask}
        paused={calendarOpen}
        {...FIELD_COLORS[theme]}
      />
      <GlyphScatter decks={decksRef} onMask={onGlyphMask} onSpriteChange={onSpriteChange} beats={beats} />
      {/* The decks' two cables continue into the back of the speaker stack, behind the artwork. */}
      <PixelCables
        from={cablesFrom}
        to={cablesTo}
        entryAngle={SPEAKER_ENTRY_ANGLE}
        decksImageHeight={decks.height}
        layoutKey={decksLayout}
        beats={beats}
      />
      {/* The menu: labels round the art, each on a cable into the speaker. */}
      <CableMenu art={artRef} wordmark={wordmarkRef} />
      <div ref={decksRef} className={styles.decks}>
        <Image src={decks} alt="" className={styles.decksArt} loading="eager" />
        {/* On home the decks open the Tracks page (the faders, on top, still slide). */}
        {pathname === "/" && (
          <Link href="/tracks" className={styles.decksLink}>
            <span className={styles.decksHint}>Play tracks</span>
          </Link>
        )}
        <Faders initial={DEFAULT_FIELD_CONTROLS} onChange={onFader} />
        <DeckPlayer enabled={grown} onNowPlaying={setNowPlaying} />
      </div>
      {nowPlaying && (
        <p className={`${styles.nowPlaying} ${grown ? styles.nowPlayingShown : ""}`} aria-live="polite">
          <span className={styles.nowLabel}>{nowPlaying.playing ? "Playing" : "Press play"}</span>{" "}
          {nowPlaying.current.artist} — {nowPlaying.current.title}
          {nowPlaying.next && (
            <>
              <br />
              <span className={styles.nowLabel}>Next</span> {nowPlaying.next.artist} — {nowPlaying.next.title}
            </>
          )}
        </p>
      )}
      <div className={styles.content}>
        {/* Full logo: wordmark bar over the artwork, proportioned as in LOGO_WITH_TEXT.png. */}
        <div className={styles.logo}>
          <h1 ref={wordmarkRef} className={styles.wordmark}>
            <Image src={wordmark} alt="Dagsun Sound" preload />
          </h1>
          <div ref={artRef} className={styles.artWrap}>
            {/* Artwork layers: static cabinet, one image per speaker cone (each
                pumps from its own centre), then the character on top. Cabinet
                and character have light/dark versions; CSS hides one and lazy
                loading means the hidden pair is never fetched. */}
            <Image
              src={speaker}
              alt=""
              sizes={ART_SIZES}
              quality={ART_QUALITY}
              className={`${styles.speakerArt} ${styles.lightArt}`}
              loading="eager"
            />
            <Image
              src={speakerDark}
              alt=""
              sizes={ART_SIZES}
              quality={ART_QUALITY}
              className={`${styles.speakerArt} ${styles.darkArt}`}
            />
            {drivers.map((d, i) => {
              const origin = `${d.x * 100}% ${d.y * 100}%`;
              return (
                <div key={i}>
                  <Image
                    src={d.src}
                    alt=""
                    sizes={ART_SIZES}
                    quality={ART_QUALITY}
                    className={styles.driverArt}
                    loading="eager"
                    style={
                      {
                        transformOrigin: origin,
                        "--strength": d.strength,
                      } as CSSProperties
                    }
                  />
                  {/* The kick rings radiate from here. */}
                  <span
                    ref={(el) => {
                      driverRefs.current[i] = el;
                    }}
                    className={styles.driverCentre}
                    style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
                  />
                </div>
              );
            })}
            {/* The hole in the staff; /events zooms into it. */}
            <span
              ref={holeRef}
              className={styles.staffHole}
              style={{ left: `${(STAFF_HOLE.x / 1024) * 100}%`, top: `${(STAFF_HOLE.y / 1040) * 100}%` }}
            />
            <span
              ref={speakerBackRef}
              className={styles.speakerBack}
              style={{
                left: `${SPEAKER_BACK.x * 100}%`,
                top: `${SPEAKER_BACK.y * 100}%`,
              }}
            />
            {/* Flat stand-in for all of the above while zooming into the staff:
                one image scales cheaply, ~10k SVG shapes don't. Kept in the page
                (hidden) so it's loaded before the first zoom. */}
            <Image src={zoomArt} alt="" unoptimized className={`${styles.zoomArt} ${styles.lightArt}`} />
            <Image src={zoomArtDark} alt="" unoptimized className={`${styles.zoomArt} ${styles.darkArt}`} />
            <Image
              src={character}
              alt=""
              sizes={ART_SIZES}
              quality={ART_QUALITY}
              className={`${styles.characterArt} ${styles.lightArt}`}
              loading="eager"
            />
            <Image
              src={characterDark}
              alt=""
              sizes={ART_SIZES}
              quality={ART_QUALITY}
              className={`${styles.characterArt} ${styles.darkArt}`}
            />
          </div>
        </div>
      </div>
      {/* The calendar page seen through the staff's hole; fills the screen on /events. */}
      <div className={`${styles.calendarLayer} ${calendarOpen ? styles.calendarOpen : ""}`} inert={!calendarOpen}>
        <EventsCalendar />
      </div>
    </section>
  );
}
