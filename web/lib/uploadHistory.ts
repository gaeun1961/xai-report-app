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

// Reports saved in this page session, also kept in memory: the page right
// after an upload renders from here even when localStorage refused the
// write (its ~5MB per-origin quota), instead of "기록을 찾을 수 없어요".
const sessionReports = new Map<string, ShapReport>();
// what happened to a save, for the report page to show (absent = all fine)
const saveNotices = new Map<string, string>();

export function getSaveNotice(id: string): string | undefined {
  return saveNotices.get(id);
}

// a single report this big is never worth evicting the whole history for
// (real upload reports are tens to a few hundred KB) - it's just not stored
const MAX_STORED_REPORT_CHARS = 1_000_000;

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
}

export function loadUploadReport(id: string): ShapReport | null {
  const inMemory = sessionReports.get(id);
  if (inMemory) return inMemory;
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

  sessionReports.set(id, report);
  try {
    const history = [entry, ...readHistory()];
    const kept = history.slice(0, MAX_HISTORY);
    for (const dropped of history.slice(MAX_HISTORY)) {
      localStorage.removeItem(REPORT_PREFIX + dropped.id);
    }
    // full storage: drop the oldest saved reports one by one and retry,
    // rather than the old silent failure (which left the just-uploaded
    // report unfindable). The blob goes in before the list, so the list
    // never points at a report that isn't there.
    const blob = JSON.stringify(report);
    if (blob.length > MAX_STORED_REPORT_CHARS) throw new Error("report too large to store");
    // blob + list are written as one step and retried together: either can
    // be the write that tips over the quota (the list grows by an entry too)
    let evicted = 0;
    for (;;) {
      try {
        localStorage.setItem(REPORT_PREFIX + id, blob);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
        break;
      } catch (e) {
        localStorage.removeItem(REPORT_PREFIX + id);
        const oldest = kept.length > 1 ? kept.pop() : undefined;
        if (!isQuotaError(e) || !oldest) throw e;
        localStorage.removeItem(REPORT_PREFIX + oldest.id);
        // the stored list must never mention the new report before it's in
        localStorage.setItem(HISTORY_KEY, JSON.stringify(kept.filter((x) => x.id !== id)));
        evicted++;
      }
    }
    if (evicted > 0) {
      saveNotices.set(
        id,
        `브라우저 저장 공간이 부족해서 오래된 분석 기록 ${evicted}개를 지우고 저장했어요.`,
      );
    }
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  } catch {
    // still too big even alone, or localStorage unavailable (private mode):
    // the report shows from memory now, but won't be there after a reload.
    // Make sure the list doesn't keep an entry for a report that isn't stored.
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(readHistory().filter((e) => e.id !== id)),
      );
    } catch {
      // nothing more to do
    }
    saveNotices.set(
      id,
      "브라우저 저장 공간에 저장하지 못해서 이 분석은 \"내 분석 기록\"에 남지 않아요. 새로고침하거나 창을 닫으면 다시 업로드해야 해요.",
    );
  }

  return id;
}
