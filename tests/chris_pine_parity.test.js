/**
 * Pine port parity check.
 *
 * scripts/chrisfx_strategy.pine cannot reuse src/core/chris.js, so it re-derives
 * the same setup with different mechanics: it evaluates a candidate grab at a
 * FIXED offset behind the current bar, and it picks the NEAREST still-untouched
 * fractal rather than iterating every fractal and deduplicating afterwards.
 *
 * Those two changes are where a port silently drifts. This file transcribes the
 * Pine algorithm's index arithmetic into JS and holds it to the same six graded
 * examples as the JS detector.
 *
 * What this proves: the algorithm the Pine script implements agrees with the JS
 * reference on the author's own examples.
 * What it does NOT prove: that TradingView executes that Pine identically —
 * only running it on a chart shows that.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHRIS_DEFAULTS, detectBreakers } from "../src/core/chris.js";
import {
  GRAB_INDEX,
  extend,
  example1,
  example2,
  example3,
  example4,
  example5,
  example6,
} from "./fixtures/chris_examples.js";

const CFG = {
  liqLookback: CHRIS_DEFAULTS.liquidity.lookback,
  legLookback: CHRIS_DEFAULTS.reversal.leg_lookback_bars,
  fvgSearch: CHRIS_DEFAULTS.fvg.search_bars_after_grab,
  fvgRequired: CHRIS_DEFAULTS.fvg.require,
  atrLen: CHRIS_DEFAULTS.grab.atr_length,
  atrMult: CHRIS_DEFAULTS.grab.impulse_body_atr_mult,
  bodyRatioMin: CHRIS_DEFAULTS.grab.impulse_body_ratio,
  instantMax: CHRIS_DEFAULTS.reversal.instant_max_bars,
  freshMax: CHRIS_DEFAULTS.liquidity.fresh_max_age_bars,
};

const GRADE_NAME = ["A++", "A+", "A", "B"];

/** Pine's ta.atr(len)[offset] — Wilder-free running ATR, read at an offset. */
function atrAtOffset(bars, cur, offset, len) {
  const idx = cur - offset;
  const start = idx - len + 1;
  if (start < 1) return null;
  let sum = 0;
  for (let i = start; i <= idx; i++) {
    const prev = bars[i - 1];
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev.close),
      Math.abs(bars[i].low - prev.close),
    );
  }
  return sum / len;
}

/**
 * Line-for-line transcription of detectSetup() in scripts/chrisfx_strategy.pine.
 * `cur` is the current bar (Pine's bar_index); offsets count backwards from it.
 */
function detectSetupPine(bars, cur, E, bullish, cfg = CFG) {
  const at = (n) => bars[cur - n];
  const has = (n) => cur - n >= 0 && cur - n < bars.length;

  let gradeIdx = -1;
  let level = null;
  let zoneHigh = null;
  let zoneLow = null;
  let inval = null;

  // 1. the liquidity level this bar took
  const grabExtreme = bullish ? at(E).low : at(E).high;
  let fIdx = -1;
  let fLvl = null;
  let running = bullish ? 1e20 : -1e20;
  for (let f = E + 1; f <= E + cfg.liqLookback; f++) {
    if (!has(f + 1)) break;
    const isFrac = bullish
      ? at(f).low < at(f + 1).low && at(f).low < at(f - 1).low
      : at(f).high > at(f + 1).high && at(f).high > at(f - 1).high;
    if (isFrac && fIdx === -1) {
      const p = bullish ? at(f).low : at(f).high;
      const untaken = bullish ? running >= p : running <= p;
      const taken = bullish ? grabExtreme < p : grabExtreme > p;
      if (untaken && taken) {
        fIdx = f;
        fLvl = p;
      }
    }
    running = bullish ? Math.min(running, at(f).low) : Math.max(running, at(f).high);
  }

  // 2. the breaker candle
  let bIdx = -1;
  if (fIdx > 0) {
    for (let b = E + 1; b <= E + cfg.legLookback * 2; b++) {
      if (!has(b)) break;
      if (bIdx === -1) {
        const rightColour = bullish ? at(b).close > at(b).open : at(b).close < at(b).open;
        if (rightColour) bIdx = b;
      }
    }
  }

  if (bIdx > 0) {
    zoneHigh = at(bIdx).high;
    zoneLow = at(bIdx).low;

    // 3. characteristic 2
    let legExtreme = true;
    for (let i = E + 1; i <= E + cfg.legLookback; i++) {
      if (!has(i) || i === bIdx) continue;
      const beats = bullish ? at(i).high > at(bIdx).high : at(i).low < at(bIdx).low;
      if (beats) legExtreme = false;
    }

    // 4. characteristic 1
    const g = at(E);
    const bodyGrab = bullish ? g.close < fLvl : g.close > fLvl;
    const bodyLen = Math.abs(g.close - g.open);
    const rng = g.high - g.low;
    const bodyRat = rng > 0 ? bodyLen / rng : 0;
    const atrV = atrAtOffset(bars, cur, E, cfg.atrLen);
    const impulsive =
      bodyRat >= cfg.bodyRatioMin && (atrV === null || atrV <= 0 || bodyLen >= cfg.atrMult * atrV);

    // 5. how quickly the level was reclaimed
    let rIdx = -1;
    for (let r = E - 1; r >= 0; r--) {
      if (rIdx === -1) {
        const back = bullish ? at(r).close > fLvl : at(r).close < fLvl;
        if (back) rIdx = r;
      }
    }

    // 6. point of invalidation
    const invEnd = rIdx >= 0 ? rIdx : 0;
    inval = bullish ? at(E).low : at(E).high;
    for (let i = invEnd; i <= E; i++) {
      inval = bullish ? Math.min(inval, at(i).low) : Math.max(inval, at(i).high);
    }

    // 7. the FVG gate
    let hasFvg = false;
    const mLo = Math.max(1, E - cfg.fvgSearch);
    for (let m = E + 1; m >= mLo; m--) {
      if (!has(m + 1) || !has(m - 1)) continue;
      let gLow = null;
      let gHigh = null;
      if (bullish) {
        if (at(m - 1).low > at(m + 1).high) {
          gLow = at(m + 1).high;
          gHigh = at(m - 1).low;
        }
      } else if (at(m - 1).high < at(m + 1).low) {
        gLow = at(m - 1).high;
        gHigh = at(m + 1).low;
      }
      if (gLow !== null) {
        const ov = Math.min(zoneHigh, gHigh) - Math.max(zoneLow, gLow);
        if (ov > 0) hasFvg = true;
      }
    }

    // 8. grade
    if (hasFvg || !cfg.fvgRequired) {
      if (bodyGrab) {
        gradeIdx = legExtreme ? 0 : 1;
        const delayed = rIdx === -1 || E - rIdx > cfg.instantMax;
        if ((!impulsive || delayed) && gradeIdx === 0) gradeIdx = 1;
      } else {
        const age = fIdx - E;
        gradeIdx = age <= cfg.freshMax ? 2 : 3;
      }
      level = fLvl;
    }
  }

  return { gradeIdx, grade: GRADE_NAME[gradeIdx] ?? null, level, zoneHigh, zoneLow, inval };
}

/** Evaluate an example the way the Pine strategy would, at the right moment. */
function pineRead(builder, name) {
  const E = CFG.fvgSearch + 1;
  const grabIdx = GRAB_INDEX[name];
  const bars = extend(builder(), E + 2);
  const cur = grabIdx + E;
  return {
    long: detectSetupPine(bars, cur, E, true),
    short: detectSetupPine(bars, cur, E, false),
  };
}

const CASES = [
  ["example1", example1, "B", "long"],
  ["example2", example2, "A++", "long"],
  ["example3", example3, "A+", "short"],
  ["example4", example4, "A", "long"],
  ["example5", example5, "A++", "short"],
  ["example6", example6, "A+", "long"],
];

describe("Pine port — grades match the author's labels", () => {
  for (const [name, builder, expected, side] of CASES) {
    it(`${name} → ${expected} (${side})`, () => {
      const read = pineRead(builder, name);
      assert.equal(read[side].grade, expected, `${name} ${side} read`);
    });
  }
});

describe("Pine port — agrees with the JS detector", () => {
  for (const [name, builder, expected, side] of CASES) {
    it(`${name}: Pine and JS agree on grade, zone and invalidation`, () => {
      const js = detectBreakers(builder(), CHRIS_DEFAULTS);
      assert.equal(js.length, 1, "the JS detector should find exactly one setup");
      const pine = pineRead(builder, name)[side];

      assert.equal(pine.grade, js[0].grade, "grade");
      assert.equal(pine.zoneHigh, js[0].breaker.zone_high, "zone high");
      assert.equal(pine.zoneLow, js[0].breaker.zone_low, "zone low");
      assert.equal(pine.level, js[0].liquidity.level, "liquidity level");
      assert.equal(pine.inval, js[0].invalidation, "point of invalidation");
      assert.equal(expected, js[0].grade, "and both match the author's own label");
    });
  }
});

describe("Pine port — the opposite side stays silent", () => {
  for (const [name, builder, , side] of CASES) {
    it(`${name}: no setup on the ${side === "long" ? "short" : "long"} side`, () => {
      const other = side === "long" ? "short" : "long";
      assert.equal(pineRead(builder, name)[other].gradeIdx, -1);
    });
  }
});
