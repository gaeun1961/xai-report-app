"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchModelTypes, retrain, type ModelTypeSpec } from "@/lib/api";
import { saveUploadReport } from "@/lib/uploadHistory";
import InfoTip from "./InfoTip";
import styles from "./report.module.css";

type Props = {
  analysisId: string;
  reportId: string;
  reportLabel: string;
};

// midpoint of a whitelisted param's [min, max] as a reasonable starting
// value - generic (no per-model hardcoding), the user can still change it
function midpoint(spec: ModelTypeSpec): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [key, { type, min, max }] of Object.entries(spec.params)) {
    const mid = (min + max) / 2;
    values[key] = type === "int" ? Math.round(mid) : Math.round(mid * 100) / 100;
  }
  return values;
}

export default function ModelComparePanel({ analysisId, reportId, reportLabel }: Props) {
  const router = useRouter();
  const [types, setTypes] = useState<Record<string, ModelTypeSpec> | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModelTypes()
      .then((t) => {
        setTypes(t);
        const first = Object.keys(t)[0];
        if (first) {
          setSelected(first);
          setParams(midpoint(t[first]));
        }
      })
      .catch(() => setError("사용 가능한 모델 목록을 불러오지 못했어요."));
  }, []);

  // still loading (both null) - render nothing rather than a half section.
  // A load failure sets error while types stays null, so that case falls
  // through to the section below instead of silently vanishing.
  if (!types && !error) return null;

  const spec = types?.[selected];

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const newReport = await retrain(analysisId, selected, params);
      const newId = saveUploadReport(
        newReport,
        `${reportLabel} (${newReport.modelLabel ?? selected})`,
      );
      router.push(`/my/compare?a=${reportId}&b=${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "재학습 중 문제가 발생했어요.");
      setLoading(false);
    }
  }

  return (
    <section className={styles.cardSection}>
      <h2 className={styles.h2}>
        다른 모델로 비교해보기{" "}
        <InfoTip text="같은 데이터를 다른 트리 기반 알고리즘으로 다시 학습시켜서, baseline과 정확도·판단 근거를 나란히 비교해요. 새 CSV를 올릴 필요 없이 지금 이 분석 데이터를 그대로 재사용해요." />
      </h2>

      {types && (
        <>
          <div className={styles.whatIfGrid}>
            <label className={styles.whatIfField}>
              모델 종류
              <select
                className={styles.whatIfInput}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setParams(midpoint(types[e.target.value]));
                }}
              >
                {Object.entries(types).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {spec &&
              Object.entries(spec.params).map(([key, { type, min, max }]) => (
                <label key={key} className={styles.whatIfField}>
                  {key} ({min}~{max})
                  <input
                    type="number"
                    className={styles.whatIfInput}
                    value={params[key] ?? ""}
                    step={type === "int" ? 1 : 0.01}
                    min={min}
                    max={max}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
          </div>

          <button type="button" className={styles.toggleBtn} onClick={run} disabled={loading}>
            {loading ? "재학습하는 중... (최대 1분 정도 걸릴 수 있어요)" : "비교하기"}
          </button>
        </>
      )}

      {error && <p className={styles.sectionNote}>{error}</p>}
    </section>
  );
}
