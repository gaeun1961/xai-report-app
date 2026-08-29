import type { ShapReport } from "./types";
import titanic from "@/public/data/titanic.json";
import hrAttrition from "@/public/data/hr_attrition.json";

// ponytail: 정적 import. telco_churn.json은 아직 없어서 등록 안 함 —
// 생성되면 import 한 줄 추가. 없는 도메인은 null → 페이지에서 빈 상태 처리.
const reports: Record<string, ShapReport> = {
  titanic: titanic as ShapReport,
  hr_attrition: hrAttrition as ShapReport,
};

export function loadReport(domain: string): ShapReport | null {
  return reports[domain] ?? null;
}
