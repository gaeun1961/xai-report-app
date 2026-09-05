import type { ShapReport } from "@/lib/types";
import PercentBarChart from "./PercentBarChart";

type Props = {
  items: ShapReport["featureImportance"];
  domain: string;
  collapsedCount?: number;
};

export default function FeatureImportanceChart({
  items,
  domain,
  collapsedCount,
}: Props) {
  return (
    <PercentBarChart
      items={items.map((f) => ({ label: f.feature, value: f.importance }))}
      domain={domain}
      collapsedCount={collapsedCount}
    />
  );
}
