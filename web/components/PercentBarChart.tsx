"use client";

import { useEffect, useState } from "react";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import { getFeatureDesc, setFeatureDesc } from "@/lib/featureDescs";
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

// One row's column name + its hover description. The pencil edits the
// DESCRIPTION (the tooltip text), not the column name — per-browser override
// via lib/featureDescs.ts; an edited description is the user's own, so it
// drops the "AI 추정" marker. Starts un-overridden on server and first client
// render (avoids a hydration mismatch), then loads from localStorage.
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
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setOverride(getFeatureDesc(domain, column));
  }, [domain, column]);

  const shownDesc = override ?? desc;

  // blur fires even with no edit made — only persist on an actual change
  function save() {
    if (draft.trim() !== (shownDesc ?? "").trim()) {
      setFeatureDesc(domain, column, draft);
      setOverride(draft.trim() || undefined);
    }
    setEditing(false);
  }

  // editing happens INSIDE the tooltip bubble (forced open) instead of
  // swapping the row for an input — the text just becomes editable in place
  if (editing) {
    return (
      <span className={`${styles.glossary} ${styles.tooltipHost}`}>
        {column}
        <span className={`${styles.glossaryBubble} ${styles.glossaryBubbleEditing}`} role="tooltip">
          <textarea
            className={styles.glossaryEditor}
            value={draft}
            autoFocus
            rows={3}
            maxLength={100}
            placeholder={`${column} 설명 (Enter 저장, Esc 취소)`}
            aria-label={`${column} 설명 수정`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
        </span>
      </span>
    );
  }

  return (
    <span className={styles.caseId}>
      <GlossaryTerm term={column} desc={shownDesc} suggested={override ? false : suggested} />
      <button
        type="button"
        className={styles.caseNameEditBtn}
        aria-label={`${column} 설명 수정`}
        onClick={() => {
          setDraft(shownDesc ?? "");
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
