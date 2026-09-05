import type { ShapReport } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ColumnInfo = { name: string; uniqueCount: number };

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

export async function fetchColumns(file: File): Promise<ColumnInfo[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/columns`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return data.columns;
}

export async function analyzeCsv(
  file: File,
  targetColumn: string,
): Promise<ShapReport> {
  const form = new FormData();
  form.append("file", file);
  form.append("target_column", targetColumn);
  const res = await fetch(`${API_BASE}/analyze`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
