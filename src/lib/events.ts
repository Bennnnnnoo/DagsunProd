export type LabelEvent = {
  date: string; // ISO date, YYYY-MM-DD
  time?: string;
  title: string;
  venue: string;
  city: string;
};

// Placeholder events: replace with real dates and venues.
export const events: LabelEvent[] = [
  { date: "2026-11-07", time: "22:00", title: "Dagsun Sounds Launch Night", venue: "Venue TBA", city: "London" },
  { date: "2026-11-21", time: "22:00", title: "Label Showcase", venue: "Venue TBA", city: "Manchester" },
  { date: "2026-12-05", time: "23:00", title: "Garage All-Nighter", venue: "Venue TBA", city: "Bristol" },
  { date: "2026-12-19", time: "22:00", title: "Christmas Special", venue: "Venue TBA", city: "London" },
];
