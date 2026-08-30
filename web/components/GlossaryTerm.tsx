import styles from "./report.module.css";

type Props = {
  term: string;
  desc?: string;
  className?: string;
};

// Dotted-underline term with a CSS-only tooltip bubble. Shows on hover and on
// keyboard/tap focus (tabIndex), so it works on touch too. No JS, no deps.
// When `desc` is missing (uploaded CSV), renders plain text.
export default function GlossaryTerm({ term, desc, className = "" }: Props) {
  if (!desc) return <span className={className}>{term}</span>;
  return (
    <span className={`${styles.glossary} ${className}`} tabIndex={0}>
      {term}
      <span className={styles.glossaryBubble} role="tooltip">
        {desc}
      </span>
    </span>
  );
}
