"use client";

import Image, { type StaticImageData } from "next/image";
import { type KeyboardEvent, type PointerEvent, useState } from "react";
import crossfaderCap from "@/assets/crossfader-cap.png";
import faderCap from "@/assets/fader-cap.png";
import type { FieldControls } from "./ParticleField";
import styles from "./Faders.module.css";

type Props = {
  initial: FieldControls;
  onChange: (key: keyof FieldControls, value: number) => void;
};

// Geometry in decks.png (1024x1040 source px); see scripts/prepare-decks.py.
const IMAGE = { width: 1024, height: 1040 };

type Fader = {
  key: keyof FieldControls;
  label: string;
  vertical: boolean;
  /** Hit area. */
  box: { x: number; y: number; w: number; h: number };
  /** Cap centre travel: along y for vertical faders (top = 1), x for the crossfader (right = 1). */
  from: number;
  to: number;
  /** Fixed cap centre on the other axis. */
  across: number;
  sprite: StaticImageData;
  /** Cap centre within the sprite. */
  centre: { x: number; y: number };
};

const channel = (key: keyof FieldControls, label: string, stem: number): Fader => ({
  key,
  label,
  vertical: true,
  box: { x: stem - 16, y: 609, w: 32, h: 108 },
  from: 703, // bottom (0) -> top (1)
  to: 623,
  across: stem - 1.5,
  sprite: faderCap,
  centre: { x: 15.5, y: 12.5 },
});

// The mixer's three channel faders and the crossfader.
const FADERS: Fader[] = [
  channel("flow", "Flow", 417),
  channel("warp", "Warp", 484),
  channel("bass", "Bass", 549),
  {
    key: "grain",
    label: "Grain",
    vertical: false,
    box: { x: 472, y: 750, w: 90, h: 40 },
    from: 482, // left (0) -> right (1)
    to: 551,
    across: 769,
    sprite: crossfaderCap,
    centre: { x: 10.5, y: 20 },
  },
];

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export default function Faders({ initial, onChange }: Props) {
  const [values, setValues] = useState<FieldControls>(initial);

  const set = (key: keyof FieldControls, value: number) => {
    const v = clamp(value);
    setValues((prev) => ({ ...prev, [key]: v }));
    onChange(key, v);
  };

  // Pointer position on the track -> value, via source px.
  const fromPointer = (f: Fader, e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pos = f.vertical
      ? f.box.y + ((e.clientY - r.top) / r.height) * f.box.h
      : f.box.x + ((e.clientX - r.left) / r.width) * f.box.w;
    set(f.key, (pos - f.from) / (f.to - f.from));
  };

  const onKey = (key: keyof FieldControls, e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    const moves: Record<string, number> = {
      ArrowUp: step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowLeft: -step,
      PageUp: 0.2,
      PageDown: -0.2,
    };
    if (e.key in moves) set(key, values[key] + moves[e.key]);
    else if (e.key === "Home") set(key, 0);
    else if (e.key === "End") set(key, 1);
    else return;
    e.preventDefault();
  };

  return (
    <>
      {FADERS.map((f) => {
        const along = f.from + values[f.key] * (f.to - f.from);
        const cx = f.vertical ? f.across : along;
        const cy = f.vertical ? along : f.across;
        // Sprite placed so its cap centre sits on (cx, cy), relative to the hit box.
        const left = cx - f.centre.x - f.box.x;
        const top = cy - f.centre.y - f.box.y;
        return (
          <div
            key={f.key}
            role="slider"
            tabIndex={0}
            aria-label={f.label}
            aria-orientation={f.vertical ? "vertical" : "horizontal"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(values[f.key] * 100)}
            title={f.label}
            className={`${styles.track} ${f.vertical ? styles.vertical : styles.horizontal}`}
            style={{
              left: `${(f.box.x / IMAGE.width) * 100}%`,
              top: `${(f.box.y / IMAGE.height) * 100}%`,
              width: `${(f.box.w / IMAGE.width) * 100}%`,
              height: `${(f.box.h / IMAGE.height) * 100}%`,
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(f, e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(f, e);
            }}
            onKeyDown={(e) => onKey(f.key, e)}
            onDoubleClick={() => set(f.key, 0.5)}
          >
            <Image
              src={f.sprite}
              alt=""
              draggable={false}
              className={styles.cap}
              style={{
                left: `${(left / f.box.w) * 100}%`,
                top: `${(top / f.box.h) * 100}%`,
                width: `${(f.sprite.width / f.box.w) * 100}%`,
                height: `${(f.sprite.height / f.box.h) * 100}%`,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
