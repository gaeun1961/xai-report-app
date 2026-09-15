"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  formatSavedAt,
  getUploadHistoryEntry,
  loadUploadReport,
  type UploadHistoryEntry,
} from "@/lib/uploadHistory";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

const TOP_N = 5;

type Side = {
  id: string;
  entry: UploadHistoryEntry | null;
  report: ShapReport | null;
};

function loadSide(id: string | null): Side | null {
  if (!id) return null;
  return { id, entry: getUploadHistoryEntry(id), report: loadUploadReport(id) };
}

function verdictLabel(v: "good" | "fair" | "weak") {
  return { good: "양호", fair: "참고", weak: "주의" }[v];
}

function verdictClass(v: "good" | "fair" | "weak") {
  return { good: styles.qualityGood, fair: styles.qualityFair, weak: styles.qualityWeak }[v];
}

function ComparePageInner() {
  const params = useSearchParams();
  const [left, setLeft] = useState<Side | null>(null);
  const [right, setRight] = useState<Side | null>(null);
  const [checked, setChecked] = useState(false);

  const idA = params.get("a");
  const idB = params.get("b");

  useEffect(() => {
    setLeft(loadSide(idA));
    setRight(loadSide(idB));
    setChecked(true);
  }, [idA, idB]);

  if (!checked) return null;

  if (!left?.report || !right?.report) {
    return (
      <main className={styles.report}>
        <h1 className={styles.h1}>분석 비교</h1>
        <p className={styles.guide}>
          비교할 분석 기록을 찾을 수 없어요. 사이드바 "내 분석 기록"에서 2개를
          선택해 다시 시도해주세요.
        </p>
      </main>
    );
  }

  const a = left.report;
  const b = right.report;
  const topA = a.featureImportance.slice(0, TOP_N).map((f) => f.feature);
  const topB = b.featureImportance.slice(0, TOP_N).map((f) => f.feature);
  const setA = new Set(topA);
  const setB = new Set(topB);
  const common = topA.filter((f) => setB.has(f));
  const onlyA = topA.filter((f) => !setB.has(f));
  const onlyB = topB.filter((f) => !setA.has(f));

  const accDiff = b.modelAccuracy - a.modelAccuracy;
  const accDiffClass = accDiff > 0 ? styles.up : accDiff < 0 ? styles.down : "";

  return (
    <main className={styles.report}>
      <h1 className={styles.h1}>분석 비교</h1>

      <section className={styles.cardSection}>
        <div className={styles.compareHeadRow}>
          <div>
            <strong>{left.entry?.fileName ?? a.domain}</strong>
            {left.entry && (
              <p className={styles.sectionNote}>{formatSavedAt(left.entry.savedAt)}</p>
            )}
          </div>
          <div>
            <strong>{right.entry?.fileName ?? b.domain}</strong>
            {right.entry && (
              <p className={styles.sectionNote}>{formatSavedAt(right.entry.savedAt)}</p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>정확도</h2>
        <div className={styles.compareHeadRow}>
          <p className={styles.accuracy}>{(a.modelAccuracy * 100).toFixed(1)}%</p>
          <p className={styles.accuracy}>{(b.modelAccuracy * 100).toFixed(1)}%</p>
        </div>
        <p className={`${styles.sectionNote} ${accDiffClass}`}>
          차이: {accDiff >= 0 ? "+" : ""}
          {(accDiff * 100).toFixed(1)}%p
        </p>

        {(a.modelQuality || b.modelQuality) && (
          <div className={styles.compareHeadRow}>
            {a.modelQuality ? (
              <span className={`${styles.qualityBadge} ${verdictClass(a.modelQuality.verdict)}`}>
                {verdictLabel(a.modelQuality.verdict)}
              </span>
            ) : (
              <span />
            )}
            {b.modelQuality ? (
              <span className={`${styles.qualityBadge} ${verdictClass(b.modelQuality.verdict)}`}>
                {verdictLabel(b.modelQuality.verdict)}
              </span>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>특성 중요도 상위 {TOP_N}개 비교</h2>
        <p className={styles.sectionNote}>
          둘 다 상위 {TOP_N}위 안에 있는 요인 / 한쪽에만 있는 요인
        </p>
        <div className={`${styles.badges} ${styles.badgesStart}`}>
          {common.length > 0 ? (
            common.map((f) => (
              <span key={f} className={`${styles.badge} ${styles.badgeActualOk}`}>
                {f}
              </span>
            ))
          ) : (
            <span className={styles.sectionNote}>공통 요인 없음</span>
          )}
        </div>
        <p className={styles.sectionNote}>왼쪽에만 있는 요인</p>
        <div className={`${styles.badges} ${styles.badgesStart}`}>
          {onlyA.length > 0 ? (
            onlyA.map((f) => (
              <span key={f} className={`${styles.badge} ${styles.badgeNo}`}>
                {f}
              </span>
            ))
          ) : (
            <span className={styles.sectionNote}>없음</span>
          )}
        </div>
        <p className={styles.sectionNote}>오른쪽에만 있는 요인</p>
        <div className={`${styles.badges} ${styles.badgesStart}`}>
          {onlyB.length > 0 ? (
            onlyB.map((f) => (
              <span key={f} className={`${styles.badge} ${styles.badgeYes}`}>
                {f}
              </span>
            ))
          ) : (
            <span className={styles.sectionNote}>없음</span>
          )}
        </div>
      </section>

      <Link href="/" className={styles.toggleBtn}>
        홈으로
      </Link>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}
