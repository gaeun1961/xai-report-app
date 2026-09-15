"use client";

import { useRef, useState } from "react";
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

// keep in sync with .infoTipBubble's max-width formula (min(420px, 85vw))
const MAX_BUBBLE_WIDTH = 420;
const BUBBLE_WIDTH_VW = 0.85;
const EDGE_MARGIN = 8;
const GAP = 10; // matches the CSS gap between icon and bubble

// Small circular "?" next to a section heading — same CSS-only tooltip
// mechanism as GlossaryTerm (hover, and tap/keyboard focus for mobile).
// Visibility stays CSS-driven (:hover/:focus-within); JS only decides
// placement right as the hover/focus starts, so there's no flicker.
export default function InfoTip({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);
  // horizontal offset of the bubble's left edge from the icon's own left
  // edge (px) — computed fresh each time so it's clamped to the actual
  // viewport width instead of just flipping between two fixed alignments,
  // which can still overflow when the bubble is nearly as wide as a narrow
  // (mobile) viewport
  const [offsetX, setOffsetX] = useState(0);

  function updatePlacement() {
    const rect = ref.current?.getBoundingClientRect();
    const bubble = bubbleRef.current;
    if (!rect || !bubble) return;

    const bubbleWidth = Math.min(MAX_BUBBLE_WIDTH, window.innerWidth * BUBBLE_WIDTH_VW);

    // the bubble is display:none until hover, and its height depends on how
    // many lines this particular text wraps into — measure the real height
    // (briefly forced visible off-eye, reset before the browser ever paints)
    // instead of guessing from the icon's position alone
    const prevDisplay = bubble.style.display;
    const prevVisibility = bubble.style.visibility;
    bubble.style.visibility = "hidden";
    bubble.style.display = "flex";
    const bubbleHeight = bubble.offsetHeight;
    bubble.style.display = prevDisplay;
    bubble.style.visibility = prevVisibility;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setBelow(bubbleHeight + GAP > spaceAbove && spaceBelow > spaceAbove);

    // default: bubble's right edge lines up with the icon's right edge
    let left = rect.right - bubbleWidth;
    left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - bubbleWidth - EDGE_MARGIN));
    setOffsetX(left - rect.left);
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
        className={`${styles.infoTipBubble} ${below ? styles.infoTipBubbleBelow : ""}`}
        style={{ left: offsetX, right: "auto" }}
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
