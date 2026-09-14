"use client";

import { Fragment, useRef, useState } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc } from "@/lib/columnGlossary";
import MissingnessDonutGrid from "./MissingnessDonutGrid";
import OutlierBoxPlot from "./OutlierBoxPlot";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

type Props = {
  data: NonNullable<ShapReport["correlations"]>;
  domain: string;
  missingness?: ShapReport["missingness"];
  outliers?: ShapReport["outliers"];
  outliersExcludedColumns?: ShapReport["outliersExcludedColumns"];
};

// ".52" / "-.31" — drop the leading zero, it's always |v| <= 1
const fmt = (v: number) =>
  v.toFixed(2).replace(/^(-?)0\./, "$1.").replace("1.00", "1");

const STRONG = 0.6;

// Domain-agnostic reading of a strong pair — no column-specific knowledge
// needed, just what the sign of r implies for using both columns in a model.
function explainCorr(v: number): string {
  return v >= 0
    ? "이 둘은 함께 오르내리는 경향이 강해요. 모델에 두 컬럼을 같이 쓰면 비슷한 정보가 중복될 수 있어요."
    : "한쪽이 오르면 다른 쪽은 내려가는 경향이 강해요. 두 컬럼이 반대 방향으로 같은 정보를 담고 있을 수 있어요.";
}

export default function CorrelationMatrix({
  data,
  domain,
  missingness,
  outliers,
  outliersExcludedColumns,
}: Props) {
  const { columns, matrix } = data;
  const n = columns.length;
  const label = (c: string) => columnDesc(domain, c) ?? c;
  const [focused, setFocused] = useState<string | null>(null);
  const [explainedPair, setExplainedPair] = useState<{ i: number; j: number; v: number } | null>(
    null,
  );
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  function focusPair(i: number, j: number, v: number) {
    const key = `${i}-${j}`;
    setFocused(key);
    setExplainedPair({ i, j, v });
    cellRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav className={styles.dataRelToc}>
        <button
          type="button"
          className={styles.dataRelTocLink}
          onClick={() => scrollToSection("dataRelCorrelation")}
        >
          상관관계
        </button>
        {!!outliers?.length && (
          <button
            type="button"
            className={styles.dataRelTocLink}
            onClick={() => scrollToSection("dataRelOutliers")}
          >
            이상치
          </button>
        )}
        {!!missingness?.length && (
          <button
            type="button"
            className={styles.dataRelTocLink}
            onClick={() => scrollToSection("dataRelMissing")}
          >
            결측치
          </button>
        )}
      </nav>

      <section id="dataRelCorrelation" className={styles.dataRelSection}>
        <h2 className={styles.h2}>
          숫자형 컬럼 관계{" "}
          <InfoTip text="두 가지 정보가 서로 관련이 있는지 보여주는 표예요. 예를 들어 키가 클수록 몸무게도 많이 나가는 경향이 있죠? 이렇게 하나가 변할 때 다른 하나도 같이 변하는 걸 '관계가 있다'고 해요. 색이 진하고 테두리가 두꺼운 칸일수록, 그 두 정보는 아주 강하게 관련되어 있다는 뜻이에요. (AI 모델이 아니라, 데이터 자체만 보고 계산한 거예요.)" />
        </h2>

        {strongPairs.length > 0 && (
          <div className={styles.corrChipRow}>
            {strongPairs.map(({ i, j, v }) => (
              <button
                key={`chip-${i}-${j}`}
                type="button"
                className={styles.corrChip}
                onClick={() => focusPair(i, j, v)}
              >
                {label(columns[i])} ↔ {label(columns[j])} · {v.toFixed(2)}
              </button>
            ))}
          </div>
        )}

        {explainedPair && (
          <p className={styles.corrExplain}>
            <b>
              {label(columns[explainedPair.i])} ↔ {label(columns[explainedPair.j])} (r=
              {explainedPair.v.toFixed(2)})
            </b>{" "}
            — {explainCorr(explainedPair.v)}
          </p>
        )}

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
                  const strong = i !== j && mag >= STRONG;
                  const key = `${i}-${j}`;
                  return (
                    <div
                      key={`cell-${i}-${j}`}
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el);
                      }}
                      className={`${styles.corrCell} ${
                        strong
                          ? v >= 0
                            ? styles.corrCellStrongPos
                            : styles.corrCellStrongNeg
                          : ""
                      } ${focused === key ? styles.corrCellFocused : ""}`}
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

      {!!outliers?.length && (
        <section id="dataRelOutliers" className={styles.dataRelSection}>
          <h2 className={styles.h2}>
            이상치{" "}
            <InfoTip text="반 친구들의 키를 한 줄로 세운다고 생각해보세요. 대부분은 비슷비슷한 키에 모여있지만, 어쩌다 한두 명은 유난히 크거나 작을 수 있어요. 이렇게 '대부분과 아주 다른 값'을 이상치라고 불러요. 이 그림에서 상자는 친구들이 옹기종기 모여있는 가운데 구간(전체의 중간 50%)을 보여주고, 가운데 세로선은 딱 중간값이에요. 점으로 찍힌 건 그 무리에서 크게 벗어난 이상치예요." />
          </h2>
          {!!outliersExcludedColumns?.length && (
            <p className={styles.sectionNote}>
              값 종류가 2개뿐인 컬럼은 분포를 보여줄 게 없어서 뺐어요:{" "}
              {outliersExcludedColumns.map(label).join(", ")}
            </p>
          )}
          <OutlierBoxPlot items={outliers} domain={domain} />
        </section>
      )}

      {!!missingness?.length && (
        <section id="dataRelMissing" className={styles.dataRelSection}>
          <h2 className={styles.h2}>
            결측치{" "}
            <InfoTip text="데이터에서 빈칸으로 남아있는 부분이에요. 예를 들어 설문지에서 어떤 사람이 나이를 안 적고 냈다면, 그 사람의 나이 칸은 '결측치'가 돼요. AI는 이런 빈칸을 그냥 두지 않고, 숫자 칸이면 다른 사람들의 중간값으로, 글자 칸이면 &quot;결측&quot;이라는 단어로 채워 넣은 다음 학습했어요." />
          </h2>
          {missingness.every((m) => m.missingCount === 0) ? (
            <p className={styles.sectionNote}>이 데이터셋엔 결측치가 없어요 ✓</p>
          ) : (
            <MissingnessDonutGrid
              items={missingness.map((m) => ({
                label: m.column,
                value: m.missingPct,
              }))}
              domain={domain}
            />
          )}
        </section>
      )}
    </>
  );
}
