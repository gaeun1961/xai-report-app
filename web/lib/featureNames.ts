// Per-browser (localStorage) display-name override for a feature column,
// keyed by domain+column — same pattern as valueLabels.ts, but for the
// column name shown in the feature importance chart instead of a target
// value. The underlying column name (used for lookups: tendencies,
// glossary, SHAP data) never changes, only what's displayed.
const PREFIX = "xai-feature-name:";

function key(domain: string, column: string): string {
  return `${PREFIX}${domain}:${column}`;
}

export function getFeatureName(domain: string, column: string): string | undefined {
  try {
    return localStorage.getItem(key(domain, column)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setFeatureName(domain: string, column: string, name: string): void {
  const trimmed = name.trim();
  try {
    if (trimmed) localStorage.setItem(key(domain, column), trimmed);
    else localStorage.removeItem(key(domain, column));
  } catch {
    // localStorage unavailable (private mode etc.) — override won't persist
  }
}
