import type { Metadata } from "next";
import SectionPage from "@/components/SectionPage";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return <SectionPage title="Contact" />;
}
