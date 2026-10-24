"use client";

import { useState } from "react";
import { events } from "@/lib/events";
import styles from "./EventsCalendar.module.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
};
const monthName = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
const fullDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** A wall-calendar page: one month's grid with event days marked, then the upcoming list. */
export default function EventsCalendar() {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const first = parse(sorted[0]?.date ?? new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState({ y: first.y, m: first.m });

  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const leadingBlanks = (new Date(Date.UTC(month.y, month.m, 1)).getUTCDay() + 6) % 7; // Monday first
  const byDay = new Map(
    sorted.filter((e) => parse(e.date).y === month.y && parse(e.date).m === month.m).map((e) => [parse(e.date).d, e]),
  );
  const step = (by: number) =>
    setMonth(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 }));

  return (
    <div className={styles.page}>
      {/* Binding rings along the top of the page. */}
      <div className={styles.rings} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      <div className={styles.header}>
        <button type="button" className={styles.nav} onClick={() => step(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2 className={styles.month}>
          {monthName(month.y, month.m)} {month.y}
        </h2>
        <button type="button" className={styles.nav} onClick={() => step(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className={styles.grid} role="grid" aria-label={`${monthName(month.y, month.m)} ${month.y}`}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday} role="columnheader">
            {d}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} className={styles.blank} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const event = byDay.get(day);
          return (
            <div key={day} className={`${styles.day} ${event ? styles.eventDay : ""}`} role="gridcell">
              <span className={styles.dayNumber}>{day}</span>
              {event && <span className={styles.dayEvent}>{event.title}</span>}
            </div>
          );
        })}
      </div>

      <h3 className={styles.listHeading}>Upcoming</h3>
      <ul className={styles.list}>
        {sorted.map((e) => (
          <li key={`${e.date}-${e.title}`} className={styles.item}>
            <time dateTime={e.date} className={styles.itemDate}>
              {fullDate(e.date)}
              {e.time && ` · ${e.time}`}
            </time>
            <span className={styles.itemTitle}>{e.title}</span>
            <span className={styles.itemPlace}>
              {e.venue}, {e.city}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
