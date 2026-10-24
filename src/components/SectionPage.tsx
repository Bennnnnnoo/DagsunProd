import styles from "./SectionPage.module.css";

/** Empty section page: just its title, until there's content. */
export default function SectionPage({ title }: { title: string }) {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
    </section>
  );
}
