/**
 * ChrisFX breaker-block detection — unit tests.
 *
 * The six schematics the author grades on slide 2 of the source deck are
 * rebuilt here as synthetic bars and asserted against his own labels:
 *   1 = B, 2 = A++, 3 = A+, 4 = A, 5 = A++, 6 = A+
 * See docs/CHRISFX.md §3.3.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHRIS_DEFAULTS,
  atrAt,
  findLiquidityPoints,
  findFvgs,
  zoneFvgOverlap,
  classifyGrab,
  findBreakerIndex,
  isLegExtreme,
  gradeSetup,
  detectBreakers,
  analyzeTimeframe,
  compactChrisBrief,
} from "../src/core/chris.js";

let clock = 0;
const mk = (open, high, low, close) => ({
  time: (clock += 300),
  open,
  high,
  low,
  close,
  volume: 100,
});

/** Flat, strictly equal bars: no fractal can form inside them. */
function padding(n, { open, high, low, close }) {
  return Array.from({ length: n }, () => mk(open, high, low, close));
}

const FLAT = { open: 100, high: 100.4, low: 99.6, close: 100.05 };

/** Example 2 — A++ bullish: impulsive body grab, breaker is the leg extreme. */
function example2() {
  clock = 0;
  return [
    ...padding(16, FLAT),
    mk(100, 101, 99, 100.5), //     16
    mk(100.5, 101, 98, 98.5), //    17  valid low @ 98 — the liquidity
    mk(98.5, 99.5, 98.2, 99.2), //  18
    mk(99.2, 100.2, 99.0, 100.0), //19
    mk(100.0, 101.5, 99.8, 101.2), //20 BREAKER — highest of the leg
    mk(101.2, 101.3, 97.0, 97.2), //21 grab: full body close below 98, impulsive
    mk(97.2, 99.5, 97.1, 99.4), //  22 reversal on the very next bar
    mk(99.4, 102.5, 101.6, 102.3), //23 leaves a bullish FVG over the zone
    mk(102.3, 102.8, 102.0, 102.6), //24
    mk(102.6, 102.9, 102.4, 102.7), //25 developing
  ];
}

/** Example 5 — A++ bearish: the mirror of example 2. */
function example5() {
  clock = 0;
  return [
    ...padding(16, { open: 100, high: 100.4, low: 99.6, close: 99.95 }),
    mk(100, 101, 99, 99.5), //       16
    mk(99.5, 102, 99, 101.5), //     17  valid high @ 102 — the liquidity
    mk(101.5, 101.8, 100.8, 100.8), //18
    mk(100.8, 101.0, 99.8, 100.0), //19
    mk(100.0, 100.2, 98.5, 98.8), // 20 BREAKER — lowest of the leg
    mk(98.8, 103.0, 98.7, 102.8), // 21 grab: full body close above 102, impulsive
    mk(102.8, 102.9, 100.5, 100.6), //22 reversal on the very next bar
    mk(98.2, 98.3, 97.5, 97.6), //   23 leaves a bearish FVG over the zone
    mk(97.6, 97.8, 96.8, 97.0), //   24
    mk(97.0, 97.2, 96.6, 96.9), //   25 developing
  ];
}

/** Example 6 — A+ bullish: same as 2, but an earlier candle tops the breaker. */
function example6() {
  const bars = example2();
  bars[19] = { ...bars[19], high: 102.0 }; // now higher than the breaker's 101.5
  return bars;
}

/** Example 3 — A+ bearish: same as 5, but an earlier candle undercuts the breaker. */
function example3() {
  const bars = example5();
  bars[19] = { ...bars[19], low: 98.0 }; // now lower than the breaker's 98.5
  return bars;
}

/** Example 4 — A bullish: the level is taken by a wick, and it was fresh. */
function example4() {
  const bars = example2();
  bars[21] = { ...bars[21], close: 99.0 }; // closes back above 98 → pinbar grab
  bars[22] = { ...bars[22], open: 99.0 };
  return bars;
}

/** Example 1 — B bullish: same pinbar grab, but the level had been sitting there. */
function example1() {
  clock = 0;
  return [
    ...padding(16, FLAT),
    mk(100, 101, 99, 100.5), //     16
    mk(100.5, 101, 98, 98.5), //    17  valid low @ 98
    mk(98.5, 99.5, 98.2, 99.2), //  18
    ...padding(14, { open: 99.5, high: 100.0, low: 99.2, close: 99.6 }), // 19..32
    mk(99.6, 101.5, 99.4, 101.2), //33 BREAKER
    mk(101.2, 101.3, 97.0, 99.0), //34 grab: wick below 98, closes back above
    mk(99.0, 99.5, 98.5, 99.4), //  35
    mk(99.4, 102.5, 101.6, 102.3), //36 bullish FVG over the zone
    mk(102.3, 102.8, 102.0, 102.6), //37
    mk(102.6, 102.9, 102.4, 102.7), //38 developing
  ];
}

const onlySetup = (bars) => {
  const setups = detectBreakers(bars, CHRIS_DEFAULTS);
  assert.equal(setups.length, 1, `expected exactly one setup, got ${setups.length}`);
  return setups[0];
};

describe("ChrisFX — the author's own six graded examples (slide 2)", () => {
  it("example 1 → B (wick grab of an aged level)", () => {
    const s = onlySetup(example1());
    assert.equal(s.grade, "B");
    assert.equal(s.direction, "long");
    assert.equal(s.characteristic_1, "wick_only");
    assert.ok(s.liquidity.age_bars_before_grab > CHRIS_DEFAULTS.liquidity.fresh_max_age_bars);
  });

  it("example 2 → A++ (body grab, breaker is the leg extreme)", () => {
    const s = onlySetup(example2());
    assert.equal(s.grade, "A++");
    assert.equal(s.direction, "long");
    assert.equal(s.characteristic_1, "body_close_beyond");
    assert.equal(s.characteristic_2, true);
    assert.deepEqual(s.grade_modifiers, []);
    assert.equal(s.grab.impulsive, true);
  });

  it("example 3 → A+ (bearish, breaker is not the lowest before the up-move)", () => {
    const s = onlySetup(example3());
    assert.equal(s.grade, "A+");
    assert.equal(s.direction, "short");
    assert.equal(s.characteristic_1, "body_close_beyond");
    assert.equal(s.characteristic_2, false);
  });

  it("example 4 → A (wick grab of a fresh level)", () => {
    const s = onlySetup(example4());
    assert.equal(s.grade, "A");
    assert.equal(s.direction, "long");
    assert.equal(s.characteristic_1, "wick_only");
    assert.ok(s.liquidity.age_bars_before_grab <= CHRIS_DEFAULTS.liquidity.fresh_max_age_bars);
  });

  it("example 5 → A++ (bearish mirror of example 2)", () => {
    const s = onlySetup(example5());
    assert.equal(s.grade, "A++");
    assert.equal(s.direction, "short");
    assert.equal(s.characteristic_2, true);
    assert.deepEqual(s.grade_modifiers, []);
  });

  it("example 6 → A+ (bullish, breaker is not the highest before the down-move)", () => {
    const s = onlySetup(example6());
    assert.equal(s.grade, "A+");
    assert.equal(s.direction, "long");
    assert.equal(s.characteristic_2, false);
  });
});

describe("ChrisFX — grading modifiers", () => {
  it("a delayed reversal costs one notch (slide 38)", () => {
    const bars = example2();
    // price stays below the swept level for 5 bars before reclaiming it
    bars.splice(
      22,
      0,
      mk(97.2, 97.6, 96.9, 97.3),
      mk(97.3, 97.7, 97.0, 97.4),
      mk(97.4, 97.9, 97.1, 97.5),
      mk(97.5, 98.0, 97.2, 97.6),
    );
    const s = detectBreakers(bars, CHRIS_DEFAULTS).find((x) => x.direction === "long");
    assert.ok(s, "long setup should still be detected");
    assert.ok(s.reversal_bars > CHRIS_DEFAULTS.reversal.instant_max_bars);
    assert.ok(s.grade_modifiers.includes("delayed_reversal"));
    assert.equal(s.grade, "A+");
  });

  it("a non-impulsive body grab costs one notch", () => {
    const bars = example2();
    // same close, but the candle is mostly wick → not impulsive
    bars[21] = { ...bars[21], open: 97.6, high: 101.3, low: 97.0, close: 97.2 };
    const s = detectBreakers(bars, CHRIS_DEFAULTS).find((x) => x.direction === "long");
    assert.ok(s);
    assert.equal(s.grab.type, "body");
    assert.equal(s.grab.impulsive, false);
    assert.ok(s.grade_modifiers.includes("non_impulsive_grab"));
    assert.equal(s.grade, "A+");
  });

  it("two modifiers still cost only one notch", () => {
    const g = gradeSetup(
      { grab: { type: "body", impulsive: false }, legExtreme: true, reversalBars: 9, levelAge: 3 },
      CHRIS_DEFAULTS,
    );
    assert.equal(g.grade, "A+");
    assert.equal(g.modifiers.length, 2);
  });

  it("a body grab is clamped at A+ — A and B are wick-grab classes", () => {
    const g = gradeSetup(
      { grab: { type: "body", impulsive: false }, legExtreme: false, reversalBars: 12, levelAge: 40 },
      CHRIS_DEFAULTS,
    );
    assert.equal(g.grade, "A+");
    assert.equal(g.characteristic_1, "body_close_beyond");
    assert.deepEqual(g.modifiers, ["non_impulsive_grab", "delayed_reversal"]);
  });

  it("risk suggestion follows the author's 50k prop scale", () => {
    const risk = (grade) => CHRIS_DEFAULTS.grading.risk_per_grade[grade];
    assert.equal(risk("A++"), 500);
    assert.equal(risk("A+"), 300);
    assert.equal(risk("A"), 200);
    assert.equal(risk("B"), 100);
  });
});

describe("ChrisFX — the FVG gate", () => {
  it("no overlapping FVG → no setup (slides 19, 33, 39)", () => {
    const bars = example2();
    // flatten the impulse away so no 3-candle imbalance forms
    bars[23] = { ...bars[23], low: 99.0, high: 100.0, open: 99.4, close: 99.8 };
    bars[24] = { ...bars[24], open: 99.8, high: 100.2, low: 99.5, close: 100.0 };
    bars[25] = { ...bars[25], open: 100.0, high: 100.3, low: 99.7, close: 100.1 };
    assert.equal(detectBreakers(bars, CHRIS_DEFAULTS).length, 0);
  });

  it("the same bars pass once the FVG requirement is switched off", () => {
    const bars = example2();
    bars[23] = { ...bars[23], low: 99.0, high: 100.0, open: 99.4, close: 99.8 };
    bars[24] = { ...bars[24], open: 99.8, high: 100.2, low: 99.5, close: 100.0 };
    bars[25] = { ...bars[25], open: 100.0, high: 100.3, low: 99.7, close: 100.1 };
    const cfg = { ...CHRIS_DEFAULTS, fvg: { ...CHRIS_DEFAULTS.fvg, require: false } };
    const setups = detectBreakers(bars, cfg);
    assert.ok(setups.length >= 1);
    assert.equal(setups[0].fvg, null);
  });
});

describe("ChrisFX — primitives", () => {
  it("findLiquidityPoints marks a low below both neighbours (slide 18)", () => {
    clock = 0;
    const bars = [mk(10, 11, 9, 10), mk(10, 11, 8, 9), mk(9, 10, 8.5, 9.5)];
    const { lows } = findLiquidityPoints(bars, 1);
    assert.equal(lows.length, 1);
    assert.equal(lows[0].index, 1);
    assert.equal(lows[0].price, 8);
  });

  it("findLiquidityPoints ignores equal lows — strict comparison only", () => {
    clock = 0;
    const bars = [mk(10, 11, 9, 10), mk(10, 11, 9, 10), mk(10, 11, 9, 10)];
    assert.equal(findLiquidityPoints(bars, 1).lows.length, 0);
  });

  it("findFvgs finds both directions of a 3-candle imbalance", () => {
    clock = 0;
    const bull = [mk(10, 11, 9, 10.5), mk(10.5, 13, 10.4, 12.8), mk(12.8, 14, 12, 13.5)];
    const [g] = findFvgs(bull);
    assert.equal(g.direction, "bull");
    assert.equal(g.low, 11);
    assert.equal(g.high, 12);

    clock = 0;
    const bear = [mk(14, 15, 13, 13.5), mk(13.5, 13.6, 10.5, 10.8), mk(10.8, 11, 9, 9.5)];
    const [b] = findFvgs(bear);
    assert.equal(b.direction, "bear");
    assert.equal(b.high, 13);
    assert.equal(b.low, 11);
  });

  it("zoneFvgOverlap reports partial overlap as a share of the FVG", () => {
    const r = zoneFvgOverlap({ high: 12, low: 10 }, { high: 13, low: 11 });
    assert.equal(r.overlap, 1);
    assert.equal(r.ratio, 0.5);
    assert.equal(zoneFvgOverlap({ high: 10, low: 9 }, { high: 13, low: 11 }).overlap, 0);
  });

  it("classifyGrab separates a body close from a pinbar", () => {
    clock = 0;
    const body = mk(101, 101.2, 97, 97.2);
    const wick = mk(101, 101.2, 97, 99.5);
    assert.equal(classifyGrab(body, 98, "low", 0.8).type, "body");
    assert.equal(classifyGrab(body, 98, "low", 0.8).impulsive, true);
    assert.equal(classifyGrab(wick, 98, "low", 0.8).type, "wick");
    assert.equal(classifyGrab(wick, 98, "low", 0.8).impulsive, false);
    assert.equal(classifyGrab(body, 90, "low", 0.8), null, "level never traded through");
  });

  it("findBreakerIndex takes the most recent candle of the opposite colour", () => {
    clock = 0;
    const bars = [
      mk(100, 101, 99, 101), // bullish
      mk(101, 101, 99, 99.5), // bearish
      mk(99.5, 100, 98, 99.8), // bullish
      mk(99.8, 100, 96, 96.5), // bearish — the grab
    ];
    assert.equal(findBreakerIndex(bars, 3, "low"), 2);
    assert.equal(findBreakerIndex(bars, 3, "high"), 1);
  });

  it("isLegExtreme implements characteristic 2 in both directions", () => {
    clock = 0;
    const bars = [
      mk(100, 100.5, 99, 100), //   0
      mk(100, 101.5, 99.8, 101.2), //1 highest
      mk(101.2, 101.3, 97, 97.2), //2 the grab
    ];
    assert.equal(isLegExtreme(bars, 1, 2, "low", 10), true);
    bars[0] = { ...bars[0], high: 102 };
    assert.equal(isLegExtreme(bars, 1, 2, "low", 10), false);
  });

  it("atrAt returns null without enough history and a positive value with it", () => {
    clock = 0;
    const bars = padding(20, FLAT);
    assert.equal(atrAt(bars, 3, 14), null);
    assert.ok(atrAt(bars, 19, 14) > 0);
  });
});

describe("ChrisFX — timeframe read and reporting", () => {
  it("analyzeTimeframe returns setups plus the untaken liquidity map", () => {
    const read = analyzeTimeframe(example2(), CHRIS_DEFAULTS);
    assert.equal(read.setups.length, 1);
    assert.equal(read.setups[0].grade, "A++");
    assert.ok(read.last_price > 0);
    assert.ok(Array.isArray(read.liquidity.untaken_highs));
    assert.ok(Array.isArray(read.liquidity.untaken_lows));
  });

  it("analyzeTimeframe refuses to guess on too little data", () => {
    clock = 0;
    const read = analyzeTimeframe(padding(5, FLAT), CHRIS_DEFAULTS);
    assert.equal(read.error, "not enough bars");
  });

  it("a setup carries all three of the author's stop variants", () => {
    const s = onlySetup(example2());
    assert.ok(Number.isFinite(s.stops.beyond_zone));
    assert.ok(Number.isFinite(s.stops.beyond_invalidation));
    assert.equal(s.stops.beyond_poc, null, "POC needs the Pine pass");
    assert.ok(s.stops.beyond_invalidation <= s.stops.beyond_zone, "invalidation sits below the zone on a long");
  });

  it("compactChrisBrief keeps the setups and drops the config echo", () => {
    const brief = {
      generated_at: "2026-08-29T00:00:00.000Z",
      methodology: "ChrisFX breaker blocks — docs/CHRISFX.md",
      config_used: CHRIS_DEFAULTS,
      instruction: "x",
      symbols_scanned: [
        {
          symbol: "CME_MINI:MNQ1!",
          quote: { last: 102.7 },
          timeframes: { 5: analyzeTimeframe(example2(), CHRIS_DEFAULTS) },
          poc: { attached: 0 },
        },
      ],
    };
    const c = compactChrisBrief(brief);
    assert.equal(c.config_used, undefined);
    assert.equal(c.symbols[0].timeframes["5"].setups[0].grade, "A++");
    assert.equal(c.symbols[0].timeframes["5"].setups[0].entry_source, "zone_edge");
  });
});
