import Link from "next/link";
import styles from "./report.module.css";

type Props = {
  href: string;
  title: string;
  description: string;
  accuracy: number;
};

export default function DomainCard({ href, title, description, accuracy }: Props) {
  return (
    <Link href={href} className={styles.domainCard}>
      <h3 className={styles.domainTitle}>{title}</h3>
      <p className={styles.domainDesc}>{description}</p>
      <span className={styles.domainAcc}>정확도 {(accuracy * 100).toFixed(1)}%</span>
    </Link>
  );
}
