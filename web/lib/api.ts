import type { ShapReport } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ColumnInfo = { name: string; uniqueCount: number };
export type CaseFocus = "balanced" | "wrong" | "borderline";

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data.detail === "string"
      ? data.detail
      : "분석 중 문제가 발생했어요.";
  } catch {
    return "분석 중 문제가 발생했어요.";
  }
}

export async function fetchColumns(
  file: File,
): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/columns`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function analyzeCsv(
  file: File,
  targetColumn: string,
  nCases: number = 30,
  caseFocus: CaseFocus = "balanced",
): Promise<ShapReport> {
  const form = new FormData();
  form.append("file", file);
  form.append("target_column", targetColumn);
  form.append("n_cases", String(nCases));
  form.append("case_focus", caseFocus);
  const res = await fetch(`${API_BASE}/analyze`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export type WhatIfResult = {
  predictedPositive: boolean;
  probaPositive: number;
  prediction: string;
  predictionDisplay: string;
  topFeatures: { feature: string; value: string | number | null; contribution: number }[];
};

export async function whatIf(
  analysisId: string,
  row: Record<string, unknown>,
): Promise<WhatIfResult> {
  const res = await fetch(`${API_BASE}/whatif`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_id: analysisId, row }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
