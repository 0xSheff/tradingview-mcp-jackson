import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifySignal,
  model1Levels,
  model2Zone,
  consecutiveRun,
  findSwings,
  liquidityMap,
  analyzeTimeframe,
} from "../src/core/cls.js";

let t = 0;
const bar = (open, high, low, close) => ({
  time: ++t,
  open,
  high,
  low,
  close,
  volume: 0,
});

describe("classifySignal", () => {
  const cls = bar(100, 110, 100, 105);

  test("sweep of the high closing back inside → M1_SHORT", () => {
    const res = classifySignal(cls, bar(105, 115, 104, 107));
    assert.equal(res.signal, "M1_SHORT");
    assert.equal(res.took_high, true);
    assert.equal(res.close_location, "inside");
  });

  test("sweep of the low closing back inside → M1_LONG", () => {
    const res = classifySignal(cls, bar(105, 108, 95, 103));
    assert.equal(res.signal, "M1_LONG");
  });

  test("close above the range high → ACCEPTANCE_UP", () => {
    const res = classifySignal(cls, bar(105, 118, 104, 112));
    assert.equal(res.signal, "ACCEPTANCE_UP");
    assert.equal(res.close_location, "above");
  });

  test("close below the range low → ACCEPTANCE_DOWN", () => {
    const res = classifySignal(cls, bar(105, 108, 92, 96));
    assert.equal(res.signal, "ACCEPTANCE_DOWN");
  });

  test("both extremes taken, close inside → DOUBLE_SWEEP", () => {
    const res = classifySignal(cls, bar(105, 116, 94, 106));
    assert.equal(res.signal, "DOUBLE_SWEEP");
  });

  test("both extremes taken, close beyond one side → acceptance of that side", () => {
    assert.equal(classifySignal(cls, bar(105, 116, 94, 114)).signal, "ACCEPTANCE_UP");
    assert.equal(classifySignal(cls, bar(105, 116, 94, 97)).signal, "ACCEPTANCE_DOWN");
  });

  test("neither extreme taken → INSIDE", () => {
    const res = classifySignal(cls, bar(105, 109, 101, 104));
    assert.equal(res.signal, "INSIDE");
  });
});

describe("model1Levels", () => {
  const cls = bar(100, 110, 100, 105);

  test("M1_SHORT: target = 50% of range, invalidation = sweep high", () => {
    const signal = bar(105, 115, 104, 107);
    const m1 = model1Levels(cls, signal, "M1_SHORT");
    assert.equal(m1.direction, "short");
    assert.equal(m1.target, 105); // 100 + 0.5 * 10
    assert.equal(m1.invalidation, 115);
    assert.deepEqual(m1.range, { high: 110, low: 100 });
  });

  test("M1_LONG: invalidation = sweep low", () => {
    const signal = bar(105, 108, 95, 103);
    const m1 = model1Levels(cls, signal, "M1_LONG");
    assert.equal(m1.direction, "long");
    assert.equal(m1.invalidation, 95);
  });

  test("returns null when no M1 signal", () => {
    assert.equal(model1Levels(cls, bar(105, 109, 101, 104), "INSIDE"), null);
  });

  test("respects a custom target ratio", () => {
    const m1 = model1Levels(cls, bar(105, 115, 104, 107), "M1_SHORT", 0.25);
    assert.equal(m1.target, 102.5);
  });
});

describe("model2Zone", () => {
  test("bullish leg 100→120: reload zone 61.8–80%, 61.8 touched first", () => {
    const z = model2Zone(100, 120);
    assert.equal(z.direction, "long");
    assert.ok(Math.abs(z.zone_from - 107.64) < 1e-9);
    assert.equal(z.zone_to, 104);
    assert.equal(z.target, 120);
    assert.equal(z.invalidation, 100);
  });

  test("bearish leg 120→100: zone mirrors above", () => {
    const z = model2Zone(120, 100);
    assert.equal(z.direction, "short");
    assert.ok(Math.abs(z.zone_from - 112.36) < 1e-9);
    assert.equal(z.zone_to, 116);
    assert.equal(z.target, 100);
    assert.equal(z.invalidation, 120);
  });

  test("zero-size leg → null", () => {
    assert.equal(model2Zone(100, 100), null);
  });
});

describe("consecutiveRun", () => {
  test("counts the trailing same-direction run", () => {
    const bars = [
      bar(100, 101, 99, 99.5), // bear
      bar(99, 102, 99, 101), // bull
      bar(101, 103, 100, 102), // bull
      bar(102, 105, 101, 104), // bull
    ];
    assert.deepEqual(consecutiveRun(bars), { direction: "bull", count: 3 });
  });

  test("doji at the end breaks the run", () => {
    const bars = [bar(100, 102, 99, 101), bar(101, 103, 100, 101)];
    assert.deepEqual(consecutiveRun(bars), { direction: null, count: 0 });
  });
});

describe("findSwings / liquidityMap", () => {
  // One clear swing high at 15 (i2) and one clear swing low at 3 (i4).
  const bars = [
    bar(7, 10, 5, 8),
    bar(8, 11, 4, 9),
    bar(9, 15, 6, 10),
    bar(10, 11, 6, 8),
    bar(8, 10, 3, 7),
    bar(7, 9, 6, 8),
    bar(8, 9, 6, 8),
  ];

  test("detects the swing high and swing low", () => {
    const { highs, lows } = findSwings(bars);
    assert.deepEqual(highs.map((s) => s.price), [15]);
    assert.deepEqual(lows.map((s) => s.price), [3]);
  });

  test("liquidityMap splits untaken swings around the current price", () => {
    const liq = liquidityMap(bars, 8);
    assert.deepEqual(liq.above, [15]);
    assert.deepEqual(liq.below, [3]);
  });

  test("a swept swing is no longer resting liquidity", () => {
    const swept = [...bars, bar(8, 16, 7, 12)]; // takes out the 15 high
    const liq = liquidityMap(swept, 12);
    assert.deepEqual(liq.above, []);
  });

  test("marks equal highs within tolerance", () => {
    const eq = [
      bar(7, 10, 5, 8),
      bar(8, 11, 6, 9),
      bar(9, 15, 7, 10), // swing high 15
      bar(10, 11, 7, 9),
      bar(9, 12, 7, 10),
      bar(10, 14.995, 8, 11), // swing high ≈15, does not take out the first one
      bar(9, 11, 7, 9),
      bar(9, 10, 7, 9),
    ];
    const liq = liquidityMap(eq, 9, { eq_tolerance_ratio: 0.01 });
    assert.equal(liq.equal_highs.length, 1);
  });
});

describe("analyzeTimeframe", () => {
  test("errors on too few bars", () => {
    const res = analyzeTimeframe([bar(1, 2, 0, 1), bar(1, 2, 0, 1)]);
    assert.match(res.error, /Not enough bars/);
  });

  test("reads the signal pair from the last closed candles, live from the developing one", () => {
    const bars = [
      bar(98, 104, 97, 100), // padding
      bar(100, 110, 100, 105), // CLS candle
      bar(105, 115, 104, 107), // signal: sweep of the high → M1_SHORT
      bar(107, 108, 103, 104), // developing: swept signal low, back inside → live M1_LONG
    ];
    const res = analyzeTimeframe(bars);
    assert.equal(res.classification.signal, "M1_SHORT");
    assert.equal(res.model1.target, 105);
    assert.equal(res.model1.invalidation, 115);
    assert.equal(res.model2, null);
    assert.equal(res.live.signal, "M1_LONG");
    assert.equal(res.cls_candle.high, 110);
    assert.equal(res.signal_candle.high, 115);
  });

  test("acceptance up arms Model 2 with the leg extended by the developing bar", () => {
    const bars = [
      bar(98, 104, 97, 100),
      bar(100, 110, 100, 105), // CLS candle
      bar(105, 118, 104, 116), // signal: close above → ACCEPTANCE_UP, leg start 104
      bar(116, 124, 115, 120), // developing extends the leg to 124
    ];
    const res = analyzeTimeframe(bars);
    assert.equal(res.classification.signal, "ACCEPTANCE_UP");
    assert.equal(res.model1, null);
    assert.equal(res.model2.direction, "long");
    assert.equal(res.model2.target, 124);
    assert.equal(res.model2.invalidation, 104);
    // 61.8% retrace of 104→124 leg
    assert.ok(Math.abs(res.model2.zone_from - (124 - 20 * 0.618)) < 1e-9);
  });
});
