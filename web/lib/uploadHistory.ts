import type { ShapReport } from "./types";

// Per-browser only (localStorage) — no login/backend yet, so a saved upload
// report never leaves the device it was analyzed on. Capped list length so
// storage doesn't grow unbounded; oldest entries (and their report blobs)
// are evicted first.
const HISTORY_KEY = "xai-upload-history";
const REPORT_PREFIX = "xai-upload-report:";
const MAX_HISTORY = 20;

export type UploadHistoryEntry = {
  id: string;
  domain: string;
  fileName: string;
  savedAt: number;
};

function readHistory(): UploadHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as UploadHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function listUploadHistory(): UploadHistoryEntry[] {
  return readHistory();
}

export function loadUploadReport(id: string): ShapReport | null {
  try {
    const raw = localStorage.getItem(REPORT_PREFIX + id);
    return raw ? (JSON.parse(raw) as ShapReport) : null;
  } catch {
    return null;
  }
}

export function saveUploadReport(report: ShapReport, fileName: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: UploadHistoryEntry = {
    id,
    domain: report.domain,
    fileName,
    savedAt: Date.now(),
  };

  try {
    const history = [entry, ...readHistory()];
    const kept = history.slice(0, MAX_HISTORY);
    for (const dropped of history.slice(MAX_HISTORY)) {
      localStorage.removeItem(REPORT_PREFIX + dropped.id);
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    localStorage.setItem(REPORT_PREFIX + id, JSON.stringify(report));
  } catch {
    // localStorage unavailable/full — the report still shows on this page
    // load via the caller's own state, it just won't persist to history
  }

  return id;
}
