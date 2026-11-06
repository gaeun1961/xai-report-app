// node --experimental-strip-types --test lib/*.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { placeTooltip, GAP, MARGIN } from "./tooltipPlacement.ts";

const rect = (left, top, width = 20, height = 20) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

test("right of the anchor when it fits, vertically centered", () => {
  const p = placeTooltip(rect(100, 400), 300, 100, 1280, 900);
  assert.equal(p.side, "right");
  assert.equal(p.left, 120 + GAP);
  assert.equal(p.top, 410 - 50);
  assert.equal(p.arrow, 50);
});

test("left when the right edge is too close", () => {
  const p = placeTooltip(rect(1200, 400), 300, 100, 1280, 900);
  assert.equal(p.side, "left");
  assert.equal(p.left, 1200 - GAP - 300);
});

test("narrow screen: neither side fits -> above, clamped inside the viewport", () => {
  // 350 = what CSS max-width (100vw - 16px) leaves on a 375px phone, minus a bit
  const p = placeTooltip(rect(340, 400), 350, 120, 375, 700);
  assert.equal(p.side, "above");
  assert.equal(p.left, 375 - 350 - MARGIN);
  assert.equal(p.top, 400 - GAP - 120);
  assert.equal(p.arrow, 350 - p.left); // points at the anchor center (x=350)
});

test("near the top -> below; vertical clamp near the bottom edge", () => {
  assert.equal(placeTooltip(rect(10, 20), 360, 120, 375, 700).side, "below");
  const p = placeTooltip(rect(100, 880), 300, 100, 1280, 900); // right, but low
  assert.equal(p.side, "right");
  assert.equal(p.top, 900 - 100 - MARGIN);
  assert.equal(p.arrow, 100 - 12); // arrow still on the bubble, toward the anchor
});
