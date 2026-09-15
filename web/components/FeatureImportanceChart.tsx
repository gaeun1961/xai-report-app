import type { ShapReport } from "@/lib/types";
import PercentBarChart from "./PercentBarChart";

type Props = {
  items: ShapReport["featureImportance"];
  domain: string;
  collapsedCount?: number;
  tooltips?: Record<string, string>;
};

export default function FeatureImportanceChart({
  items,
  domain,
  collapsedCount,
  tooltips,
}: Props) {
  return (
    <PercentBarChart
      items={items.map((f) => ({ label: f.feature, value: f.importance }))}
      domain={domain}
      collapsedCount={collapsedCount}
      tooltips={tooltips}
    />
  );
}
