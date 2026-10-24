import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <h1>Not found</h1>
      <p>
        <Link href="/">Back home</Link>
      </p>
    </section>
  );
}
