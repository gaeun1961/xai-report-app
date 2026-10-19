// Shared plot geometry for the feature detail tab: the distribution, PDP and
// dependence charts all draw inside the same viewBox width and left/right
// margins (and sit in the same card), so a given feature value lands at the
// same horizontal pixel in all three.
export const WIDE = { width: 640, left: 56, right: 12 } as const;

export function wideX(range: [number, number]) {
  const [lo, hi] = range;
  const span = WIDE.width - WIDE.left - WIDE.right;
  return (v: number) => WIDE.left + ((v - lo) / (hi - lo || 1)) * span;
}
