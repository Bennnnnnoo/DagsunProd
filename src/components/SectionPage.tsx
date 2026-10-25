import type { ReactNode } from "react";
import styles from "./SectionPage.module.css";

/** Section page: its title, then its content, under the menu bar (SiteMenu). */
export default function SectionPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </section>
  );
}
