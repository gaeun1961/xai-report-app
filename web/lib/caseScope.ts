// The "N개 중" lead-in of the case counts (summary + 케이스 탐색 tab).
// Import-free (type-only import) so it can be unit-tested with plain Node.
import type { ShapReport } from "./types";

// "전체 1,309행 중 학습에 쓰지 않은 262개 중" - the file's total row count
// first, so 262 isn't read as the whole dataset. A preset has no total
// (presets are made from static JSON, not an upload), so that part is left
// out. Older reports (no heldOut): "분석한 전체 N개 중".
export function caseScopeText(
  stats: NonNullable<ShapReport["caseStats"]>,
  totalRows?: number,
): string {
  const n = stats.total.toLocaleString();
  if (!stats.heldOut) return `분석한 전체 ${n}개 중`;
  const all = totalRows !== undefined ? `전체 ${totalRows.toLocaleString()}행 중 ` : "";
  return `${all}학습에 쓰지 않은 ${n}개 중`;
}

// why the counts only use held-out rows - shown as an InfoTip
export const HELD_OUT_NOTE =
  "케이스와 개수는 학습에 쓰지 않은 행만 기준으로 해요. 학습에 쓴 행으로 판정하면 모델이 이미 답을 본 행이라 실제보다 잘 맞아 보여서, 따로 떼어둔 약 20%로만 판정해요.";
