import Link from "next/link";
import { site } from "@/lib/site";

export default function SiteHeader() {
  return (
    <header>
      <Link href="/">{site.name}</Link>
      <nav>
        <ul>
          {site.nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
