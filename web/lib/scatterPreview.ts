// Where a What-if result lands on the classification case scatter.
// The scatter's x is the case's ACTUAL class (a bee-swarm band per class) and
// its y is the predicted P(positive). Changing feature values doesn't change
// the true label, so the new prediction sits at the same x as the original
// dot with only y moved - the arrow is vertical. Import-free so it can be
// unit-tested with plain Node (lib/*.test.mjs).

export type PreviewPlot = { marginTop: number; plotH: number };
export type Point = { x: number; y: number };

export function yOfProba(proba: number, plot: PreviewPlot): number {
  const p = Math.min(1, Math.max(0, proba));
  return plot.marginTop + (1 - p) * plot.plotH;
}

// Returns null when there's nothing to draw: no preview, or the previewed
// case's own dot isn't on the plot (filtered out / not in the shown set).
export function previewGeometry(args: {
  positions: Map<string, Point>;
  preview: { caseId: string; proba: number } | null | undefined;
  plot: PreviewPlot;
}): { from: Point; to: Point } | null {
  const { positions, preview, plot } = args;
  if (!preview) return null;
  const from = positions.get(preview.caseId);
  if (!from) return null;
  return { from, to: { x: from.x, y: yOfProba(preview.proba, plot) } };
}
