"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useRef, useState } from "react";
import { sprites } from "@/assets/sprites";
import { site } from "@/lib/site";
import styles from "./SiteMenu.module.css";

export type Point = { x: number; y: number };

type MenuContextValue = {
  /** The labels, so the home stage can size its arc round them. */
  nav: RefObject<HTMLElement | null>;
  /** The home stage publishes where the labels sit on its arc (viewport px), or null. */
  setArc: (arc: Point[] | null) => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export function useMenu() {
  const value = useContext(MenuContext);
  if (!value) throw new Error("useMenu must be used inside SiteMenu");
  return value;
}

// The bar across the top of the other pages (its height is --menu-height).
const BAR = { gap: 8, margin: 16, tightMargin: 6 }; // px

/** Centres of labels of these widths in a centred row across a width W, closing
 *  up the gaps (and margins) when they don't fit at full spacing. */
export function rowSpots(widths: number[], W: number, y: number): Point[] {
  const sum = widths.reduce((s, w) => s + w, 0);
  const n = widths.length;
  const roomy = sum + BAR.gap * (n - 1) <= W - 2 * BAR.margin;
  const gap = roomy ? BAR.gap : Math.max(0, (W - 2 * BAR.tightMargin - sum) / Math.max(n - 1, 1));
  let x = (W - (sum + gap * (n - 1))) / 2;
  return widths.map((w) => {
    const spot = { x: x + w / 2, y };
    x += w + gap;
    return spot;
  });
}

/**
 * The site's menu, kept across pages. On home the labels hang round the art
 * (placed by the stage's CableMenu); on every other page they morph into a bar
 * across the top.
 */
export default function SiteMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [arc, setArc] = useState<Point[] | null>(null);
  const [bar, setBar] = useState<Point[] | null>(null);
  // Off for the first placement, so the labels appear in place rather than flying in.
  const [animate, setAnimate] = useState(false);
  const onHome = pathname === "/";

  // Bar layout: the labels in a centred row.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const labels = [...nav.querySelectorAll("a")];
    const measure = () => {
      const W = nav.clientWidth;
      const y = parseFloat(getComputedStyle(nav).getPropertyValue("--menu-height")) / 2 || 24;
      setBar(
        rowSpots(
          labels.map((el) => el.offsetWidth),
          W,
          y,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const el of labels) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // On first loading home, wait (hidden) for the arc; after that, going home
  // keeps the labels in the bar until the stage has placed its arc.
  const spots = onHome ? (arc ?? (animate ? bar : null)) : bar;
  const inBar = !onHome || !arc;

  useEffect(() => {
    if (!spots || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [spots, animate]);

  return (
    <MenuContext.Provider value={{ nav: navRef, setArc }}>
      {children}
      <nav
        ref={navRef}
        aria-label="Main"
        className={styles.nav}
        data-bar={inBar && spots ? "" : undefined}
        data-animate={animate ? "" : undefined}
      >
        <div className={styles.strip} aria-hidden="true" />
        <ul>
          {site.nav.map((item, i) => (
            <li
              key={item.href}
              style={
                spots ? { left: spots[i].x, top: spots[i].y, transitionDelay: `${i * 40}ms` } : { visibility: "hidden" }
              }
            >
              <Link
                href={item.href}
                className={styles.label}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <Image src={sprites[item.icon]} alt="" className={styles.icon} unoptimized />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </MenuContext.Provider>
  );
}
