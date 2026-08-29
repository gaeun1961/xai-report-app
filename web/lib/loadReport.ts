import type { ShapReport } from "./types";
import titanic from "@/public/data/titanic.json";

// ponytail: 도메인이 titanic 하나뿐이라 정적 import. 도메인 늘면 fetch/fs로 전환
const reports: Record<string, ShapReport> = {
  titanic: titanic as ShapReport,
};

export function loadReport(domain: string): ShapReport {
  const report = reports[domain];
  if (!report) throw new Error(`Unknown report domain: ${domain}`);
  return report;
}
