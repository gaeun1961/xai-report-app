"use client";

import { useEffect, useState } from "react";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import { getFeatureName, setFeatureName } from "@/lib/featureNames";
import GlossaryTerm from "./GlossaryTerm";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

export type PercentBarItem = { label: string; value: number };

type Props = {
  items: PercentBarItem[];
  domain: string;
  collapsedCount?: number;
  // how to render the number next to each bar — defaults to a raw 0–1 value
  // (feature importance); pass e.g. `(v) => `${(v*100).toFixed(1)}%`` for a share
  valueFormat?: (v: number) => string;
  // optional per-item hover note (e.g. a feature's tendency), keyed by label
  tooltips?: Record<string, string>;
};

// fixed 0–1 domain (not each report's own max) so a bar's length means the
// same thing across rows and across domains, not just "biggest here"
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];

// Column name shown for this one row, click-to-rename (per-browser display
// override via lib/featureNames.ts — the underlying `column` name used for
// every lookup, e.g. columnDesc/tooltips, never changes, only what's shown).
// Starts un-overridden on both server and first client render (avoids a
// hydration mismatch), then loads from localStorage right after mount.
function EditableFeatureLabel({
  domain,
  column,
  desc,
  suggested,
}: {
  domain: string;
  column: string;
  desc?: string;
  suggested?: boolean;
}) {
  const [override, setOverride] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column);

  useEffect(() => {
    setOverride(getFeatureName(domain, column));
  }, [domain, column]);

  const displayName = override ?? column;

  // blur fires even with no edit made (click the pencil, click away) — only
  // persist on an actual change, same reasoning as ReportView's value-label
  // chip (a no-op save would otherwise still overwrite localStorage).
  function save() {
    if (draft.trim() !== displayName.trim()) {
      setFeatureName(domain, column, draft);
      setOverride(draft.trim() || undefined);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        className={styles.caseNameInput}
        value={draft}
        autoFocus
        maxLength={40}
        aria-label={`${column} 표시 이름 수정`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span className={styles.caseId}>
      <GlossaryTerm term={displayName} desc={desc} suggested={suggested} />
      <button
        type="button"
        className={styles.caseNameEditBtn}
        aria-label={`${column} 표시 이름 수정`}
        onClick={() => {
          setDraft(displayName);
          setEditing(true);
        }}
      >
        ✎
      </button>
    </span>
  );
}

export default function PercentBarChart({
  items,
  domain,
  collapsedCount = 8,
  valueFormat = (v) => v.toFixed(3),
  tooltips,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const hidden = sorted.length - collapsedCount;
  const visible = expanded ? sorted : sorted.slice(0, collapsedCount);

  return (
    <>
      <div className={styles.chartAxisRow}>
        <span />
        <div className={styles.chartAxisTrack}>
          {AXIS_TICKS.map((t) => (
            <span
              key={t}
              className={styles.chartAxisTick}
              style={{
                left: `${t * 100}%`,
                transform:
                  t === 0 ? "none" : t === 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {Math.round(t * 100)}%
            </span>
          ))}
        </div>
        <span />
      </div>

      <ul className={styles.chart}>
        {visible.map(({ label, value }) => (
          <li key={label} className={styles.chartRow}>
            <span className={styles.chartLabel}>
              <EditableFeatureLabel
                domain={domain}
                column={label}
                desc={columnDesc(domain, label)}
                suggested={isSuggestedDesc(domain, label)}
              />
              {tooltips?.[label] && (
                <>
                  {" "}
                  <InfoTip text={tooltips[label]} />
                </>
              )}
            </span>
            <span className={styles.chartTrack}>
              <span
                className={styles.chartBar}
                style={{ width: `${Math.min(value, 1) * 100}%` }}
              />
            </span>
            <span className={styles.chartValue}>{valueFormat(value)}</span>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          className={styles.moreFactorsBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `나머지 ${hidden}개 더 보기`}
        </button>
      )}
    </>
  );
}
