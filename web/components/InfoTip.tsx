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

// Small circular "?" next to a section heading — same CSS-only tooltip
// mechanism as GlossaryTerm (hover, and tap/keyboard focus for mobile).
// Visibility stays CSS-driven (:hover/:focus-within); JS only decides
// above-vs-below placement right as the hover/focus starts, so there's no
// flicker.
export default function InfoTip({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  function updatePlacement() {
    const top = ref.current?.getBoundingClientRect().top;
    if (top !== undefined) setBelow(top < FLIP_THRESHOLD);
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
