import type { SpriteName } from "@/assets/sprites";

export const site = {
  name: "Dagsun Sounds",
  contact: {
    email: "dagsunsounds@gmail.com",
    instagram: "dagsunsounds",
  },
  nav: [
    { href: "/", label: "Home", icon: "shield" },
    { href: "/events", label: "Events", icon: "stopwatch" },
    { href: "/merch", label: "Merch", icon: "cart" },
    { href: "/tracks", label: "Tracks", icon: "circleR" },
    { href: "/contact", label: "Contact", icon: "figure" },
  ] satisfies { href: string; label: string; icon: SpriteName }[],
};
