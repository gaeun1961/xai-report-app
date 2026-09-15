"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadReport } from "@/lib/loadReport";
import { findDomain } from "@/lib/domains";
import {
  formatSavedAt,
  getUploadHistoryEntry,
  loadUploadReport,
} from "@/lib/uploadHistory";
import type { ShapReport } from "@/lib/types";
import styles from "@/components/report.module.css";

const TOP_N = 5;
const STRONG_CORR = 0.6;
const PRESET_PREFIX = "preset:";

type Side = {
  id: string;
  label: string;
  savedAt: number | null;
  report: ShapReport | null;
};

function loadSide(id: string | null): Side | null {
  if (!id) return null;
  if (id.startsWith(PRESET_PREFIX)) {
    const slug = id.slice(PRESET_PREFIX.length);
    return {
      id,
      label: findDomain(slug)?.title ?? slug,
      savedAt: null,
      report: loadReport(slug),
    };
  }
  const entry = getUploadHistoryEntry(id);
  return {
    id,
    label: entry?.fileName ?? id,
    savedAt: entry?.savedAt ?? null,
    report: loadUploadReport(id),
  };
}

function verdictLabel(v: "good" | "fair" | "weak") {
  return { good: "양호", fair: "참고", weak: "주의" }[v];
}

function verdictClass(v: "good" | "fair" | "weak") {
  return { good: styles.qualityGood, fair: styles.qualityFair, weak: styles.qualityWeak }[v];
}

// pairs at/above STRONG_CORR, strongest first — same rule as the summary
// sentence on the single-report page, just rendered as a list here.
function strongCorrLabels(report: ShapReport): string[] {
  const data = report.correlations;
  if (!data) return [];
  const { columns, matrix } = data;
  const pairs: { i: number; j: number; v: number }[] = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      if (Math.abs(matrix[i][j]) >= STRONG_CORR) pairs.push({ i, j, v: matrix[i][j] });
    }
  }
  pairs.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  return pairs.map((p) => `${columns[p.i]}-${columns[p.j]} (r=${p.v.toFixed(2)})`);
}

function missingLabels(report: ShapReport): string[] {
  return (report.missingness ?? [])
    .filter((m) => m.missingCount > 0)
    .sort((a, b) => b.missingPct - a.missingPct)
    .map((m) => `${m.column} (${(m.missingPct * 100).toFixed(1)}%)`);
}

function outlierLabels(report: ShapReport): string[] {
  return (report.outliers ?? [])
    .filter((o) => o.outlierCount > 0)
    .sort((a, b) => b.outlierPct - a.outlierPct)
    .map((o) => `${o.column} (${(o.outlierPct * 100).toFixed(1)}%)`);
}

function BadgeList({ items, cls }: { items: string[]; cls: string }) {
  if (items.length === 0) return <span className={styles.sectionNote}>없음</span>;
  return (
    <div className={`${styles.badges} ${styles.badgesStart}`}>
      {items.map((s) => (
        <span key={s} className={`${styles.badge} ${cls}`}>
          {s}
        </span>
      ))}
    </div>
  );
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
          비교할 분석 기록을 찾을 수 없어요. 사이드바에서 예시 데이터나 "내 분석
          기록"에서 2개를 선택해 다시 시도해주세요.
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

  const hasDataQuality =
    a.correlations || b.correlations || a.missingness?.length || b.missingness?.length ||
    a.outliers?.length || b.outliers?.length;

  return (
    <main className={styles.report}>
      <h1 className={styles.h1}>분석 비교</h1>

      <section className={styles.cardSection}>
        <div className={styles.compareHeadRow}>
          <div>
            <strong>{left.label}</strong>
            {left.savedAt !== null && (
              <p className={styles.sectionNote}>{formatSavedAt(left.savedAt)}</p>
            )}
          </div>
          <div>
            <strong>{right.label}</strong>
            {right.savedAt !== null && (
              <p className={styles.sectionNote}>{formatSavedAt(right.savedAt)}</p>
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
          <>
            <div className={styles.compareHeadRow}>
              {a.modelQuality ? (
                <span
                  className={`${styles.qualityBadge} ${verdictClass(a.modelQuality.verdict)}`}
                >
                  {verdictLabel(a.modelQuality.verdict)}
                </span>
              ) : (
                <span />
              )}
              {b.modelQuality ? (
                <span
                  className={`${styles.qualityBadge} ${verdictClass(b.modelQuality.verdict)}`}
                >
                  {verdictLabel(b.modelQuality.verdict)}
                </span>
              ) : (
                <span />
              )}
            </div>
            <div className={styles.compareHeadRow}>
              <p className={styles.sectionNote}>{a.modelQuality?.message ?? "-"}</p>
              <p className={styles.sectionNote}>{b.modelQuality?.message ?? "-"}</p>
            </div>
          </>
        )}
      </section>

      <section className={styles.cardSection}>
        <h2 className={styles.h2}>특성 중요도 상위 {TOP_N}개 비교</h2>
        <p className={styles.sectionNote}>
          둘 다 상위 {TOP_N}위 안에 있는 요인 / 한쪽에만 있는 요인
        </p>
        <BadgeList items={common} cls={styles.badgeActualOk} />
        <p className={styles.sectionNote}>왼쪽에만 있는 요인</p>
        <BadgeList items={onlyA} cls={styles.badgeNo} />
        <p className={styles.sectionNote}>오른쪽에만 있는 요인</p>
        <BadgeList items={onlyB} cls={styles.badgeYes} />
      </section>

      {hasDataQuality && (
        <section className={styles.cardSection}>
          <h2 className={styles.h2}>데이터 품질 비교</h2>

          <p className={styles.sectionNote}>강한 상관관계 (|r|≥{STRONG_CORR})</p>
          <div className={styles.compareHeadRow}>
            <BadgeList items={strongCorrLabels(a)} cls={styles.badgeActualOk} />
            <BadgeList items={strongCorrLabels(b)} cls={styles.badgeActualOk} />
          </div>

          <p className={styles.sectionNote}>결측치</p>
          <div className={styles.compareHeadRow}>
            <BadgeList items={missingLabels(a)} cls={styles.badgeNo} />
            <BadgeList items={missingLabels(b)} cls={styles.badgeNo} />
          </div>

          <p className={styles.sectionNote}>이상치</p>
          <div className={styles.compareHeadRow}>
            <BadgeList items={outlierLabels(a)} cls={styles.badgeNo} />
            <BadgeList items={outlierLabels(b)} cls={styles.badgeNo} />
          </div>
        </section>
      )}

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
