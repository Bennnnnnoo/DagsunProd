import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/lib/site";
import styles from "./SectionPage.module.css";

/** Empty section page: just its title, until there's content, plus links back
 *  to the rest of the site (the main menu lives on the home stage). */
export default function SectionPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.page}>
      <nav aria-label="Main" className={styles.nav}>
        {site.nav.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </section>
  );
}
