"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./DeckPlayer.module.css";

export type Track = {
  artist: string;
  title: string;
  src: string;
  cover: string | null;
};
export type NowPlaying = {
  playing: boolean;
  current: Track;
  next?: Track;
} | null;

type Props = {
  /** Controls only respond once the decks are full size. */
  enabled: boolean;
  /** Reports what's on the decks, for a readout outside the (scaled) decks. */
  onNowPlaying?: (now: NowPlaying) => void;
};

// Geometry in the 1024x1040 decks source (decks.png is the same, stretched wider);
// everything is placed as a percentage of the decks' box, so the stretch carries over.
const IMAGE = { width: 1024, height: 1040 };
const RECORDS = {
  playing: { cx: 197, cy: 518, r: 146 }, // left turntable
  next: { cx: 830, cy: 519, r: 146 }, // right turntable
};
const BUTTONS = {
  cue: { x: 258, y: 746, w: 44, h: 50 },
  play: { x: 316, y: 746, w: 46, h: 50 },
  nextCue: { x: 886, y: 746, w: 46, h: 50 },
  nextPlay: { x: 946, y: 746, w: 46, h: 50 },
};
const COVER_PIXELS = 96; // across the record: ~3 source px per art pixel, like the decks
const RESTART_WINDOW = 3; // seconds: CUE within this of the start goes to the previous track

// Test tracks live in the git-ignored public/local-tracks (scripts/load-local-tracks.py).
const TRACKS_URL = "/local-tracks/tracks.json";

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (b: { x: number; y: number; w: number; h: number }) => ({
  left: pct(b.x, IMAGE.width),
  top: pct(b.y, IMAGE.height),
  width: pct(b.w, IMAGE.width),
  height: pct(b.h, IMAGE.height),
});

/** Cover art redrawn at the decks' pixel size, so it reads as part of the pixel art. */
function PixelCover({ src }: { src: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, COVER_PIXELS, COVER_PIXELS);
    if (!src) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, COVER_PIXELS, COVER_PIXELS);
    img.src = src;
  }, [src]);
  return <canvas ref={canvasRef} width={COVER_PIXELS} height={COVER_PIXELS} className={styles.coverPixels} />;
}

function Record({
  which,
  track,
  spinning,
  onClick,
  enabled,
}: {
  which: keyof typeof RECORDS;
  track: Track | undefined;
  spinning: boolean;
  onClick?: () => void;
  enabled: boolean;
}) {
  const { cx, cy, r } = RECORDS[which];
  // The decks are stretched wider: draw a true circle, then stretch it to match.
  return (
    <div
      className={styles.record}
      style={box({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r })}
      onClick={enabled ? onClick : undefined}
      aria-hidden="true"
    >
      <div className={styles.disc}>
        <div className={`${styles.spinner} ${spinning ? styles.spinning : ""}`}>
          <PixelCover src={track?.cover ?? null} />
        </div>
        <span className={styles.spindle} />
      </div>
    </div>
  );
}

export default function DeckPlayer({ enabled, onNowPlaying }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set when a track ends, so the next one starts as soon as it's loaded.
  const autoplayRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(TRACKS_URL)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Track[]) => !cancelled && setTracks(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const current = tracks[index];
  const next = tracks.length > 1 ? tracks[(index + 1) % tracks.length] : undefined;

  // Load the current track; keep playing across skips if it was playing.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const keepPlaying = !audio.paused || autoplayRef.current;
    autoplayRef.current = false;
    audio.src = current.src;
    if (keepPlaying) void audio.play().catch(() => {});
  }, [current]);

  useEffect(() => {
    onNowPlaying?.(current ? { playing, current, next } : null);
  }, [onNowPlaying, playing, current, next]);

  // When a track ends, the next one comes across from the right deck.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const onEnded = () => {
      autoplayRef.current = true;
      setIndex((i) => (i + 1) % tracks.length);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [tracks.length]);

  if (tracks.length === 0) return null;

  // Skipping starts the new track playing.
  const skip = (by: number) => {
    autoplayRef.current = true;
    setIndex((i) => (i + by + tracks.length) % tracks.length);
  };

  // Button presses; reads the audio element only when clicked.
  const press = (key: keyof typeof BUTTONS) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (key === "play") {
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
    } else if (key === "cue") {
      if (audio.currentTime > RESTART_WINDOW) audio.currentTime = 0;
      else skip(-1);
    } else {
      skip(key === "nextPlay" ? 1 : -1);
    }
  };

  const buttons: {
    key: keyof typeof BUTTONS;
    label: string;
    pressed?: boolean;
  }[] = [
    { key: "cue", label: "Restart track" },
    { key: "play", label: playing ? "Pause" : "Play", pressed: playing },
    { key: "nextCue", label: "Previous track" },
    { key: "nextPlay", label: "Next track" },
  ];

  return (
    <div className={`${styles.player} ${enabled ? styles.enabled : ""}`}>
      <Record which="playing" track={current} spinning={playing} onClick={() => press("play")} enabled={enabled} />
      <Record which="next" track={next} spinning={false} enabled={enabled} />
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          className={styles.button}
          style={box(BUTTONS[b.key])}
          onClick={() => press(b.key)}
          aria-label={b.label}
          aria-pressed={b.pressed}
          title={b.label}
          tabIndex={enabled ? 0 : -1}
          disabled={!enabled}
        />
      ))}
    </div>
  );
}
