/**
 * Unit tests for the Accettone liquidity-block engine (src/core/marco.js).
 * Pure fixtures — no TradingView needed. The scenarios assert the state
 * machine documented in docs/MARCO.md §§2–4 with compact calibrations.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCO_DEFAULTS,
  buildLiquidityMap,
  storyRead,
  h4Model,
  htfContext,
  analyzeMarco,
} from "../src/core/marco.js";

const CFG = {
  ...MARCO_DEFAULTS,
  pivot_len: 1,
  atr_length: 3,
  confirm_bars: 2,
  min_touches: 2,
  min_level_age: 50,
};

function mkBars(rows, { start = 1756200000, step = 900 } = {}) {
  return rows.map(([o, h, l, c], i) => ({
    time: start + i * step,
    open: o,
    high: h,
    low: l,
    close: c,
  }));
}

// Uptrend leaves a low; a later bar spikes through it and closes back above.
const SWEEP_RECLAIM = [
  [101, 102, 100.8, 101.5],
  [101.5, 102, 100.0, 101.0], // pivot low 100.0
  [101, 103, 100.5, 102.5], // level registered here
  [102.5, 103.5, 101.5, 103],
  [103, 103.6, 99.5, 102.8], // sweep + same-bar reclaim → bullish LB
  [102.8, 103.2, 100.4, 101.9],
];

test("sweep + reclaim creates a bullish LB at the excursion", () => {
  const map = buildLiquidityMap(mkBars(SWEEP_RECLAIM), CFG);
  assert.equal(map.blocks.length, 1);
  const blk = map.blocks[0];
  assert.equal(blk.side, "bull");
  assert.equal(blk.top, 100.0);
  assert.equal(blk.bot, 99.5);
  assert.equal(blk.born, 4);
  assert.equal(blk.qualified, false); // single touch, young level
  assert.ok(map.events.some((e) => e.type === "low_swept" && e.bar === 4));
  assert.ok(map.events.some((e) => e.type === "bull_lb_created" && e.bar === 4));
});

test("the sweep extreme registers no new liquidity (holds none)", () => {
  const map = buildLiquidityMap(mkBars(SWEEP_RECLAIM), CFG);
  assert.ok(!map.levels.lows.some((l) => l.price === 99.5));
});

test("no reclaim within confirm_bars → breakdown, no LB", () => {
  const rows = [
    [101, 102, 100.8, 101.5],
    [101.5, 102, 100.0, 101.0],
    [101, 103, 100.5, 102.5],
    [102.5, 103.5, 101.5, 103],
    [103, 103.2, 99.5, 99.6], // sweep, fails to reclaim
    [99.6, 99.8, 99.0, 99.2],
    [99.2, 99.5, 98.8, 99.0], // miss > confirm_bars → abandoned
    [99, 99.3, 98.5, 98.9],
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks.length, 0);
  assert.ok(map.events.some((e) => e.type === "low_breakdown"));
});

test("equal lows build up and qualify the LB that sweeps them", () => {
  const rows = [
    [101, 102, 100.9, 101.5],
    [101.5, 101.8, 100.0, 101.2], // pivot low 100.0
    [101.2, 102.5, 100.6, 102.2],
    [102.2, 102.6, 100.05, 101.8], // pivot low 100.05 → merges (equal)
    [101.8, 102.8, 100.7, 102.5],
    [102.5, 103, 99.6, 102.0], // sweeps the build-up → qualified LB
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.ok(map.events.some((e) => e.type === "low_buildup" && e.touches === 2));
  assert.equal(map.blocks.length, 1);
  assert.equal(map.blocks[0].qualified, true);
  assert.equal(map.blocks[0].sweptTouches, 2);
});

test("close beyond the LB extreme invalidates the zone", () => {
  const rows = [...SWEEP_RECLAIM, [101.9, 102, 98.9, 99.2]];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks.length, 1);
  assert.equal(map.blocks[0].dead, true);
  assert.equal(map.blocks[0].death, "invalidated");
  assert.equal(map.blocks[0].tapped, false);
});

test("a return into the zone marks the first tap", () => {
  const rows = [...SWEEP_RECLAIM, [101.9, 102.3, 99.9, 101.5]];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  const blk = map.blocks[0];
  assert.equal(blk.tapped, true);
  assert.equal(blk.tappedAt, 6);
  assert.equal(blk.dead, false);
});

test("bearish mirror: swept high becomes a bearish LB", () => {
  const rows = [
    [103, 103.2, 102, 102.5],
    [102.5, 104.0, 102, 102.8], // pivot high 104.0
    [102.8, 103.5, 101, 101.5],
    [101.5, 102.5, 100.5, 101],
    [101, 104.5, 100.4, 101.2], // sweeps the high, closes back below
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks.length, 1);
  const blk = map.blocks[0];
  assert.equal(blk.side, "bear");
  assert.equal(blk.bot, 104.0);
  assert.equal(blk.top, 104.5);
});

test("story: recent bullish LB reads as a buy story", () => {
  const bars = mkBars(SWEEP_RECLAIM);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.match(story.read, /longs at the bullish LB 99\.5–100/);
});

test("story: an invalidated LB reads as a failed trap, not a buy story", () => {
  const bars = mkBars([...SWEEP_RECLAIM, [101.9, 102, 98.9, 99.2]]);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "down_continuation");
  assert.match(story.read, /trap failed/);
});

test("story: both sides intact with no runs is no-man's land", () => {
  const rows = [
    [105, 106, 104, 105],
    [105, 105.5, 100, 105.2], // pivot low 100
    [105.2, 110, 104.8, 105.5], // pivot high 110
    [105.5, 106, 104.9, 105.1],
    [105.1, 105.8, 104.7, 105.0],
  ];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "no_mans_land");
  assert.equal(story.nearest.low.price, 100);
  assert.equal(story.nearest.high.price, 110);
});

// --- the 10 a.m. reversal gate -------------------------------------------
// 2026-08-27 is an EDT date: 06:00 ET = 10:00 UTC.

function nyBars({ endUtcHour, endUtcMinute = 45, sweepLowAt10 = true }) {
  const rows = [];
  const startSec = Date.UTC(2026, 7, 27, 9, 0) / 1000;
  const endSec = Date.UTC(2026, 7, 27, endUtcHour, endUtcMinute) / 1000;
  for (let t = startSec; t <= endSec; t += 900) {
    const utcH = new Date(t * 1000).getUTCHours();
    if (utcH < 10) rows.push({ time: t, open: 105, high: 109, low: 101, close: 105 });
    else if (utcH < 14) rows.push({ time: t, open: 105, high: 110, low: 100, close: 105 });
    else if (utcH === 14 && sweepLowAt10 && new Date(t * 1000).getUTCMinutes() === 0)
      rows.push({ time: t, open: 105, high: 106, low: 99.5, close: 104 });
    else rows.push({ time: t, open: 104, high: 106, low: 103, close: 105 });
  }
  return rows;
}

test("h4 model: prev H4 low taken after 10:00 ET activates longs", () => {
  const h4 = h4Model(nyBars({ endUtcHour: 14 }), MARCO_DEFAULTS);
  assert.equal(h4.available, true);
  assert.equal(h4.h4_high, 110);
  assert.equal(h4.h4_low, 100);
  assert.equal(h4.phase, "active");
  assert.match(h4.longs, /^ACTIVE/);
  assert.match(h4.shorts, /^waiting/);
});

test("h4 model: still inside 06:00–10:00 ET reads as forming", () => {
  const h4 = h4Model(nyBars({ endUtcHour: 13 }), MARCO_DEFAULTS);
  assert.equal(h4.phase, "forming");
});

test("h4 model: daily bars are rejected", () => {
  const bars = mkBars(
    [
      [1, 2, 0.5, 1.5],
      [1.5, 2.5, 1, 2],
      [2, 3, 1.5, 2.5],
    ],
    { step: 86400 },
  );
  assert.equal(h4Model(bars, MARCO_DEFAULTS).available, false);
});

test("zones thinner than min_zone_atr are flagged thin; deep sweeps are not", () => {
  const thinMap = buildLiquidityMap(mkBars(SWEEP_RECLAIM), CFG); // height 0.5 < 0.25*ATR
  assert.equal(thinMap.blocks[0].thin, true);

  const deep = SWEEP_RECLAIM.map((r) => [...r]);
  deep[4] = [103, 103.6, 99.0, 102.8]; // sweep a full point deep
  const deepMap = buildLiquidityMap(mkBars(deep), CFG);
  assert.equal(deepMap.blocks[0].thin, false);
});

test("story: a thin-zone story warns to refine the entry", () => {
  const bars = mkBars(SWEEP_RECLAIM);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.match(story.read, /zone too thin/);
});

test("story: a trap older than story_fresh_bars reads as stale", () => {
  const quiet = Array.from({ length: 20 }, () => [102, 103, 101.5, 102.5]);
  const bars = mkBars([...SWEEP_RECLAIM, ...quiet]);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.equal(story.fresh, false);
  assert.match(story.read, /stale — the trap is \d+ bars old/);
});

test("analyzeMarco reports the stop buffered past the zone extreme", () => {
  const read = analyzeMarco(mkBars(SWEEP_RECLAIM.concat(SWEEP_RECLAIM)), CFG);
  const bull = read.blocks.find((b) => b.side === "bull");
  assert.ok(bull);
  assert.ok(bull.stop_beyond < bull.zone[0]);
});

test("htfContext alerts near an HTF zone and stays quiet far away", () => {
  const htfBars = mkBars(SWEEP_RECLAIM.concat(SWEEP_RECLAIM), { step: 14400 });
  const near = htfContext(htfBars, 100.2, CFG);
  assert.equal(near.available, true);
  assert.ok(near.zones.length >= 1);
  assert.match(near.alert, /HTF bullish LB/);

  const far = htfContext(htfBars, 130, CFG);
  assert.equal(far.alert, null);

  assert.equal(htfContext(mkBars([[1, 2, 0.5, 1.5]]), 1, CFG).available, false);
});

test("analyzeMarco wires story, blocks, levels and the gate together", () => {
  const small = analyzeMarco(mkBars([[1, 2, 0.5, 1.5]]), CFG);
  assert.ok(small.error);

  const full = analyzeMarco(mkBars(SWEEP_RECLAIM.concat(SWEEP_RECLAIM)), CFG);
  assert.ok(full.bars_analyzed >= 10);
  assert.ok(full.story.mode);
  assert.ok(Array.isArray(full.blocks));
  assert.ok(full.h4_model);
});
