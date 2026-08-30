import { Fragment } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import styles from "./report.module.css";

type Props = {
  data: NonNullable<ShapReport["correlations"]>;
  domain: string;
};

// ".52" / "-.31" — drop the leading zero, it's always |v| <= 1
const fmt = (v: number) =>
  v.toFixed(2).replace(/^(-?)0\./, "$1.").replace("1.00", "1");

export default function CorrelationMatrix({ data, domain }: Props) {
  const { columns, matrix } = data;
  const n = columns.length;

  return (
    <section className={styles.section}>
      <p className={styles.guide}>
        모델과는 무관하게, 데이터 안에서 두 컬럼이 얼마나 같이 움직이는지
        보여줘요.
        <br />초록이 진할수록 같은 방향으로(양의 상관), 주황이 진할수록 반대
        방향으로(음의 상관) 움직입니다.
      </p>

      <div className={styles.corrWrap}>
        <div
          className={styles.corrGrid}
          style={{
            gridTemplateColumns: `minmax(96px, auto) repeat(${n}, minmax(40px, 1fr))`,
          }}
        >
          <div className={styles.corrCorner} />
          {columns.map((c) => (
            <div
              key={`h-${c}`}
              className={styles.corrColHead}
              title={columnDesc(domain, c) ?? c}
            >
              <span>{c}</span>
            </div>
          ))}

          {matrix.map((row, i) => (
            <Fragment key={`row-${i}`}>
              <div
                className={styles.corrRowHead}
                title={columnDesc(domain, columns[i]) ?? columns[i]}
              >
                {columns[i]}
              </div>
              {row.map((v, j) => {
                const mag = Math.min(1, Math.abs(v));
                const pct = Math.round(mag * 85);
                const bg =
                  i === j
                    ? "var(--border)"
                    : v >= 0
                      ? `color-mix(in srgb, var(--accent) ${pct}%, transparent)`
                      : `color-mix(in srgb, #b45309 ${pct}%, transparent)`;
                return (
                  <div
                    key={`cell-${i}-${j}`}
                    className={styles.corrCell}
                    style={{ background: bg, color: mag > 0.5 ? "#fff" : undefined }}
                    title={`${columns[i]} ↔ ${columns[j]}: ${v.toFixed(2)}`}
                  >
                    {i === j ? "" : fmt(v)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
