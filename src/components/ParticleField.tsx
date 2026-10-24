"use client";

import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";
import { fragmentShader, vertexShader } from "./particleFieldShaders";
import styles from "./ParticleField.module.css";

/**
 * Live style controls, each 0..1 with 0.5 as the default look. Read every
 * frame, so writing to the object takes effect without re-rendering.
 */
export type FieldControls = {
  flow: number; // fluid speed: 1/4x .. 4x
  warp: number; // how much the fluid folds: flat .. 2x
  bass: number; // kick push on particles and cones: none .. 2x
  grain: number; // dot size and dither chunkiness: fine .. chunky
};

const DEFAULT_CONTROLS: FieldControls = { flow: 0.5, warp: 0.5, bass: 0.5, grain: 0.5 };

/** Shapes for the field to draw with its own particles (see GlyphScatter). */
export type GlyphMask = {
  canvas: HTMLCanvasElement | null; // white shapes on black, covering the field
  version: number; // bumped whenever the canvas changes
  strength: number; // 0..1
  /** Screen points (client px) to disrupt the field at; the field drains this each frame. */
  bursts: { x: number; y: number }[];
};

type Props = {
  controls?: RefObject<FieldControls>;
  glyphMask?: RefObject<GlyphMask>;
  color?: string;
  accent?: string;
  background?: string;
  className?: string;
  /** Elements whose centres the kick rings radiate from (e.g. speaker cones). */
  sourceRefs?: RefObject<(HTMLElement | null)[]>;
  /** Kick strength per source, matching sourceRefs. Defaults to one source at the centre. */
  sourceStrengths?: readonly number[];
  /** Called every frame with the kick envelope (1 on the hit, decaying to 0) and the beat number. */
  onBeat?: (envelope: number, beat: number) => void;
};

const CAMERA_Z = 5;
const TILT = -0.35;
const MAX_POINTS = 65_000; // enough particles to draw readable glyphs
const MIN_POINTS = 8_000;
const TRAIL = 24; // pointer wake samples
const TRAIL_SPACING = 0.08; // plane units between samples
const TRAIL_DECAY = 0.08; // fraction of life left after one second
const BPM = 132; // UK garage tempo, four on the floor
const BEAT_INTERVAL = 60 / BPM;
const KICKS = 2; // the current kick plus the tail of the last one, for far particles
const KICK_DECAY = 12; // envelope falloff per second; shared by cones and particles
const SOUND_SPEED = 6; // plane units per second the push travels out from a driver
const DEFAULT_STRENGTHS = [1];
// How far the field reaches from the speaker. At 1280x900, 0.05 keeps particles
// within ~100px; 0.3 fills most of the screen but fades out toward the edges.
const FOCUS_RADIUS = 0.3;
// Visibility far from the speaker. Keep it near 0: dither still lights a
// particle's centre pixel at a few percent, which reads as dust everywhere.
const FOCUS_FLOOR = 0;
const FOCUS_BOOST = 1.3; // extra density right around the speaker
const BURSTS = 8; // disruptions alive at once
const BURST_LIFE = 1.4; // seconds a disruption lasts
const GLYPH_FLOW = 0.2; // share of the field's flow the glyphs' particles follow
const CLUMPS = 0.7; // density added in drifting random regions, anywhere on screen

function isLightBackground(hex: string) {
  return new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
}

export default function ParticleField({
  color = "#111111",
  accent = "#2b4fc2",
  background = "#ffffff",
  className,
  sourceRefs,
  sourceStrengths = DEFAULT_STRENGTHS,
  onBeat,
  controls,
  glyphMask,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so a new callback each render doesn't restart the scene.
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    } catch {
      return; // No WebGL: leave the plain background.
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(background);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.set(0, 0, CAMERA_Z);

    // Grid of points in [-0.5, 0.5]², jittered to avoid moiré. Scaled to the
    // viewport in the shader via uPlane, so resize doesn't rebuild geometry.
    const { width, height } = container.getBoundingClientRect();
    const count = THREE.MathUtils.clamp((width * height) / 20, MIN_POINTS, MAX_POINTS);
    const aspect = width / Math.max(height, 1);
    const cols = Math.round(Math.sqrt(count * aspect));
    const rows = Math.round(count / cols);
    const positions = new Float32Array(cols * rows * 3);
    const randoms = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        positions[i * 3] = (x + Math.random() * 0.8) / cols - 0.5;
        positions[i * 3 + 1] = (y + Math.random() * 0.8) / rows - 0.5;
        randoms[i] = Math.random();
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

    // Black 1x1 until a glyph mask arrives.
    const emptyMask = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    emptyMask.needsUpdate = true;
    let maskTexture: THREE.CanvasTexture | null = null;
    let maskVersion = -1;
    let burstHead = 0;

    const uniforms = {
      uTime: { value: 0 },
      uPlane: { value: new THREE.Vector2(1, 1) },
      uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4(999, 999, 0, 0)) },
      uTrailLife: { value: new Array<number>(TRAIL).fill(0) },
      // Disruptions: xy = plane-local centre, z = start time (uClock), w = 1 when set.
      uBursts: { value: Array.from({ length: BURSTS }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uClock: { value: 0 },
      uTrailRadius: { value: 0.45 },
      uSources: { value: sourceStrengths.map((s) => new THREE.Vector3(0, 0, s)) },
      uBeatAge: { value: 0 },
      uBeatInterval: { value: BEAT_INTERVAL },
      uFocus: { value: new THREE.Vector2() },
      uFocusRadius: { value: FOCUS_RADIUS },
      uFocusFloor: { value: FOCUS_FLOOR },
      uFocusBoost: { value: FOCUS_BOOST },
      uClumps: { value: CLUMPS },
      uGlyphMask: { value: emptyMask as THREE.Texture },
      uGlyphStrength: { value: 0 },
      uWarp: { value: 1 },
      uBass: { value: 1 },
      uPointSize: { value: 11 },
      uPixelRatio: { value: pixelRatio },
      uDitherScale: { value: pixelRatio },
      uColor: { value: new THREE.Color(color) },
      uAccent: { value: new THREE.Color(accent) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      defines: {
        TRAIL,
        BURSTS,
        BURST_LIFE: BURST_LIFE.toFixed(2),
        KICKS,
        SOURCES: sourceStrengths.length,
        KICK_DECAY: KICK_DECAY.toFixed(1),
        GLYPH_FLOW: GLYPH_FLOW.toFixed(2),
        SOUND_SPEED: SOUND_SPEED.toFixed(1),
      },
      depthWrite: false,
      // Additive glow only reads on dark backgrounds; light ones need normal blending.
      blending: isLightBackground(background) ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.rotation.x = TILT;
    points.frustumCulled = false; // Shader displaces past the geometry bounds.
    scene.add(points);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
      // Overscan the visible area so the tilted, displaced plane covers the edges.
      const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * CAMERA_Z;
      uniforms.uPlane.value.set(visibleH * camera.aspect * 1.5, visibleH * 1.8);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Pointer state, in NDC relative to the canvas.
    const pointer = new THREE.Vector2();
    let pointerActive = false;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);
      pointerActive = x >= -1 && x <= 1 && y >= -1 && y <= 1;
    };
    const onPointerLeave = () => {
      pointerActive = false;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerLeave);
    document.addEventListener("pointerleave", onPointerLeave);

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const lastHit = new THREE.Vector2();
    const lastSample = new THREE.Vector2();
    const velocity = new THREE.Vector2();
    const frameVelocity = new THREE.Vector2();
    let hasLastHit = false;
    let trailHead = 0;

    // Project a canvas NDC point onto the tilted plane, in its local space.
    points.updateMatrixWorld();
    normal.set(0, 0, 1).transformDirection(points.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, points.position);
    const toPlane = (ndc: THREE.Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return points.worldToLocal(hit);
    };

    // Track the source elements every frame so the rings follow layout changes.
    const sourceNdc = new THREE.Vector2();
    const updateSources = () => {
      const els = sourceRefs?.current;
      if (!els) return;
      const box = container.getBoundingClientRect();
      els.forEach((el, i) => {
        const target = uniforms.uSources.value[i];
        if (!el || !target) return;
        const src = el.getBoundingClientRect();
        sourceNdc.set(
          ((src.left + src.width / 2 - box.left) / box.width) * 2 - 1,
          -((src.top + src.height / 2 - box.top) / box.height) * 2 + 1,
        );
        const local = toPlane(sourceNdc);
        if (local) target.setX(local.x).setY(local.y);
      });
      // The densest part of the field sits on the strength-weighted centre of the sources.
      let weight = 0;
      uniforms.uFocus.value.set(0, 0);
      for (const s of uniforms.uSources.value) {
        uniforms.uFocus.value.x += s.x * s.z;
        uniforms.uFocus.value.y += s.y * s.z;
        weight += s.z;
      }
      if (weight > 0) uniforms.uFocus.value.divideScalar(weight);
    };

    const timer = new THREE.Timer();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let fieldTime = 0;

    const frame = (timestamp?: number) => {
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.1);
      const elapsed = timer.getElapsed();

      // Style controls (the deck faders). Flow advances the field's own clock,
      // so changing speed never jumps the animation.
      const c = controls?.current ?? DEFAULT_CONTROLS;
      fieldTime += dt * 4 ** (c.flow * 2 - 1);
      uniforms.uTime.value = fieldTime;
      uniforms.uClock.value = elapsed;

      // Disruptions queued by GlyphScatter (sprites appearing and vanishing).
      const queued = glyphMask?.current?.bursts;
      while (queued?.length) {
        const b = queued.shift()!;
        const rect = container.getBoundingClientRect();
        const at = toPlane(
          new THREE.Vector2(((b.x - rect.left) / rect.width) * 2 - 1, -((b.y - rect.top) / rect.height) * 2 + 1),
        );
        if (!at) continue;
        uniforms.uBursts.value[burstHead].set(at.x, at.y, elapsed, 1);
        burstHead = (burstHead + 1) % BURSTS;
      }

      // Glyph mask: (re)wrap the canvas as a texture and upload changes.
      const mask = glyphMask?.current;
      if (mask?.canvas) {
        if (maskTexture?.image !== mask.canvas) {
          maskTexture?.dispose();
          maskTexture = new THREE.CanvasTexture(mask.canvas);
          maskTexture.minFilter = THREE.LinearFilter;
          maskTexture.generateMipmaps = false;
          uniforms.uGlyphMask.value = maskTexture;
          maskVersion = -1;
        }
        if (mask.version !== maskVersion) {
          maskTexture.needsUpdate = true;
          maskVersion = mask.version;
        }
      }
      uniforms.uGlyphStrength.value = mask?.canvas ? mask.strength : 0;
      uniforms.uWarp.value = c.warp * 2;
      const bass = c.bass * 2;
      uniforms.uBass.value = bass;
      uniforms.uPointSize.value = 11 * 2 ** (c.grain * 2 - 1);
      uniforms.uDitherScale.value = pixelRatio * (c.grain < 0.6 ? 1 : c.grain < 0.85 ? 2 : 3);

      // Fake audio: a kick on every beat (on the real clock, so tempo is fixed).
      const beatAge = elapsed % BEAT_INTERVAL;
      uniforms.uBeatAge.value = beatAge;
      onBeatRef.current?.(Math.exp(-beatAge * KICK_DECAY) * bass, Math.floor(elapsed / BEAT_INTERVAL));
      updateSources();

      // Fade the wake.
      const life = uniforms.uTrailLife.value;
      const fade = Math.pow(TRAIL_DECAY, dt);
      for (let i = 0; i < TRAIL; i++) life[i] *= fade;

      // Drop wake samples along the pointer's path, carrying its velocity.
      const local = pointerActive ? toPlane(pointer) : null;
      if (local && dt > 0) {
        if (!hasLastHit) {
          lastHit.set(local.x, local.y);
          lastSample.copy(lastHit);
          velocity.set(0, 0);
          hasLastHit = true;
        }
        frameVelocity.set(local.x - lastHit.x, local.y - lastHit.y).divideScalar(dt);
        velocity.lerp(frameVelocity, 0.3).clampLength(0, 6);
        lastHit.set(local.x, local.y);

        if (lastHit.distanceTo(lastSample) > TRAIL_SPACING) {
          uniforms.uTrail.value[trailHead].set(local.x, local.y, velocity.x, velocity.y);
          life[trailHead] = 1;
          trailHead = (trailHead + 1) % TRAIL;
          lastSample.copy(lastHit);
        }
      } else {
        hasLastHit = false;
      }

      renderer.render(scene, camera);
    };

    // Only animate while on screen.
    let visible = true;
    const syncLoop = () => {
      renderer.setAnimationLoop(visible && !reducedMotion ? frame : null);
    };
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncLoop();
    });
    intersectionObserver.observe(container);
    if (reducedMotion) frame();
    else syncLoop();

    return () => {
      renderer.setAnimationLoop(null);
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerLeave);
      document.removeEventListener("pointerleave", onPointerLeave);
      timer.dispose();
      geometry.dispose();
      material.dispose();
      emptyMask.dispose();
      maskTexture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [color, accent, background, sourceRefs, sourceStrengths, controls, glyphMask]);

  return <div ref={containerRef} className={[styles.field, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
