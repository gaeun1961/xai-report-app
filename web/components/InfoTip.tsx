"use client";

import { useRef } from "react";
import { trackBubble } from "@/lib/tooltipPlacement";
import styles from "./report.module.css";

type Props = {
  text: string;
};

// Break into short lines instead of one long wrapped paragraph: a new line
// after every "-요." (or parenthesised "-요.)") sentence ending, another
// right before a "-"/"—" aside dash, and wherever a caller puts an explicit
// "\n" (e.g. to set a trailing "(상관계수 n)" note on its own line).
function splitLines(text: string): string[] {
  return text
    .split(/(?<=요\.\))\s*|(?<=요\.)(?!\))\s*|\s+(?=[-—])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// **bold** markers inside a line become <strong> — lets each call site mark
// the one clause per sentence that's worth skimming for.
function renderWithBold(line: string) {
  return line
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// Small circular "?" next to a section heading — same CSS-only tooltip
// mechanism as GlossaryTerm (hover, and tap/keyboard focus for mobile).
// Visibility stays CSS-driven (:hover/:focus-within); JS only places the
// bubble (lib/tooltipPlacement: right, else left, else above/below, always
// on screen) right as the hover/focus starts, so there's no flicker.
export default function InfoTip({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  function updatePlacement() {
    if (ref.current && bubbleRef.current) trackBubble(ref.current, bubbleRef.current, "flex");
  }

  return (
    <span
      ref={ref}
      className={`${styles.infoTip} ${styles.tooltipHost}`}
      tabIndex={0}
      role="button"
      aria-label={text}
      onMouseEnter={updatePlacement}
      onFocus={updatePlacement}
    >
      ?
      <span
        ref={bubbleRef}
        className={`${styles.bubble} ${styles.infoTipBubble}`}
        role="tooltip"
      >
        {splitLines(text).map((line, i) => (
          <span key={i} className={styles.infoTipLine}>
            {renderWithBold(line)}
          </span>
        ))}
      </span>
    </span>
  );
}
