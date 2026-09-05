"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOMAINS } from "@/lib/domains";
import styles from "./sidebar.module.css";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}>
        모델 설명 리포트
      </Link>

      <nav className={styles.nav}>
        {DOMAINS.map((d) => {
          const href = `/report/${d.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={d.slug}
              href={href}
              className={`${styles.item} ${active ? styles.itemActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {d.label}
            </Link>
          );
        })}
        <Link
          href="/upload"
          className={`${styles.item} ${pathname === "/upload" ? styles.itemActive : ""}`}
          aria-current={pathname === "/upload" ? "page" : undefined}
        >
          CSV 업로드
        </Link>
      </nav>
    </aside>
  );
}
