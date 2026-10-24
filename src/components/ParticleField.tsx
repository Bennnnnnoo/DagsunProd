"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { fragmentShader, vertexShader } from "./particleFieldShaders";
import styles from "./ParticleField.module.css";

type Props = {
  color?: string;
  accent?: string;
  background?: string;
  className?: string;
};

const CAMERA_Z = 5;
const TILT = -0.35;
const MAX_POINTS = 140_000;
const MIN_POINTS = 20_000;

export default function ParticleField({
  color = "#ffffff",
  accent = "#7fd4ff",
  background = "#000000",
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    const count = THREE.MathUtils.clamp((width * height) / 9, MIN_POINTS, MAX_POINTS);
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

    const uniforms = {
      uTime: { value: 0 },
      uPlane: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(999, 999) },
      uMouseForce: { value: 0 },
      uMouseRadius: { value: 0.9 },
      uPointSize: { value: 9 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: new THREE.Color(color) },
      uAccent: { value: new THREE.Color(accent) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    const lastPointer = new THREE.Vector2();
    let pointerActive = false;
    let energy = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (!pointerActive) lastPointer.set(x, y);
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
    const smoothMouse = new THREE.Vector3(999, 999, 0);
    const normal = new THREE.Vector3();

    const timer = new THREE.Timer();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = (timestamp?: number) => {
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.1);
      uniforms.uTime.value = timer.getElapsed();

      // Gentle camera parallax toward the pointer.
      const target = pointerActive ? pointer : new THREE.Vector2();
      camera.position.x += (target.x * 0.4 - camera.position.x) * 0.04;
      camera.position.y += (target.y * 0.25 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      // Energy rises with pointer speed and decays, so moving stirs the field.
      const speed = pointer.distanceTo(lastPointer) / Math.max(dt, 1e-3);
      lastPointer.copy(pointer);
      energy = Math.min(energy + speed * dt * 0.6, 1.6) * Math.pow(0.15, dt);
      const targetForce = pointerActive ? 0.35 + energy : 0;
      uniforms.uMouseForce.value += (targetForce - uniforms.uMouseForce.value) * 0.08;

      // Project the pointer onto the tilted plane, in its local space.
      if (pointerActive) {
        points.updateMatrixWorld();
        normal.set(0, 0, 1).transformDirection(points.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(normal, points.position);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          points.worldToLocal(hit);
          if (smoothMouse.x > 100) smoothMouse.copy(hit);
          smoothMouse.lerp(hit, 0.15);
          uniforms.uMouse.value.set(smoothMouse.x, smoothMouse.y);
        }
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
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [color, accent, background]);

  return (
    <div
      ref={containerRef}
      className={[styles.field, className].filter(Boolean).join(" ")}
      style={{ background }}
      aria-hidden="true"
    />
  );
}
