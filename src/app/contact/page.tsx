import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section>
      <h1>Contact</h1>
      <p>
        General enquiries: <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
      <h2>Demos</h2>
      <p>Placeholder demo submission info.</p>
    </section>
  );
}
