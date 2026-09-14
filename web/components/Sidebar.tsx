"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOMAINS } from "@/lib/domains";
import {
  HISTORY_CHANGED_EVENT,
  listUploadHistory,
  type UploadHistoryEntry,
} from "@/lib/uploadHistory";
import styles from "./sidebar.module.css";

export default function Sidebar() {
  const pathname = usePathname();
  // starts empty on both server and first client render (avoids a hydration
  // mismatch), then loads from localStorage right after mount — again on
  // route change (a just-saved upload), and again on HISTORY_CHANGED_EVENT
  // (a rename on the report page you're already viewing, so the route
  // doesn't change but the label in this list still needs to update).
  const [history, setHistory] = useState<UploadHistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => setHistory(listUploadHistory());
    refresh();
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
  }, [pathname]);

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}>
        모델 설명 리포트
      </Link>

      <nav className={styles.nav}>
        <span className={styles.navHeading}>예시 데이터</span>
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
        <nav className={`${styles.nav} ${styles.navDivider}`}>
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
