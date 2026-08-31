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

const STRONG = 0.6;

// 와/과 by whether the word's last Hangul char has a final consonant (받침)
const wa = (word: string) => {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return "와"; // not Hangul → default
  return (ch - 0xac00) % 28 === 0 ? "와" : "과";
};

export default function CorrelationMatrix({ data, domain }: Props) {
  const { columns, matrix } = data;
  const n = columns.length;
  const label = (c: string) => columnDesc(domain, c) ?? c;

  // strong pairs (upper triangle), strongest first, capped
  const strongPairs = matrix
    .flatMap((row, i) =>
      row
        .slice(i + 1)
        .map((v, k) => ({ i, j: i + 1 + k, v }))
        .filter((p) => Math.abs(p.v) >= STRONG),
    )
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 5);

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

      {strongPairs.length > 0 ? (
        <ul className={styles.corrNotes}>
          {strongPairs.map(({ i, j, v }) => {
            const a = label(columns[i]);
            const b = label(columns[j]);
            return (
              <li key={`n-${i}-${j}`}>
                <b>{a}</b>
                {wa(a)} <b>{b}</b>는 상관계수 {v.toFixed(2)}로{" "}
                {Math.abs(v) >= 0.8 ? "매우 강하게" : "강하게"}{" "}
                {v >= 0 ? "같은 방향으로 움직여요" : "반대 방향으로 움직여요"}.
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.corrNotesEmpty}>
          이 데이터엔 특별히 강하게 얽힌 컬럼 쌍은 없어요 (모두 상관계수 절댓값
          0.6 미만).
        </p>
      )}
    </section>
  );
}
