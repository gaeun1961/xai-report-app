// node --experimental-strip-types --test lib/*.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDependence } from "./dependenceSummary.ts";
import { caseScopeText, HELD_OUT_NOTE } from "./caseScope.ts";

const fmt = (n) => String(Math.round(n * 10) / 10);
const rep = (v, n) => Array(n).fill(v);

test("categorical, classification: per-value mean in %p, higher first", () => {
  const values = [...rep("No", 5), ...rep("Yes", 5)];
  const shap = [...rep(-0.045, 5), ...rep(0.068, 5)];
  assert.equal(
    summarizeDependence({ values, shap, regression: false, categories: ["No", "Yes"], fmt }),
    "Yes인 케이스는 예측 확률을 평균 +6.8%p 올리고, No인 케이스는 평균 −4.5%p 내려요.",
  );
});

test("sign decides the verb, not the position", () => {
  // both groups push down: "내리고 ... 내려요"
  const values = [...rep("A", 4), ...rep("B", 4)];
  const shap = [...rep(-0.01, 4), ...rep(-0.05, 4)];
  assert.equal(
    summarizeDependence({ values, shap, regression: false, categories: ["A", "B"], fmt }),
    "A인 케이스는 예측 확률을 평균 −1.0%p 내리고, B인 케이스는 평균 −5.0%p 내려요.",
  );
});

test("many categories: strongest up vs strongest down, ties keep category order", () => {
  const cats = ["Mid", "Top", "Low", "Tie"];
  const values = [...rep("Mid", 3), ...rep("Top", 3), ...rep("Low", 3), ...rep("Tie", 3)];
  const shap = [...rep(0.01, 3), ...rep(0.09, 3), ...rep(-0.07, 3), ...rep(0.01, 3)];
  assert.match(
    summarizeDependence({ values, shap, regression: false, categories: cats, fmt }),
    /^Top인 케이스.*\+9\.0%p 올리고, Low인 케이스.*−7\.0%p 내려요\.$/,
  );
  // two groups with the same mean: the earlier category in the plot's order is "top"
  const same = summarizeDependence({
    values: [...rep("B", 3), ...rep("A", 3)],
    shap: [...rep(0.02, 3), ...rep(0.02, 3)],
    regression: false,
    categories: ["A", "B"],
    fmt,
  });
  assert.match(same, /^A인 케이스.*, B인 케이스/);
});

test("regression shows target units, not %p", () => {
  const values = [...rep("Y", 4), ...rep("N", 4)];
  const shap = [...rep(12.5, 4), ...rep(-8.1, 4)];
  const out = summarizeDependence({ values, shap, regression: true, categories: ["Y", "N"], fmt });
  assert.equal(out, "Y인 케이스는 예측값을 평균 +12.5 올리고, N인 케이스는 평균 −8.1 내려요.");
  assert.ok(!out.includes("%p"));
});

test("labelOf decodes coded values; unknown values fall into 기타", () => {
  const out = summarizeDependence({
    values: [...rep(1, 3), ...rep(0, 3), ...rep("x", 3)],
    shap: [...rep(0.2, 3), ...rep(-0.1, 3), ...rep(0.0, 3)],
    regression: false,
    categories: ["1", "0", "기타"],
    labelOf: (c) => (c === "1" ? "1(여성)" : c === "0" ? "0(남성)" : c),
    fmt,
  });
  assert.equal(out, "1(여성)인 케이스는 예측 확률을 평균 +20.0%p 올리고, 0(남성)인 케이스는 평균 −10.0%p 내려요.");
});

test("one usable group -> a single clause", () => {
  const out = summarizeDependence({
    values: [...rep("A", 4), "B"],
    shap: [...rep(0.03, 4), 0.5],
    regression: false,
    categories: ["A", "B"],
    fmt,
  });
  assert.equal(out, "A인 케이스는 예측 확률을 평균 +3.0%p 올려요.");
});

test("continuous: top third vs bottom third by value, with their cut-offs", () => {
  const values = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
  const shap = values.map((v) => (v - 15.5) / 100); // rises with the value
  const out = summarizeDependence({ values, shap, regression: false, fmt });
  assert.match(out, /^값이 큰 쪽\(21 이상\)인 케이스는 예측 확률을 평균 \+/);
  assert.match(out, /값이 작은 쪽\(10 이하\)인 케이스는 평균 −.*내려요\.$/);
  // regression: units
  const reg = summarizeDependence({ values, shap: values.map((v) => v * 2 - 31), regression: true, fmt });
  assert.ok(reg.includes("예측값을") && !reg.includes("%p"));
});

test("no sentence when there is nothing trustworthy to say", () => {
  const base = { regression: false, fmt };
  assert.equal(summarizeDependence({ ...base, values: [], shap: [] }), null); // no points
  assert.equal(summarizeDependence({ ...base, values: [1, 2, 3], shap: [0, 0, 0] }), null); // too few numeric
  assert.equal(summarizeDependence({ ...base, values: rep(5, 12), shap: rep(0.1, 12) }), null); // no spread
  assert.equal(summarizeDependence({ ...base, values: rep(null, 12), shap: rep(0.1, 12) }), null); // all missing
  assert.equal(
    summarizeDependence({ ...base, values: ["A", "A", "B", "B"], shap: [1, 1, 1, 1], categories: ["A", "B"] }),
    null, // every group under 3 points
  );
  assert.equal(
    summarizeDependence({ ...base, values: ["Z", "Z", "Z"], shap: [1, 1, 1], categories: ["A", "B"] }),
    null, // values not in the plotted categories
  );
});

test("caseScopeText puts the file's total rows first, only when known", () => {
  const stats = { total: 294, wrong: 51, borderline: 44, heldOut: true };
  assert.equal(caseScopeText(stats, 1470), "전체 1,470행 중 학습에 쓰지 않은 294개 중");
  assert.equal(caseScopeText(stats), "학습에 쓰지 않은 294개 중"); // preset: no total
  assert.equal(caseScopeText({ ...stats, heldOut: false }, 1470), "분석한 전체 294개 중"); // old report
  assert.ok(HELD_OUT_NOTE.includes("모델이 이미 답을 본 행") && HELD_OUT_NOTE.includes("약 20%"));
});
