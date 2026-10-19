"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import type { ShapReport } from "@/lib/types";
import { columnDesc, isSuggestedDesc } from "@/lib/columnGlossary";
import MissingnessDonutGrid from "./MissingnessDonutGrid";
import OutlierBoxPlot from "./OutlierBoxPlot";
import InfoTip from "./InfoTip";
import GlossaryTerm from "./GlossaryTerm";
import styles from "./report.module.css";

type Props = {
  data: NonNullable<ShapReport["correlations"]>;
  domain: string;
  missingness?: ShapReport["missingness"];
  suspectZeros?: ShapReport["suspectZeros"];
  outliers?: ShapReport["outliers"];
  outliersExcludedColumns?: ShapReport["outliersExcludedColumns"];
  // rendered at the right end of the sticky section-nav row (the tab's
  // "이미지로 저장" button), so both sit on one line
  toolbarEnd?: ReactNode;
  // per-column distribution cards (its own section, first in the nav)
  distributions?: ReactNode;
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
  suspectZeros,
  outliers,
  outliersExcludedColumns,
  toolbarEnd,
  distributions,
}: Props) {
  const { columns, matrix } = data;
  const n = columns.length;
  const label = (c: string) => columnDesc(domain, c) ?? c;
  // chips read by description, the table by raw column name - showing both
  // ("s1 총 콜레스테롤 수치") lets a reader match one to the other
  const chipName = (c: string) => {
    const desc = columnDesc(domain, c);
    return desc && desc !== c ? `${c} ${desc}` : c;
  };
  // the chip pair currently highlighted in the table (null = none)
  const [selected, setSelected] = useState<{ i: number; j: number; v: number } | null>(null);
  const inPair = (i: number, j: number) =>
    !!selected &&
    ((i === selected.i && j === selected.j) || (i === selected.j && j === selected.i));
  const isPairAxis = (k: number) => !!selected && (k === selected.i || k === selected.j);
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

  // clicking the selected chip again clears the highlight
  function focusPair(i: number, j: number, v: number) {
    if (selected?.i === i && selected?.j === j) {
      setSelected(null);
      return;
    }
    const key = `${i}-${j}`;
    setSelected({ i, j, v });
    cellRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav className={styles.dataRelToc} data-no-capture>
        {distributions && (
          <button
            type="button"
            className={styles.dataRelTocLink}
            onClick={() => scrollToSection("dataRelDist")}
          >
            분포
          </button>
        )}
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
        {toolbarEnd && <div className={styles.dataRelTocEnd}>{toolbarEnd}</div>}
      </nav>

      {distributions && (
        <section id="dataRelDist" className={styles.cardSection}>
          <h2 className={styles.h2}>
            컬럼별 분포{" "}
            <InfoTip text="각 컬럼의 값이 어떻게 퍼져 있는지 보여줘요. **숫자형은 구간별 개수(히스토그램), 글자형은 값별 개수**예요. 분류 데이터면 막대를 결과별 색으로 나눠 쌓아서, 어떤 구간에 어떤 결과가 몰려 있는지도 볼 수 있어요. (모델이 아니라 업로드한 데이터 전체를 그대로 센 거예요.)" />
          </h2>
          {distributions}
        </section>
      )}

      <section id="dataRelCorrelation" className={styles.cardSection}>
        <h2 className={styles.h2}>
          숫자형 컬럼 관계{" "}
          <InfoTip text="두 가지 정보가 서로 관련이 있는지 보여주는 표예요. 예를 들어 키가 클수록 몸무게도 많이 나가는 경향이 있죠? 이렇게 하나가 변할 때 다른 하나도 같이 변하는 걸 **'관계가 있다'**고 해요. **색이 진하고 테두리가 두꺼운 칸일수록, 그 두 정보는 아주 강하게 관련**되어 있다는 뜻이에요. (AI 모델이 아니라, 데이터 자체만 보고 계산한 거예요.)" />
        </h2>

        {strongPairs.length > 0 && (
          <div className={styles.corrChipRow}>
            {strongPairs.map(({ i, j, v }) => (
              <button
                key={`chip-${i}-${j}`}
                type="button"
                className={`${styles.corrChip} ${
                  selected?.i === i && selected?.j === j ? styles.corrChipActive : ""
                }`}
                aria-pressed={selected?.i === i && selected?.j === j}
                onClick={() => focusPair(i, j, v)}
              >
                {chipName(columns[i])} ↔ {chipName(columns[j])} · {v.toFixed(2)}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <p className={styles.corrExplain}>
            <b>
              {chipName(columns[selected.i])} ↔ {chipName(columns[selected.j])} (r=
              {selected.v.toFixed(2)})
            </b>{" "}
            — {explainCorr(selected.v)}
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
            {columns.map((c, k) => (
              <div
                key={`h-${c}`}
                className={`${styles.corrColHead} ${isPairAxis(k) ? styles.corrHeadActive : ""}`}
              >
                <GlossaryTerm
                  term={c}
                  desc={columnDesc(domain, c)}
                  suggested={isSuggestedDesc(domain, c)}
                />
              </div>
            ))}

            {matrix.map((row, i) => (
              <Fragment key={`row-${i}`}>
                <div
                  className={`${styles.corrRowHead} ${isPairAxis(i) ? styles.corrHeadActive : ""}`}
                >
                  <GlossaryTerm
                    term={columns[i]}
                    desc={columnDesc(domain, columns[i])}
                    suggested={isSuggestedDesc(domain, columns[i])}
                  />
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
                      } ${
                        selected
                          ? inPair(i, j)
                            ? styles.corrCellFocused
                            : styles.corrCellDim
                          : ""
                      }`}
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
        <section id="dataRelOutliers" className={styles.cardSection}>
          <h2 className={styles.h2}>
            이상치{" "}
            <InfoTip text="반 친구들의 키를 한 줄로 세운다고 생각해보세요. 대부분은 비슷비슷한 키에 모여있지만, 어쩌다 한두 명은 유난히 크거나 작을 수 있어요. 이렇게 **'대부분과 아주 다른 값'을 이상치**라고 불러요. 이 그림에서 상자는 친구들이 옹기종기 모여있는 가운데 구간(전체의 중간 50%)을 보여주고, 가운데 세로선은 딱 중간값이에요. **점으로 찍힌 건 그 무리에서 크게 벗어난 이상치**예요. **맨 오른쪽 숫자는 그 컬럼의 전체 값 중에서 이상치가 차지하는 비율**이에요 — 높을수록 유난히 튀는 값이 많다는 뜻이에요." />
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
        <section id="dataRelMissing" className={styles.cardSection}>
          <h2 className={styles.h2}>
            결측치{" "}
            <InfoTip text="**데이터에서 빈칸으로 남아있는 부분**이에요. 예를 들어 설문지에서 어떤 사람이 나이를 안 적고 냈다면, 그 사람의 나이 칸은 '결측치'가 돼요. AI는 이런 빈칸을 그냥 두지 않고, **숫자 칸이면 다른 사람들의 중간값으로, 글자 칸이면 &quot;결측&quot;이라는 단어로 채워** 넣은 다음 학습했어요." />
          </h2>
          {missingness.every((m) => m.missingCount === 0) ? (
            <p className={styles.sectionNote}>
              {suspectZeros?.length
                ? "빈칸으로 남은 결측치는 없어요. 다만 아래처럼 0으로 적힌 숨은 결측이 의심되는 컬럼이 있어요."
                : "이 데이터셋엔 결측치가 없어요 ✓"}
            </p>
          ) : (
            <MissingnessDonutGrid
              items={missingness.map((m) => ({
                label: m.column,
                value: m.missingPct,
                count: m.missingCount,
              }))}
              domain={domain}
            />
          )}
          {!!suspectZeros?.length && (
            <>
              <h3 className={styles.h2}>
                숨은 결측 의심{" "}
                <InfoTip text="**빈칸은 아닌데, 0으로 적혀 있는 값**이에요. 예를 들어 콜레스테롤이 0인 사람은 없으니, 측정을 안 해서 0으로 적어둔 걸 수 있어요. 이런 0은 빈칸이 아니라서 위 결측치에는 안 잡혀요. 그 컬럼의 나머지 값들보다 0이 유난히 낮을 때만 표시하고, **AI는 이 0을 진짜 값으로 보고 학습했어요.** (확정이 아니라 의심이에요. 0이 실제로 맞는 값일 수도 있어요.)" />
              </h3>
              {suspectZeros.map((z) => (
                <p key={z.column} className={styles.corrExplain}>
                  <GlossaryTerm
                    term={z.column}
                    desc={columnDesc(domain, z.column)}
                    suggested={isSuggestedDesc(domain, z.column)}
                  />
                  : 다른 값은 대부분 {Math.round(z.lowerFence).toLocaleString()} 이상인데 0이{" "}
                  <b>{z.zeroCount.toLocaleString()}개</b> ({(z.zeroPct * 100).toFixed(1)}%)
                  있어요.
                </p>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
