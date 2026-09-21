import styles from "./report.module.css";

type Props = {
  term: string;
  desc?: string;
  suggested?: boolean;
  className?: string;
};

// Dotted-underline term with a CSS-only tooltip bubble. Shows on hover and on
// keyboard/tap focus (tabIndex), so it works on touch too. No JS, no deps.
// When `desc` is missing (uploaded CSV with no AI guess either), renders
// plain text. `suggested` marks a desc as the backend's AI guess (uploads
// only) rather than this app's curated preset text — shown inside the
// bubble itself so the always-visible term/underline stays uncluttered.
export default function GlossaryTerm({ term, desc, suggested, className = "" }: Props) {
  if (!desc) return <span className={className}>{term}</span>;
  return (
    <span className={`${styles.glossary} ${styles.tooltipHost} ${className}`} tabIndex={0}>
      {term}
      <span className={styles.glossaryBubble} role="tooltip">
        {suggested && <em className={styles.soon}>AI 추정</em>} {desc}
      </span>
    </span>
  );
}
