"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sprites } from "@/assets/sprites";
import { site } from "@/lib/site";
import styles from "./MenuBar.module.css";

export default function MenuBar() {
  const pathname = usePathname();

  return (
    <header className={styles.bar}>
      <nav aria-label="Main">
        <ul className={styles.links}>
          {site.nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.link}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <Image src={sprites[item.icon]} alt="" className={styles.icon} unoptimized />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
