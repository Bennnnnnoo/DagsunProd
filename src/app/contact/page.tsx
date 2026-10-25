import type { Metadata } from "next";
import SectionPage from "@/components/SectionPage";
import { site } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const { email, instagram } = site.contact;
  return (
    <SectionPage title="Contact">
      <address className={styles.contacts}>
        <span className={styles.label}>Email</span>
        <a href={`mailto:${email}`}>{email}</a>
        <span className={styles.label}>Instagram</span>
        <a href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer">
          @{instagram}
        </a>
      </address>
    </SectionPage>
  );
}
