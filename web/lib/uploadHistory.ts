import type { ShapReport } from "./types";

// Per-browser only (localStorage) — no login/backend yet, so a saved upload
// report never leaves the device it was analyzed on. Capped list length so
// storage doesn't grow unbounded; oldest entries (and their report blobs)
// are evicted first.
const HISTORY_KEY = "xai-upload-history";
const REPORT_PREFIX = "xai-upload-report:";
const MAX_HISTORY = 20;

// fired whenever the history list changes (new save or rename), so the
// sidebar can refresh without polling even when the route doesn't change
// (e.g. renaming the report you're currently viewing)
export const HISTORY_CHANGED_EVENT = "xai-history-changed";

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

// "09/05 14:30" — short enough for a sidebar row, precise enough to tell
// apart repeated uploads of the same file name.
export function formatSavedAt(savedAt: number): string {
  const d = new Date(savedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getUploadHistoryEntry(id: string): UploadHistoryEntry | null {
  return readHistory().find((e) => e.id === id) ?? null;
}

export function deleteUploadReport(id: string): void {
  try {
    const history = readHistory().filter((e) => e.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    localStorage.removeItem(REPORT_PREFIX + id);
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // localStorage unavailable — nothing to clean up
  }
}

export function renameUploadReport(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const history = readHistory().map((e) =>
      e.id === id ? { ...e, fileName: trimmed } : e,
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // localStorage unavailable — rename won't persist
  }
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
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // localStorage unavailable/full — the report still shows on this page
    // load via the caller's own state, it just won't persist to history
  }

  return id;
}
