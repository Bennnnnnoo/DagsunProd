import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <section>
      <h1>About {site.name}</h1>
      <p>Placeholder about text.</p>
    </section>
  );
}
