import type { ShapReport } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ColumnInfo = { name: string; uniqueCount: number; isNumeric?: boolean };
export type TaskType = "classification" | "regression";

// Mirrors the backend's gate (routers/analyze.py MIN_REGRESSION_UNIQUE): a
// numeric column needs this many distinct values to be a sane regression
// target, otherwise it's really a coded category.
export const MIN_REGRESSION_UNIQUE = 10;

// What a column can be analyzed as. Classification wants exactly 2 values;
// regression wants a numeric column with enough distinct values.
export function suggestedTask(col: ColumnInfo): TaskType | null {
  if (col.uniqueCount === 2) return "classification";
  if (col.isNumeric && col.uniqueCount >= MIN_REGRESSION_UNIQUE) return "regression";
  return null;
}

export function taskProblem(col: ColumnInfo, task: TaskType): string | null {
  if (task === "classification") {
    return col.uniqueCount === 2
      ? null
      : `고유값이 ${col.uniqueCount}개라 분류 타겟으로 쓸 수 없어요 (정확히 2개여야 해요).`;
  }
  if (!col.isNumeric) return "숫자형 컬럼이 아니라 회귀 타겟으로 쓸 수 없어요.";
  return col.uniqueCount >= MIN_REGRESSION_UNIQUE
    ? null
    : `고유값이 ${col.uniqueCount}개뿐이라 회귀 타겟으로 보기 어려워요 (최소 ${MIN_REGRESSION_UNIQUE}개).`;
}
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
  taskType: TaskType = "classification",
): Promise<ShapReport> {
  const form = new FormData();
  form.append("file", file);
  form.append("target_column", targetColumn);
  form.append("n_cases", String(nCases));
  form.append("case_focus", caseFocus);
  form.append("task_type", taskType);
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

export type ModelTypeSpec = {
  label: string;
  params: Record<string, { type: "int" | "float"; min: number; max: number }>;
};

export async function fetchModelTypes(): Promise<Record<string, ModelTypeSpec>> {
  const res = await fetch(`${API_BASE}/model-types`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function retrain(
  analysisId: string,
  modelType: string,
  params: Record<string, number>,
): Promise<ShapReport> {
  const res = await fetch(`${API_BASE}/retrain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_id: analysisId, model_type: modelType, params }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
