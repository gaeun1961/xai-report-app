import type { ShapReport } from "./types";
import titanic from "@/public/data/titanic.json";
import hrAttrition from "@/public/data/hr_attrition.json";
import telcoChurn from "@/public/data/telco_churn.json";

// ponytail: 정적 import. 없는 도메인은 null → 페이지에서 빈 상태 처리.
const reports: Record<string, ShapReport> = {
  titanic: titanic as ShapReport,
  hr_attrition: hrAttrition as ShapReport,
  telco_churn: telcoChurn as ShapReport,
};

export function loadReport(domain: string): ShapReport | null {
  return reports[domain] ?? null;
}
