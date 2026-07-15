import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifySignal,
  model1Levels,
  consecutiveRun,
  findSwings,
  liquidityMap,
  uncoveredExtremes,
  buildActiveSetup,
  analyzeTimeframe,
  detectAMD,
  amdLevelReads,
  model2Plan,
  clsOutlook,
  compactClsBrief,
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

describe("compactClsBrief", () => {
  test("keeps report inputs and removes duplicated/inactive level data", () => {
    const compact = compactClsBrief({
      success: true,
      generated_at: "2026-07-15T10:00:00.000Z",
      rules_loaded_from: "rules.json",
      methodology: "CLS",
      config_used: { bars_to_fetch: 60 },
      notes: "test",
      symbols_scanned: [
        {
          symbol: "COMEX_MINI:MGC1!",
          methodology_scope: "adapted",
          quote: { last: 4100 },
          timeframes: { W: { setup: null }, D: { setup: null } },
          amd: {
            execution_timeframe: "15",
            session_bars: 40,
            levels: [
              { level_type: "PWL", status: "MANIPULATED" },
              { level_type: "PWH", status: "NO_SETUP" },
            ],
          },
          outlook: {
            state: "WAIT",
            driver: { level_type: "PWL" },
            deadline: { decide_by_local: "11:30" },
            ranked: [{ level_type: "PWL" }, { level_type: "PWH" }],
          },
        },
      ],
      instruction: "render",
    });

    assert.equal(compact.compact, true);
    assert.equal(compact.config_used, undefined);
    assert.equal(compact.symbols_scanned[0].methodology_scope, "adapted");
    assert.deepEqual(compact.symbols_scanned[0].amd.levels, [
      { level_type: "PWL", status: "MANIPULATED" },
    ]);
    assert.equal(compact.symbols_scanned[0].outlook.ranked, undefined);
    assert.equal(compact.instruction, "render");
  });
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

describe("detectAMD", () => {
  const close = (v, x) => assert.ok(Math.abs(v - x) < 1e-9, `${v} !== ${x}`);

  // Real 6E H1 bars, Mon 2026-07-13 (week open → London displacement).
  // Weekly CLS range = previous week 1.1423–1.14955; key level = PWL 1.1423.
  // Verified against David Perk's "EURUSD Weekly CLS Model 1 NWOG Setup".
  const range6E = { high: 1.14955, low: 1.1423 };
  const b = (open, high, low, cl) => ({ time: ++t, open, high, low, close: cl });
  const sixE = [
    b(1.14365, 1.14365, 1.1418, 1.14245), // week open: first wick under PWL
    b(1.1424, 1.1434, 1.1423, 1.1434),
    b(1.1434, 1.14355, 1.14245, 1.1425),
    b(1.1425, 1.1427, 1.14135, 1.14265), // deepest manipulation wick
    b(1.1427, 1.14295, 1.1423, 1.14235),
    b(1.1424, 1.1429, 1.14205, 1.14285), // last touch of the level
    b(1.1428, 1.14345, 1.14265, 1.14335),
    b(1.14335, 1.1439, 1.1427, 1.1427),
    b(1.14285, 1.1437, 1.14255, 1.14305),
    b(1.1431, 1.1456, 1.14305, 1.14545), // CIOD: London displacement
  ];

  test("6E 2026-07-13: full AMD sequence at PWL → CONFIRMED long", () => {
    const res = detectAMD(sixE, range6E.low, "low", range6E);
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.direction, "long");
    close(res.entry, 1.14545); // CIOD close
    close(res.stop, 1.14135); // manipulation extreme
    close(res.target, 1.145925); // 50% of the weekly range
    close(res.sweep_extreme, 1.14135);
    assert.ok(res.penetration_ratio > 0.12 && res.penetration_ratio < 0.14);
    assert.equal(res.accumulation.ok, true); // Asia hugged the level
    assert.ok(res.accumulation.bars >= 6);
  });

  test("6E without the displacement bar → MANIPULATED, awaiting CIOD", () => {
    const res = detectAMD(sixE.slice(0, 9), range6E.low, "low", range6E);
    assert.equal(res.status, "MANIPULATED");
    assert.equal(res.entry, null);
    close(res.stop, 1.14135);
    close(res.target, 1.145925);
  });

  test("last close beyond the level → SWEEPING (unconfirmed)", () => {
    const bars = [
      b(1.1435, 1.144, 1.143, 1.1432),
      b(1.1432, 1.1433, 1.1428, 1.1429),
      b(1.1429, 1.143, 1.1415, 1.1418), // wick + close below PWL
    ];
    const res = detectAMD(bars, range6E.low, "low", range6E);
    assert.equal(res.status, "SWEEPING");
    close(res.sweep_extreme, 1.1415);
  });

  test("penetration beyond the cap → INVALIDATED (acceptance risk)", () => {
    const bars = [
      b(1.1435, 1.144, 1.143, 1.1432),
      b(1.1432, 1.1433, 1.139, 1.1425), // 33 pips below PWL ≈ 46% of the range
    ];
    const res = detectAMD(bars, range6E.low, "low", range6E);
    assert.equal(res.status, "INVALIDATED");
  });

  test("tight range on the level, no sweep → ACCUMULATING", () => {
    const bars = [
      b(1.1432, 1.1436, 1.1427, 1.143),
      b(1.143, 1.1434, 1.1426, 1.1428),
      b(1.1428, 1.1432, 1.1425, 1.143),
    ];
    const res = detectAMD(bars, range6E.low, "low", range6E);
    assert.equal(res.status, "ACCUMULATING");
    assert.equal(res.accumulation.ok, false); // too few bars yet
  });

  test("price nowhere near the level → NO_SETUP", () => {
    const bars = [b(1.147, 1.1475, 1.1465, 1.1472), b(1.1472, 1.1478, 1.1468, 1.1475)];
    const res = detectAMD(bars, range6E.low, "low", range6E);
    assert.equal(res.status, "NO_SETUP");
  });

  test("mirror: sweep of the range high → CONFIRMED short", () => {
    const range = { high: 110, low: 100 };
    const bars = [
      b(108.5, 109.5, 108, 109),
      b(109, 109.8, 108.8, 109.5),
      b(109.5, 110.6, 109.4, 109.8), // manipulation above the high, close back
      b(109.8, 110.1, 109.6, 109.9),
      b(109.9, 110.0, 107.8, 108.0), // CIOD down through structure
    ];
    const res = detectAMD(bars, range.high, "high", range, { acc_min_bars: 3 });
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.direction, "short");
    close(res.entry, 108.0);
    close(res.stop, 110.6);
    close(res.target, 105); // 50% of the range from the high
    assert.ok(res.rr > 0);
    assert.equal(res.accumulation.ok, true);
  });

  // M1 completes (price runs past 50%), then the impulse leg defines the
  // Model 2 reload zone. range {high:110, low:100}, PWL = 100.
  const m2Range = { high: 110, low: 100 };
  const m2Bars = [
    b(100.6, 101.0, 99.8, 100.2),
    b(100.2, 100.5, 99.0, 100.3), // manipulation wick to 99, reclaim
    b(100.3, 100.7, 100.1, 100.5),
    b(100.5, 102.6, 100.4, 102.4), // CIOD displacement
    b(102.4, 104.0, 102.3, 103.8),
    b(103.8, 106.0, 103.7, 105.9), // impulse high 106, past the 105 (50%) target
    b(105.9, 106.0, 101.1, 101.3), // pullback into the 61.8–80% zone
  ];

  test("M1 complete + pullback into the zone → model2 ARMED", () => {
    const res = detectAMD(m2Bars, m2Range.low, "low", m2Range);
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.m1_target_hit, true);
    assert.equal(res.model2.status, "ARMED");
    close(res.model2.target, 110); // full range = opposite extreme
    close(res.model2.stop, 99); // manipulation extreme
    close(res.model2.leg.from, 99);
    close(res.model2.leg.to, 106);
    close(res.model2.zone.high, 106 - 7 * 0.618); // 61.8% retrace
    close(res.model2.zone.low, 106 - 7 * 0.8); // 80% retrace
    assert.ok(res.model2.rr > 3 && res.model2.rr < 3.2);
    assert.equal(res.model2.deep, false);
  });

  test("M1 complete, price still extended → model2 AWAIT_PULLBACK", () => {
    const res = detectAMD(m2Bars.slice(0, 6), m2Range.low, "low", m2Range);
    assert.equal(res.m1_target_hit, true);
    assert.equal(res.model2.status, "AWAIT_PULLBACK");
  });

  test("M1 target not reached → no model2", () => {
    // stop the impulse below the 50% target (105)
    const short = m2Bars.slice(0, 5); // impulse high only 104
    const res = detectAMD(short, m2Range.low, "low", m2Range);
    assert.equal(res.status, "CONFIRMED");
    assert.equal(res.m1_target_hit, false);
    assert.equal(res.model2, null);
  });
});

describe("model2Plan (pure)", () => {
  const F = (p) => p; // long space
  test("impulse already ran the full range → COMPLETE", () => {
    const p = model2Plan(99, 110, 110, 108, [0.618, 0.8], F);
    assert.equal(p.status, "COMPLETE");
  });
  test("pullback breaks the manipulation extreme → INVALIDATED", () => {
    const p = model2Plan(99, 106, 110, 98.5, [0.618, 0.8], F);
    assert.equal(p.status, "INVALIDATED");
  });
  test("pullback past 80% but above the stop → ARMED + deep flag", () => {
    const p = model2Plan(99, 106, 110, 100.0, [0.618, 0.8], F); // below zone_low 100.4
    assert.equal(p.status, "ARMED");
    assert.equal(p.deep, true);
  });
  test("zero/negative leg → null", () => {
    assert.equal(model2Plan(106, 100, 110, 103, [0.618, 0.8], F), null);
  });
});

describe("amdLevelReads", () => {
  test("Model 2 zone lists a confluent level from another timeframe", () => {
    const timeframes = {
      W: {
        setup: { side: "low", direction: "long", anchor: 100, sweep_extreme: 99 },
        cls_range: { high: 110, low: 100 }, // active low 100 → M2 zone ~100.4–101.67
        deeper_levels: [],
      },
      D: {
        setup: { side: "low", direction: "long", anchor: 101, sweep_extreme: 100.5 },
        cls_range: { high: 130, low: 101 }, // active low 101 sits inside W's M2 zone
        deeper_levels: [],
      },
    };
    const session = [
      { time: 1, open: 100.6, high: 101.0, low: 99.8, close: 100.2 },
      { time: 2, open: 100.2, high: 100.5, low: 99.0, close: 100.3 },
      { time: 3, open: 100.3, high: 100.7, low: 100.1, close: 100.5 },
      { time: 4, open: 100.5, high: 102.6, low: 100.4, close: 102.4 },
      { time: 5, open: 102.4, high: 104.0, low: 102.3, close: 103.8 },
      { time: 6, open: 103.8, high: 106.0, low: 103.7, close: 105.9 },
      { time: 7, open: 105.9, high: 106.0, low: 101.1, close: 101.3 },
    ];
    const reads = amdLevelReads(timeframes, session);
    const wActive = reads.find((r) => r.level_type === "W-active-L");
    assert.equal(wActive.model2.status, "ARMED");
    const conf = wActive.model2.confluence;
    assert.equal(conf.length, 1);
    assert.equal(conf[0].type, "D-active-L");
  });

  test("runs the detector on the active anchor + deeper levels with strength labels", () => {
    const timeframes = {
      W: {
        setup: { side: "low", direction: "long", anchor: 1.1423, sweep_extreme: 1.1418 },
        cls_range: { high: 1.14955, low: 1.1423 },
        deeper_levels: [
          {
            side: "low",
            direction: "long",
            level: 1.14,
            cls_range: { high: 1.14955, low: 1.14 },
            m1_target: 1.144775,
          },
        ],
      },
      D: { error: "no data" }, // skipped
    };
    const session = [
      { time: 1, open: 1.1435, high: 1.144, low: 1.143, close: 1.1432 },
      { time: 2, open: 1.1432, high: 1.1433, low: 1.1418, close: 1.1428 },
    ];
    const reads = amdLevelReads(timeframes, session);
    assert.equal(reads.length, 2); // active + deeper; errored D skipped
    const active = reads.find((r) => r.kind === "active");
    assert.equal(active.level_type, "W-active-L");
    assert.equal(active.strength, "strong");
    assert.equal(active.status, "MANIPULATED");
    const deeper = reads.find((r) => r.kind === "deeper");
    assert.equal(deeper.level_type, "W-deeper-L");
    assert.equal(deeper.status, "NO_SETUP"); // price hasn't reached it
  });
});

describe("clsOutlook", () => {
  const rng = 0.00725; // weekly 6E range
  const opts = (price) => ({
    currentPrice: price,
    reach_ratio: 0.6,
    session_open_local: "10:00",
    timebox_min: 90,
  });

  test("an armed (MANIPULATED) level → WAIT, with a decide-by deadline", () => {
    const reads = [
      { level_type: "PWL", strength: "strong", status: "MANIPULATED", level: 1.1423, range_size: rng },
      { level_type: "PWH", strength: "strong", status: "NO_SETUP", level: 1.14955, range_size: rng },
    ];
    const o = clsOutlook(reads, opts(1.1417));
    assert.equal(o.state, "WAIT");
    assert.equal(o.driver.level_type, "PWL");
    assert.equal(o.deadline.decide_by_local, "11:30");
  });

  test("no setup but a level within reach → WATCH", () => {
    const reads = [
      { level_type: "PWL", strength: "strong", status: "NO_SETUP", level: 1.145, range_size: rng },
    ];
    const o = clsOutlook(reads, opts(1.1468)); // ~0.25 of the range away
    assert.equal(o.state, "WATCH");
  });

  test("all levels out of reach → SKIP, no driver", () => {
    const reads = [
      { level_type: "PWH", strength: "strong", status: "NO_SETUP", level: 1.2, range_size: rng },
    ];
    const o = clsOutlook(reads, opts(1.1417));
    assert.equal(o.state, "SKIP");
    assert.equal(o.driver, null);
  });

  test("strong level outranks a weak one at the same status", () => {
    const reads = [
      { level_type: "PDL", strength: "weak", status: "MANIPULATED", level: 1.144, range_size: rng },
      { level_type: "PWL", strength: "strong", status: "MANIPULATED", level: 1.1423, range_size: rng },
    ];
    const o = clsOutlook(reads, opts(1.1417));
    assert.equal(o.driver.level_type, "PWL");
  });
});

describe("uncoveredExtremes", () => {
  const b = (high, low) => ({ time: ++t, open: (high + low) / 2, high, low, close: (high + low) / 2 });
  test("descending staircase of uncovered lows, nearest first", () => {
    // lows (oldest→newest): 90, 95, 108, 100. Walking back from the newest
    // (100), deeper unswept lows are 95 then 90; 108 is covered → skipped.
    const closed = [b(120, 90), b(118, 95), b(115, 108), b(112, 100)];
    const lows = uncoveredExtremes(closed, "low").map((u) => u.price);
    assert.deepEqual(lows, [100, 95, 90]);
  });
  test("ascending staircase of uncovered highs, nearest first", () => {
    // highs (oldest→newest): 115, 110, 102, 105. Higher unswept highs above
    // the newest (105) are 110 then 115; 102 is covered → skipped.
    const closed = [b(115, 90), b(110, 92), b(102, 91), b(105, 93)];
    const highs = uncoveredExtremes(closed, "high").map((u) => u.price);
    assert.deepEqual(highs, [105, 110, 115]);
  });
});

describe("buildActiveSetup — CLS range from developing sweep (max 2-week merge)", () => {
  const close = (v, x) => assert.ok(Math.abs(v - x) < 1e-6, `${v} !== ${x}`);
  // Real gold weeklies (oldest→newest closed): week-before-last, previous.
  const wBefore = { time: 1, open: 4075, high: 4195.51, low: 3942.1, close: 4175 };
  const wPrev = { time: 2, open: 4180, high: 4202.705, low: 4021.815, close: 4120.67 };

  test("gold now: swept only the previous low → single-week range, deeper 3942.1 pending", () => {
    const developing = { time: 3, open: 4090.98, high: 4104.05, low: 3983.545, close: 4028.6 };
    const a = buildActiveSetup([wBefore, wPrev], developing);
    assert.equal(a.setup.direction, "long");
    close(a.setup.anchor, 4021.815);
    close(a.setup.sweep_extreme, 3983.545);
    close(a.cls_range.low, 4021.815);
    close(a.cls_range.high, 4202.705);
    close(a.m1_target, 4112.26); // middle of the previous week
    assert.equal(a.deeper.length, 1);
    close(a.deeper[0].level, 3942.1); // week-before-last low, uncovered
    close(a.deeper[0].cls_range.low, 3942.1);
    close(a.deeper[0].cls_range.high, 4202.705); // merged high = higher of the two
    close(a.deeper[0].m1_target, 4072.4025);
  });

  test("price drops below the deeper low → range merges both weeks, target shifts down", () => {
    const developing = { time: 3, open: 4090, high: 4104, low: 3930, close: 3950 };
    const a = buildActiveSetup([wBefore, wPrev], developing);
    close(a.cls_range.low, 3942.1); // anchored at the deeper swept low
    close(a.cls_range.high, 4202.705); // higher of the two week highs
    close(a.m1_target, 4072.4025);
    assert.equal(a.deeper.length, 0); // nothing deeper within the 2-week cap
  });

  test("2-week hard limit: a lower low 3 weeks back is ignored", () => {
    const wOldest = { time: 0, open: 4100, high: 4300, low: 3900, close: 4100 };
    const developing = { time: 3, open: 4090, high: 4104, low: 3910, close: 3950 };
    const a = buildActiveSetup([wOldest, wBefore, wPrev], developing);
    close(a.cls_range.low, 3942.1); // NOT 3900 — capped at 2 closed weeks
    assert.equal(a.deeper.length, 0);
  });

  test("short mirror: swept previous high, deeper uncovered high pending", () => {
    const nBefore = { time: 1, open: 100, high: 115, low: 90, close: 100 };
    const nPrev = { time: 2, open: 100, high: 110, low: 95, close: 100 };
    const developing = { time: 3, open: 105, high: 112, low: 104, close: 106 };
    const a = buildActiveSetup([nBefore, nPrev], developing);
    assert.equal(a.setup.direction, "short");
    close(a.setup.anchor, 110);
    close(a.cls_range.high, 110);
    close(a.cls_range.low, 95);
    close(a.m1_target, 102.5);
    assert.equal(a.deeper.length, 1);
    close(a.deeper[0].level, 115); // uncovered higher high
    close(a.deeper[0].cls_range.high, 115);
    close(a.deeper[0].cls_range.low, 90);
  });

  test("developing inside the previous range → no setup, both nearest extremes pending", () => {
    const nBefore = { time: 1, open: 100, high: 110, low: 90, close: 100 };
    const nPrev = { time: 2, open: 100, high: 108, low: 95, close: 100 };
    const developing = { time: 3, open: 100, high: 105, low: 98, close: 102 };
    const a = buildActiveSetup([nBefore, nPrev], developing);
    assert.equal(a.setup, null);
    close(a.cls_range.high, 108);
    close(a.cls_range.low, 95);
    assert.equal(a.deeper.length, 2); // pending long @95 and pending short @108
  });
});

describe("analyzeTimeframe", () => {
  const close = (v, x) => assert.ok(Math.abs(v - x) < 1e-6, `${v} !== ${x}`);

  test("errors on too few bars", () => {
    const res = analyzeTimeframe([bar(1, 2, 0, 1)]);
    assert.match(res.error, /Not enough bars/);
  });

  test("long setup toward the middle; no M1 completion yet → no M2", () => {
    const bars = [
      { time: 1, open: 4075, high: 4195.51, low: 3942.1, close: 4175 },
      { time: 2, open: 4180, high: 4202.705, low: 4021.815, close: 4120.67 },
      { time: 3, open: 4090.98, high: 4104.05, low: 3983.545, close: 4028.6 }, // developing
    ];
    const res = analyzeTimeframe(bars);
    assert.equal(res.setup.direction, "long");
    assert.equal(res.model1.direction, "long");
    close(res.model1.target, 4112.26); // middle of the CLS range
    close(res.model1.invalidation, 3983.545); // sweep extreme
    assert.equal(res.m1_target_hit, false); // developing high 4104 < 4112
    assert.equal(res.model2, null);
    assert.equal(res.deeper_levels.length, 1);
    close(res.deeper_levels[0].level, 3942.1);
  });

  test("long reaches the middle → Model 2 armed to the opposite extreme", () => {
    const bars = [
      bar(103, 106, 102, 104), // week-before: low 102 (covered, doesn't merge)
      bar(100, 110, 100, 105), // previous week: range 100–110, middle 105
      bar(105, 108, 95, 99), // developing: swept 100 to 95, ran to 108 (> middle 105)
    ];
    const res = analyzeTimeframe(bars);
    assert.equal(res.setup.direction, "long");
    close(res.model1.target, 105);
    assert.equal(res.m1_target_hit, true); // developing high 108 ≥ 105
    assert.equal(res.model2.status, "ARMED"); // close 99 in the 61.8–80% zone
    assert.equal(res.model2.direction, "long");
    close(res.model2.target, 110); // opposite extreme (full range)
    close(res.model2.stop, 95); // manipulation extreme
  });
});
