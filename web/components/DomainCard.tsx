import Link from "next/link";
import styles from "./report.module.css";

type Props = {
  href: string;
  title: string;
  description: string;
  accuracy?: number;
  verdict?: "good" | "weak";
};

export default function DomainCard({
  href,
  title,
  description,
  accuracy,
  verdict,
}: Props) {
  return (
    <Link href={href} className={styles.domainCard}>
      <div className={styles.domainCardTop}>
        <h3 className={styles.domainTitle}>{title}</h3>
        {verdict && (
          <span
            className={`${styles.qualityBadge} ${
              verdict === "good" ? styles.qualityGood : styles.qualityWeak
            }`}
          >
            {verdict === "good" ? "양호" : "주의"}
          </span>
        )}
      </div>

      <p className={styles.domainDesc}>{description}</p>

      <div className={styles.domainAccBlock}>
        {accuracy === undefined ? (
          <span className={styles.domainAccPending}>리포트 준비 중</span>
        ) : (
          <>
            <span className={styles.domainAccNum}>
              {(accuracy * 100).toFixed(1)}%
            </span>
            <span className={styles.domainAccLabel}>정확도</span>
          </>
        )}
      </div>
    </Link>
  );
}
