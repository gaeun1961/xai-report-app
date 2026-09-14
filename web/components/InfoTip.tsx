"use client";

import { useRef, useState } from "react";
import styles from "./report.module.css";

type Props = {
  text: string;
};

// Break into short lines instead of one long wrapped paragraph: a new line
// after every "-요." (or parenthesised "-요.)") sentence ending, and another
// right before a "-"/"—" aside dash.
function splitLines(text: string): string[] {
  return text
    .split(/(?<=요\.\))\s*|(?<=요\.)(?!\))\s*|\s+(?=[-—])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// how close to the top of the viewport the icon can be before the bubble
// (which opens upward by default) would get clipped by the window edge
const FLIP_THRESHOLD = 200;
// keep in sync with .infoTipBubble's max-width formula (min(420px, 85vw))
const MAX_BUBBLE_WIDTH = 420;
const BUBBLE_WIDTH_VW = 0.85;
const EDGE_MARGIN = 8;

// Small circular "?" next to a section heading — same CSS-only tooltip
// mechanism as GlossaryTerm (hover, and tap/keyboard focus for mobile).
// Visibility stays CSS-driven (:hover/:focus-within); JS only decides
// placement right as the hover/focus starts, so there's no flicker.
export default function InfoTip({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);
  // horizontal offset of the bubble's left edge from the icon's own left
  // edge (px) — computed fresh each time so it's clamped to the actual
  // viewport width instead of just flipping between two fixed alignments,
  // which can still overflow when the bubble is nearly as wide as a narrow
  // (mobile) viewport
  const [offsetX, setOffsetX] = useState(0);

  function updatePlacement() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setBelow(rect.top < FLIP_THRESHOLD);

    const bubbleWidth = Math.min(MAX_BUBBLE_WIDTH, window.innerWidth * BUBBLE_WIDTH_VW);
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
        className={`${styles.infoTipBubble} ${below ? styles.infoTipBubbleBelow : ""}`}
        style={{ left: offsetX, right: "auto" }}
        role="tooltip"
      >
        {splitLines(text).map((line, i) => (
          <span key={i} className={styles.infoTipLine}>
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
