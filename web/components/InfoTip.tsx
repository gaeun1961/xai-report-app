import styles from "./report.module.css";

type Props = {
  text: string;
};

// Break into short lines instead of one long wrapped paragraph: a new line
// after every "-요." sentence ending, and another right before a "-"/"—"
// aside dash.
function splitLines(text: string): string[] {
  return text
    .split(/(?<=요\.)\s*|\s+(?=[-—])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Small circular "?" next to a section heading — same CSS-only tooltip
// mechanism as GlossaryTerm (hover, and tap/keyboard focus for mobile).
export default function InfoTip({ text }: Props) {
  return (
    <span
      className={`${styles.infoTip} ${styles.tooltipHost}`}
      tabIndex={0}
      role="button"
      aria-label={text}
    >
      ?
      <span className={styles.infoTipBubble} role="tooltip">
        {splitLines(text).map((line, i) => (
          <span key={i} className={styles.infoTipLine}>
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
