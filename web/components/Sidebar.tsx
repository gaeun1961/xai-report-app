"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOMAINS } from "@/lib/domains";
import { listUploadHistory, type UploadHistoryEntry } from "@/lib/uploadHistory";
import styles from "./sidebar.module.css";

export default function Sidebar() {
  const pathname = usePathname();
  // starts empty on both server and first client render (avoids a hydration
  // mismatch), then loads from localStorage right after mount — and again
  // whenever the route changes, so a just-saved upload shows up right away.
  const [history, setHistory] = useState<UploadHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(listUploadHistory());
  }, [pathname]);

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
      </nav>

      {history.length > 0 && (
        <nav className={styles.nav}>
          <span className={styles.navHeading}>내 분석 기록</span>
          {history.map((h) => {
            const href = `/my/${h.id}`;
            const active = pathname === href;
            return (
              <Link
                key={h.id}
                href={href}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
                aria-current={active ? "page" : undefined}
                title={h.fileName}
              >
                {h.fileName}
              </Link>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
