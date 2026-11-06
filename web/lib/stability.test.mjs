// node --experimental-strip-types --test lib/*.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { stabilityLevel, stabilityEvidence, stabilitySentence } from "./stability.ts";

const base = { runs: 5, sampleFrac: 0.8, topK: 5, explainedRows: 200, topKOverlapMin: 0.6, rankCorrMin: 0.8 };
const s = (topKOverlap, rankCorr) => ({ ...base, topKOverlap, rankCorr });

test("levels match the measured preset distribution", () => {
  assert.equal(stabilityLevel(s(0.92, 0.936)), "high"); // Titanic
  assert.equal(stabilityLevel(s(0.92, 0.989)), "high"); // Telco
  assert.equal(stabilityLevel(s(0.72, 0.941)), "medium"); // HR
  assert.equal(stabilityLevel(s(0.74, 0.796)), "low"); // noisy synthetic regression
});

test("high needs both numbers; either one alone can make it low", () => {
  assert.equal(stabilityLevel(s(1, 0.85)), "medium");
  assert.equal(stabilityLevel(s(0.69, 0.99)), "low");
  assert.equal(stabilityLevel(s(0.85, 0.9)), "high"); // boundaries inclusive
});

test("evidence shows the numbers, sentence adds the correlated pair", () => {
  assert.equal(
    stabilityEvidence(s(0.92, 0.936)),
    "데이터 80%씩 뽑아 5번 다시 학습 · 상위 5개 일치율 평균 92% (최저 60%) · 순위 상관 0.94 (최저 0.80)",
  );
  assert.ok(!stabilitySentence(s(0.92, 0.94)).includes("나뉘어"));
  assert.match(stabilitySentence(s(0.92, 0.94), ["나이", "근속연수"]), /'나이'-'근속연수'처럼 .*기여도가 나뉘어 보일 수 있어요\.$/);
});
