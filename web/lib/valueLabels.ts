// Per-browser (localStorage) mapping from a target column + its raw CSV
// value to a user-typed meaning (e.g. "Survived" + "1" -> "생존"). Keyed by
// column name only (not by file/domain), so typing it once for one upload
// auto-applies to any later upload whose target column has the same name.
const PREFIX = "xai-value-label:";

function key(column: string, raw: string): string {
  return `${PREFIX}${column}:${raw}`;
}

export function getValueLabel(column: string, raw: string): string | undefined {
  try {
    return localStorage.getItem(key(column, raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setValueLabel(column: string, raw: string, label: string): void {
  const trimmed = label.trim();
  try {
    if (trimmed) localStorage.setItem(key(column, raw), trimmed);
    else localStorage.removeItem(key(column, raw));
  } catch {
    // localStorage unavailable (private mode etc.) — label won't persist
  }
}
