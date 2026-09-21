// Per-browser (localStorage) override of a feature column's tooltip
// description (the hover text — curated preset text or the AI's guess),
// keyed by domain+column — same pattern as valueLabels.ts. Clearing it
// falls back to the original description.
const PREFIX = "xai-feature-desc:";

function key(domain: string, column: string): string {
  return `${PREFIX}${domain}:${column}`;
}

export function getFeatureDesc(domain: string, column: string): string | undefined {
  try {
    return localStorage.getItem(key(domain, column)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setFeatureDesc(domain: string, column: string, desc: string): void {
  const trimmed = desc.trim();
  try {
    if (trimmed) localStorage.setItem(key(domain, column), trimmed);
    else localStorage.removeItem(key(domain, column));
  } catch {
    // localStorage unavailable (private mode etc.) — override won't persist
  }
}
