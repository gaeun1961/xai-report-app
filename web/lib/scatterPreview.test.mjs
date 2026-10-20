import test from "node:test";
import assert from "node:assert/strict";
import { previewGeometry, yOfProba } from "./scatterPreview.ts";

const plot = { marginTop: 10, plotH: 156 };
const positions = new Map([["a", { x: 400, y: 50 }], ["b", { x: 120, y: 90 }]]);

test("y follows the predicted probability, top = 100%, bottom = 0%", () => {
  assert.equal(yOfProba(1, plot), 10);
  assert.equal(yOfProba(0, plot), 166);
  assert.equal(yOfProba(0.5, plot), 88);
  // out-of-range probabilities stay on the plot
  assert.equal(yOfProba(1.3, plot), 10);
  assert.equal(yOfProba(-0.2, plot), 166);
});

test("the new point keeps the original dot's x (true class unchanged), only y moves", () => {
  const g = previewGeometry({ positions, preview: { caseId: "a", proba: 0.9 }, plot });
  assert.deepEqual(g.from, { x: 400, y: 50 });
  assert.equal(g.to.x, 400);
  assert.equal(g.to.y, yOfProba(0.9, plot));
});

test("nothing is drawn without a preview, or when the case's dot isn't on the plot", () => {
  assert.equal(previewGeometry({ positions, preview: null, plot }), null);
  assert.equal(previewGeometry({ positions, preview: undefined, plot }), null);
  assert.equal(previewGeometry({ positions, preview: { caseId: "zzz", proba: 0.4 }, plot }), null);
});
