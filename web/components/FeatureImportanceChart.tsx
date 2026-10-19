import type { ShapReport } from "@/lib/types";
import { fmtNum } from "@/lib/reportSummary";
import PercentBarChart from "./PercentBarChart";

type Props = {
  items: ShapReport["featureImportance"];
  domain: string;
  collapsedCount?: number;
  tooltips?: Record<string, string>;
  // regression importance is mean|SHAP| in the target's own units (29.0,
  // 24.0, ...), not a 0-1 probability, so it can't go on the fixed 0-100%
  // axis as-is
  regression?: boolean;
};

export default function FeatureImportanceChart({
  items,
  domain,
  collapsedCount,
  tooltips,
  regression,
}: Props) {
  if (regression) {
    // bar = share of the total (value / sum), still on the fixed 0-100% axis -
    // not relative-to-max, which made small values look full before
    const total = items.reduce((s, f) => s + f.importance, 0) || 1;
    const raw = new Map(items.map((f) => [f.feature, f.importance]));
    return (
      <PercentBarChart
        items={items.map((f) => ({ label: f.feature, value: f.importance / total }))}
        domain={domain}
        collapsedCount={collapsedCount}
        tooltips={tooltips}
        valueFormat={(v) => `${(v * 100).toFixed(1)}%`}
        subValue={(label) => {
          const v = fmtNum(raw.get(label) ?? 0);
          return { text: `±${v}`, title: `예측값을 평균 ±${v}만큼 움직였어요` };
        }}
      />
    );
  }
  return (
    <PercentBarChart
      items={items.map((f) => ({ label: f.feature, value: f.importance }))}
      domain={domain}
      collapsedCount={collapsedCount}
      tooltips={tooltips}
    />
  );
}
