import styles from "./report.module.css";

type Props = {
  text: string;
};

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
      <span className={styles.glossaryBubble} role="tooltip">
        {text}
      </span>
    </span>
  );
}
