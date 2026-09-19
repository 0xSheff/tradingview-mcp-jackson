/**
 * Unit tests for the Accettone liquidity-block engine (src/core/marco.js).
 * Pure fixtures — no TradingView needed. The scenarios assert the state
 * machine documented in docs/MARCO.md §§2–4 with compact calibrations.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARCO_DEFAULTS,
  buildLiquidityMap,
  storyRead,
  h4Model,
  htfContext,
  analyzeMarco,
  triggerSetups,
  resolveBias,
  seedFromMap,
  clusterTargets,
  intraweekLayer,
  atrSeries,
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

// The same story twice. The second run goes a tick deeper (99.4): under the
// trade-beyond rule an equal low takes nothing, and the first zone's top
// (100.0, a pivot inside the zone within eq_tolerance of 99.5) is a respect
// that retires the zone into a x2 level — the second run sweeps that level.
// A wick 1.5 under the zone's extreme — beyond eq_tolerance, so this is a
// plain invalidation, not a deepened run (E1, 2026-09-14).
const INVALIDATE_DEEP = [101.9, 102, 98.0, 99.2];

const SWEEP_RECLAIM_TWICE = SWEEP_RECLAIM.concat(
  SWEEP_RECLAIM.map((r, i) => (i === 4 ? [103, 103.6, 99.4, 102.8] : r)),
);

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
  const rows = [...SWEEP_RECLAIM, INVALIDATE_DEEP];
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
  const bars = mkBars([...SWEEP_RECLAIM, INVALIDATE_DEEP]);
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
  const read = analyzeMarco(mkBars(SWEEP_RECLAIM_TWICE), CFG);
  const bull = read.blocks.find((b) => b.side === "bull");
  assert.ok(bull);
  assert.ok(bull.stop_beyond < bull.zone[0]);
});

test("an invalidated LB's extreme is swept liquidity: reclaim → new LB", () => {
  const rows = [
    ...SWEEP_RECLAIM,
    INVALIDATE_DEEP, // trade 1.5 below 99.5 → invalidated, pending opens against the extreme
    [99.2, 100.5, 98.8, 100.2], // reclaim above 99.5 → LB at the new extreme
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks.length, 2);
  const nb = map.blocks[1];
  assert.equal(nb.side, "bull");
  assert.equal(nb.top, 99.5);
  assert.equal(nb.bot, 98.0);
  assert.equal(nb.born, 7);
  assert.ok(map.events.some((e) => e.type === "low_swept" && e.from_lb));
});

test("low respecting low: a higher low within respect tolerance is a touch", () => {
  const rows = [
    [101, 102, 100.9, 101.5],
    [101.5, 101.8, 100.0, 101.2], // pivot low 100.0
    [101.2, 102.5, 101.3, 102.2],
    [102.2, 102.6, 100.9, 101.8], // pivot low 100.9 — beyond equal tol, inside respect tol
    [101.8, 102.8, 101.4, 102.5],
    [102.5, 103, 99.6, 102.0], // sweep + reclaim → qualified by the respect touch
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.ok(map.events.some((e) => e.type === "low_buildup" && e.respect === true && e.level === 100.0));
  assert.equal(map.blocks.length, 1);
  assert.equal(map.blocks[0].qualified, true);
  assert.equal(map.blocks[0].top, 100.0);
});

test("a higher low beyond respect tolerance is its own level", () => {
  const rows = [
    [101, 102, 100.9, 101.5],
    [101.5, 101.8, 100.0, 101.2], // pivot low 100.0
    [101.2, 103.5, 102.6, 103.2],
    [103.2, 103.6, 102.0, 103.0], // pivot low 102.0 — two points above, too far to "respect"
    [103.0, 104.0, 102.8, 103.8],
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.levels.lows.length, 2);
  assert.ok(map.levels.lows.every((l) => l.touches === 1));
});

test("triggers: confirmed low → stop under the nearest LB → target → RR", () => {
  const rows = [
    ...SWEEP_RECLAIM, // bull LB 99.5–100 alive
    [101.9, 102.2, 100.2, 101.6], // pivot low 100.2 above the zone
    [101.6, 103.4, 101.0, 103.1], // level 100.2 registered; pivot high 103.4 (stays intact)
    [103.1, 103.2, 102.5, 103.0],
  ];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  const trig = triggerSetups(map, bars, CFG, { direction: 1 });
  assert.equal(trig.length, 2); // the sweep trigger and the zone tap, nearest first
  assert.equal(trig[0].kind, "sweep");
  assert.equal(trig[0].side, "long");
  assert.equal(trig[0].trigger, 100.2);
  assert.deepEqual(trig[0].stop_anchor, [99.5, 100]);
  assert.ok(trig[0].stop < 99.5);
  assert.equal(trig[1].kind, "tap");
  assert.equal(trig[1].trigger, 100); // entry at the zone's inner edge
  assert.ok(trig[1].stop < 99.5);
  // 103.4 "respects" the earlier 103.6 high → one level with two touches
  assert.equal(trig[0].target, 103.6);
  assert.equal(map.levels.highs[0].touches, 2);
  assert.ok(trig[0].rr > 1);
  assert.equal(trig[0].confirmed, false);

  const far = triggerSetups(map, bars, CFG, { direction: 1, target: 110 });
  assert.equal(far[0].target, 110);
  assert.deepEqual(triggerSetups(map, bars, CFG, { direction: 0 }), []);
});

test("resolveBias: aligned targets the weekly build-up; divergence trades the daily counter-trend", () => {
  const w = {
    direction: 1, mode: "buy_story", read: "w",
    intact_above: [{ price: 120, touches: 1, buildup: false }, { price: 130, touches: 2, buildup: true }],
    intact_below: [], lb: { zone: [90, 95], alive: true },
  };
  const dAligned = { direction: 1, mode: "up_continuation", read: "d", intact_above: [{ price: 105, touches: 1, buildup: false }], intact_below: [], lb: null };
  const a = resolveBias(w, dAligned);
  assert.equal(a.regime, "aligned");
  assert.equal(a.bias, 1);
  assert.equal(a.primary_target, 130);
  assert.deepEqual(a.invalidation, { level: 90, rule: "weekly close below" });

  const dAgainst = {
    direction: -1, mode: "sell_story", read: "d", intact_above: [],
    intact_below: [{ price: 98, touches: 1, buildup: false }, { price: 92, touches: 1, buildup: false }, { price: 80, touches: 1, buildup: false }],
    lb: { zone: [104, 106], alive: true },
  };
  // a daily trap against a LIVE weekly story is inducement → pullback, weekly leads
  const live = resolveBias({ ...w, fresh: true }, dAgainst);
  assert.equal(live.regime, "pullback");
  assert.equal(live.bias, 1);
  assert.equal(live.primary_target, 130);

  // only a stale weekly story yields to the daily as counter-trend
  const c = resolveBias({ ...w, fresh: false }, dAgainst);
  assert.equal(c.regime, "counter_trend");
  assert.equal(c.bias, -1);
  assert.equal(c.primary_target, 98);
  assert.equal(c.targets.length, 2);
  assert.deepEqual(c.invalidation, { level: 106, rule: "daily close above" });

  const wNone = { ...w, direction: 0, mode: "no_mans_land", lb: null };
  assert.equal(resolveBias(wNone, dAgainst).regime, "daily_only");
  assert.equal(resolveBias(wNone, { ...dAligned, direction: 0, mode: "no_mans_land" }).regime, "no_bias");

  // daily continuation against a weekly trap = pullback, weekly still leads
  const dPull = { ...dAligned, direction: -1, mode: "down_continuation" };
  const p = resolveBias(w, dPull);
  assert.equal(p.regime, "pullback");
  assert.equal(p.bias, 1);
  assert.equal(p.primary_target, 130);

  // two continuations without a trap never make a counter-trend case
  const wCont = { ...w, direction: -1, mode: "down_continuation", lb: null };
  const dCont = { ...dAligned, direction: 1, mode: "up_continuation" };
  assert.equal(resolveBias(wCont, dCont).regime, "no_bias");
});

test("a known bias sorts zones into entries and false-reaction origins", () => {
  const bars = mkBars(SWEEP_RECLAIM_TWICE); // one alive bull LB below price
  const withBias = analyzeMarco(bars, CFG, { bias: 1 });
  assert.equal(withBias.bias_used, 1);
  assert.equal(withBias.blocks[0].role, "entry");
  assert.deepEqual(withBias.false_reactions, []);

  const against = analyzeMarco(bars, CFG, { bias: -1 });
  assert.equal(against.blocks[0].role, "pullback_origin");
  assert.equal(against.false_reactions.length, 1);
  assert.equal(against.false_reactions[0].side, "bull");
  assert.match(against.false_reactions[0].note, /false bullish reaction/);
  assert.ok(against.triggers.every((t) => t.side === "short"));
});

test("htfContext alerts near an HTF zone and stays quiet far away", () => {
  const htfBars = mkBars(SWEEP_RECLAIM_TWICE, { step: 14400 });
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

  const full = analyzeMarco(mkBars(SWEEP_RECLAIM_TWICE), CFG);
  assert.ok(full.bars_analyzed >= 10);
  assert.ok(full.story.mode);
  assert.ok(Array.isArray(full.blocks));
  assert.ok(full.h4_model);
});

// --- inducement: an LB never sets the story by itself (docs/MARCO.md §3) ---

// V1 (GIYrW7FC06M 4:24–6:04) on Gold 15m: build-up lows run and reclaimed
// (qualified bull LB), then the rally leaves a single-touch high that a spike
// runs and reclaims — a by-the-book bearish LB on the wrong side of the story.
const V1_BUILDUP_THEN_RALLY = [
  [101, 102, 100.9, 101.5],
  [101.5, 101.8, 100.0, 101.2], // pivot low 100.0
  [101.2, 102.5, 100.6, 102.2],
  [102.2, 102.6, 100.05, 101.8], // pivot low 100.05 → equal → build-up
  [101.8, 102.8, 100.7, 102.5],
  [102.5, 103, 99.0, 102.0], // sweep + reclaim → qualified bull LB 99–100 (bar 5)
  [102.0, 104.0, 101.8, 103.8],
  [103.8, 105.0, 103.5, 104.6], // pivot high 105.0 — an internal point of the leg
  [104.6, 104.8, 103.9, 104.2],
  [104.2, 104.5, 103.6, 104.0], // pivot low 103.6 — internal point
];
const V1_INDUCEMENT = [
  ...V1_BUILDUP_THEN_RALLY,
  [104.0, 106.0, 103.8, 104.4], // spike runs 105.0 and closes back → bear LB 105–106 (bar 10), single touch
  [104.4, 104.9, 103.7, 103.9], // the false reaction
];

test("inducement: an unqualified LB against a live qualified one is flagged and does not flip the story", () => {
  const bars = mkBars(V1_INDUCEMENT);
  const map = buildLiquidityMap(bars, CFG);
  assert.equal(map.blocks.length, 2);
  const [bull, bear] = map.blocks;
  assert.equal(bull.qualified, true);
  assert.equal(bull.inducement, false);
  assert.equal(bear.side, "bear");
  assert.equal(bear.qualified, false);
  assert.equal(bear.inducement, true);
  assert.ok(map.events.some((e) => e.type === "bear_lb_created" && e.inducement));

  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.equal(story.direction, 1);
  assert.deepEqual(story.lb.zone, [99, 100]);
  assert.deepEqual(story.inducement, { side: "bear", zone: [105, 106], alive: true, left: null });
  assert.match(story.read, /bearish LB 105–106 created 1 bar ago is inducement/);

  const read = analyzeMarco(bars, CFG);
  assert.equal(read.bias_used, 1);
  assert.equal(read.blocks.find((b) => b.side === "bull").role, "entry");
  const falseZone = read.blocks.find((b) => b.side === "bear");
  assert.equal(falseZone.role, "pullback_origin");
  assert.equal(falseZone.inducement, true);
  assert.equal(read.false_reactions.length, 1);
  assert.equal(read.false_reactions[0].inducement, true);
  assert.match(read.false_reactions[0].note, /inducement/);
});

test("an inducement zone that gets run through reads as spent, and the story still holds", () => {
  const bars = mkBars([
    ...V1_INDUCEMENT,
    [103.9, 106.5, 103.8, 106.2], // closes above the bear zone top → invalidated ("buy back up")
  ]);
  const map = buildLiquidityMap(bars, CFG);
  assert.equal(map.blocks.find((b) => b.side === "bear").dead, true);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.equal(story.inducement.alive, false);
  assert.match(story.read, /was inducement .* already run through, the story never flipped/);
});

test("a qualified LB on the other side (build-up run) still flips the story", () => {
  const rows = [
    ...V1_BUILDUP_THEN_RALLY.slice(0, 9),
    [104.2, 104.95, 103.8, 104.5], // pivot high 104.95 → equal to 105.0 → build-up
    [104.5, 104.7, 103.9, 104.3],
    [104.3, 106.0, 104.1, 104.4], // runs the build-up and closes back → qualified bear LB
  ];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  const bear = map.blocks.find((b) => b.side === "bear");
  assert.equal(bear.qualified, true);
  assert.equal(bear.inducement, false);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "sell_story");
  assert.equal(story.direction, -1);
  assert.equal(story.inducement, null);
});

test("an internal low consumed while the qualified LB holds is inducement, not continuation", () => {
  const rows = [
    ...V1_INDUCEMENT.slice(0, 11), // through the bear inducement LB (bar 10)
    [104.4, 104.9, 103.2, 103.4], // runs the internal low 103.6, no reclaim
    [103.4, 103.8, 103.0, 103.3],
    [103.3, 103.7, 102.9, 103.2], // miss 3 > confirm_bars → low_breakdown, unqualified
  ];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  const brk = map.events.find((e) => e.type === "low_breakdown");
  assert.ok(brk);
  assert.equal(brk.qualified, false);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.match(story.read, /low 103\.6 consumed .* was an internal point: inducement/);
});

test("a live qualified LB anchors the story past story_lookback (V1: 68 bars at the tap)", () => {
  const quiet = Array.from({ length: 12 }, () => [102, 103, 101.5, 102.5]);
  const bars = mkBars([...V1_BUILDUP_THEN_RALLY.slice(0, 6), ...quiet]);
  const cfg = { ...CFG, story_lookback: 8 };
  const map = buildLiquidityMap(bars, cfg);
  const story = storyRead(map, bars, cfg);
  assert.equal(story.mode, "buy_story");
  assert.match(story.read, /longs at the bullish LB 99–100/);
  // an unqualified LB alone does not anchor: the plain sweep fixture goes quiet into no-man's land
  const plain = mkBars([...SWEEP_RECLAIM, ...quiet]);
  assert.equal(storyRead(buildLiquidityMap(plain, cfg), plain, cfg).mode, "no_mans_land");
});

// --- build-ups: the local target survives its own sweep (docs/MARCO.md §2.1) ---

// MNQ 1h, 31 Aug – 1 Sep 2026 in miniature: equal highs tapped three times
// ("high respecting high"), then a spike runs them and closes back below.
const QUIET6 = Array.from({ length: 6 }, () => [101, 101.6, 100.9, 101.3]); // no pivots, just bar count
const EQUAL_HIGHS_X3 = [
  ...QUIET6,
  [101, 102, 100.9, 101.5],
  [101.5, 103.0, 101.2, 102.4], // pivot high 103.0
  [102.4, 102.6, 101.8, 102.2],
  [102.2, 102.98, 101.9, 102.5], // pivot high 102.98 → equal (at/below the first) → build-up x2
  [102.5, 102.7, 101.7, 102.0],
  [102.0, 102.95, 101.6, 102.3], // pivot high 102.95 → x3
  [102.3, 102.5, 101.5, 102.1],
];
const EQUAL_HIGHS_SWEPT = [
  ...EQUAL_HIGHS_X3,
  [102.1, 103.6, 101.9, 102.4], // runs 103.0, closes back → qualified bear LB; the build-up is swept
];

test("an intact build-up spans the equal extremes and counts its taps", () => {
  const bars = mkBars(EQUAL_HIGHS_X3);
  const map = buildLiquidityMap(bars, CFG);
  assert.equal(map.buildups.length, 1);
  const bu = map.buildups[0];
  assert.equal(bu.side, "high");
  assert.equal(bu.touches, 3);
  assert.equal(bu.price, 103.0);
  assert.equal(bu.near, 102.95);
  assert.equal(bu.swept, null);
  const read = analyzeMarco(bars, CFG);
  assert.deepEqual(read.liquidity.buildups[0], {
    side: "high",
    zone: [102.95, 103],
    touches: 3,
    status: "intact",
    age_bars: 5,
    swept_bars_ago: null,
    lb: null,
  });
});

test("a swept build-up stays on the map, linked to the LB its run created", () => {
  const bars = mkBars(EQUAL_HIGHS_SWEPT);
  const map = buildLiquidityMap(bars, CFG);
  const bu = map.buildups[0];
  assert.equal(bu.swept, 13);
  assert.equal(bu.sweptExt, 103.6);
  const lb = map.blocks[bu.lb];
  assert.equal(lb.side, "bear");
  assert.equal(lb.qualified, true);
  assert.equal(lb.buildup, 0);
  assert.ok(map.events.some((e) => e.type === "high_swept" && e.buildup === 0 && e.touches === 3));

  const read = analyzeMarco(bars, CFG);
  const out = read.liquidity.buildups[0];
  assert.equal(out.status, "swept");
  assert.equal(out.swept_bars_ago, 0);
  assert.deepEqual(out.lb, [103, 103.6]);
  assert.equal(read.story.mode, "sell_story");
  assert.match(read.story.read, /the x3 build-up at 103 was the local target, now taken/);
});

// --- bias source: trap (default) / draw / off (docs/MARCO.md §3) ---

test("draw: the side with more intact build-up fuel is the lean; no trap yet means no story", () => {
  const bars = mkBars(EQUAL_HIGHS_X3); // a x3 build-up above price, nothing below
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.draw.direction, 1);
  assert.equal(story.draw.fuel_above, 3);
  assert.equal(story.draw.fuel_below, 0);
  assert.equal(story.draw.activated, false);
  assert.match(story.draw.read, /draw up .* no trap yet/);
});

test("draw is activated by a trap on the other side; bias_source and an explicit bias pick the roles", () => {
  // build-up lows run and reclaimed (bull anchor) + equal highs left intact above
  const bars = mkBars([...V1_BUILDUP_THEN_RALLY.slice(0, 6), ...EQUAL_HIGHS_X3.slice(6)]);
  const map = buildLiquidityMap(bars, CFG);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.direction, 1);
  assert.equal(story.draw.direction, 1);
  assert.equal(story.draw.fuel_above, 4);
  assert.equal(story.draw.activated, true);
  assert.match(story.draw.read, /activated/);

  const viaTrap = analyzeMarco(bars, CFG);
  assert.equal(viaTrap.bias_used, 1);
  assert.equal(viaTrap.bias_source, "trap");

  const viaDraw = analyzeMarco(bars, { ...CFG, bias_source: "draw" });
  assert.equal(viaDraw.bias_used, 1);
  assert.equal(viaDraw.bias_source, "draw");

  const off = analyzeMarco(bars, { ...CFG, bias_source: "off" });
  assert.equal(off.bias_used, 0);
  assert.equal(off.bias_source, "off");
  assert.ok(off.blocks.every((b) => b.role === null));
  assert.deepEqual(off.false_reactions, []);
  assert.deepEqual(off.triggers, []);

  const manualOff = analyzeMarco(bars, CFG, { bias: 0 }); // --bias off
  assert.equal(manualOff.bias_used, 0);
  assert.equal(manualOff.bias_source, "explicit");
  const manualShort = analyzeMarco(bars, { ...CFG, bias_source: "off" }, { bias: -1 }); // --bias short
  assert.equal(manualShort.bias_used, -1);
  assert.equal(manualShort.blocks.find((b) => b.side === "bull").role, "pullback_origin");
});

test("resolveBias speaks in the given senior/junior names (intraweek stack)", () => {
  const senior = {
    direction: 1, mode: "buy_story", read: "d", fresh: true,
    targets_above: [{ price: 105, touches: 2, buildup: true }], targets_below: [],
    intact_above: [], intact_below: [], lb: { zone: [99, 100], alive: true },
  };
  const junior = {
    direction: -1, mode: "sell_story", read: "h4", targets_above: [], targets_below: [],
    intact_above: [], intact_below: [], lb: null,
  };
  const b = resolveBias(senior, junior, { senior: "daily", junior: "4h" });
  assert.equal(b.regime, "pullback");
  assert.match(b.note, /4h bearish trap against a live daily buy story/);
  assert.equal(b.invalidation.rule, "daily close below");
});

// ---------------------------------------------------------------------------
// 2026-09-06 (user, 6B 1.3474 review): liquidity outlives the zone, the zone
// is not the liquidity, and a stab into a pocket is not a trap.

test("a trade beyond the LB extreme invalidates the zone even when the bar closes back inside; the extreme is swept liquidity", () => {
  // the zone is older than confirm_bars here, so the wick is a plain
  // invalidation (the fresh-zone case is the deepened run, E1 — next tests)
  const filler = [
    [101.9, 102.3, 100.6, 101.7],
    [101.7, 102.2, 100.7, 101.9],
    [101.9, 102.4, 100.8, 102.0],
  ];
  const rows = [...SWEEP_RECLAIM, ...filler, [101.9, 102, 99.4, 101.5]]; // wick under 99.5, close above 100
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks[0].dead, true);
  assert.equal(map.blocks[0].death, "invalidated");
  assert.equal(map.blocks[0].tapped, false);
  // §7.1 chain: the invalidating wick opens a pending, the same-bar close reclaims → new LB at the new extreme
  assert.equal(map.blocks.length, 2);
  assert.equal(map.blocks[1].bot, 99.4);
  assert.equal(map.blocks[1].top, 99.5);
  assert.equal(map.blocks[1].dead, false);
});

// ---------------------------------------------------------------------------
// E1 (Elijah, 2026-09-14): deepened runs — a wick within eq_tolerance through a
// FRESH zone is the same run deepened, not an internal-point run.

test("deepened run: a shallow wick through a fresh LB that closes back above the ORIGINAL level keeps the trap — zone = new extreme ↔ original level", () => {
  const rows = [...SWEEP_RECLAIM, [101.9, 102, 99.4, 101.5]]; // 0.1 under 99.5, 2 bars after birth, close above 100
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  assert.equal(map.blocks[0].death, "deepened");
  assert.ok(map.events.some((e) => e.type === "bull_lb_deepened" && e.ext === 99.4 && e.level === 100.0));
  assert.ok(!map.events.some((e) => e.type === "low_swept" && e.from_lb), "no x1 sweep of the zone's own extreme");
  assert.equal(map.blocks.length, 2);
  const nb = map.blocks[1];
  assert.equal(nb.bot, 99.4);
  assert.equal(nb.top, 100.0);
  assert.deepEqual(nb.deepened, [99.5, 100.0]);
  assert.equal(nb.dead, false);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.deepEqual(story.lb.zone, [99.4, 100]);
  assert.equal(story.lb.deepened, true);
  assert.match(story.read, /the run deepened past 99.5 before the reclaim — the same trap/);
});

test("deepened run: while the reclaim is pending the story falls back, and a miss within confirm_bars is the breakdown of the original level", () => {
  const rows = [...SWEEP_RECLAIM, [101.9, 102, 99.4, 99.8], [99.8, 100.0, 99.5, 99.7], [99.7, 99.9, 99.5, 99.6], [99.6, 99.8, 99.4, 99.5]];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  assert.equal(map.blocks.length, 1);
  assert.equal(map.blocks[0].death, "deepened");
  const bd = map.events.find((e) => e.type === "low_breakdown");
  assert.ok(bd && bd.level === 100.0, "the breakdown is of the original swept level, not the zone extreme");
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "down_continuation");
  // mid-pending: the superseded zone no longer tells a buy story
  const mid = mkBars(rows.slice(0, 7));
  const midMap = buildLiquidityMap(mid, CFG);
  assert.ok(midMap.pending.bull && midMap.pending.bull.level === 100.0);
  assert.deepEqual(midMap.pending.bull.deepened, [99.5, 100.0]);
  assert.notEqual(storyRead(midMap, mid, CFG).mode, "buy_story");
});

test("deepened run keeps the swept level's qualification: a x2 build-up run, wicked 0.1 deeper two bars later, is still a qualified trap", () => {
  const rows = [
    [100, 101, 99.5, 100.5],
    [100.5, 101, 98.0, 100.0], // pivot low 98.0
    [100, 102, 99.6, 101.5],
    [101.5, 102.5, 98.1, 100.8], // pivot low 98.1 → 98.0 x2
    [100.8, 102, 100.2, 101.6],
    [101.6, 102, 97.7, 101.0], // runs 98.0 x2, closes back → bull LB 97.7–98.0 qualified
    [101, 102.2, 100.5, 101.8],
    [101.8, 102, 97.6, 101.2], // 0.1 deeper, 2 bars later, close above 98.0 → deepened, same trap
    [101.2, 101.5, 100.8, 101.3],
  ];
  const bars = mkBars(rows);
  const map = buildLiquidityMap(bars, CFG);
  const alive = map.blocks.filter((b) => !b.dead);
  assert.equal(alive.length, 1);
  assert.equal(alive[0].qualified, true);
  assert.equal(alive[0].sweptTouches, 2);
  assert.equal(alive[0].inducement, false);
  assert.deepEqual([alive[0].bot, alive[0].top], [97.6, 98.0]);
  assert.equal(storyRead(map, bars, CFG).mode, "buy_story");
});

// ---------------------------------------------------------------------------
// E1 (Elijah, 2026-09-14): left liquidity — a run makes a valid LB only when it
// takes the level AND the liquidity from the left.

// a x2 build-up at 98.0 stays intact below the run of the x1 internal low 100.0
const INVALID_LEFT = [
  [100, 101, 99.5, 100.5],
  [100.5, 101, 98.0, 100.0], // pivot low 98.0
  [100, 102, 99.6, 101.5],
  [101.5, 102.5, 98.1, 100.8], // pivot low 98.1 → 98.0 x2
  [100.8, 102, 100.2, 101.6],
  [101.6, 102, 100.0, 101.2], // pivot low 100.0 — the internal point
  [101.2, 102.2, 100.5, 101.8],
  [101.8, 102, 99.3, 101.4], // runs 100.0, leaves 98.0 x2 intact → bull LB 99.3–100.0, invalid
  [101.4, 101.5, 100.8, 101.3],
  [101.3, 101.7, 100.9, 101.4], // filler: no new pivots, zone untouched
  [101.4, 101.7, 100.8, 101.2],
  [101.2, 101.6, 100.7, 101.1],
];

// a x2 build-up at 100.0 is run while the single-touch origin 98.0 stays intact
const UNREFINED_LEFT = [
  [100, 101, 99.5, 100.5],
  [100.5, 101, 98.0, 100.0], // pivot low 98.0 (x1) — the origin
  [100, 102, 99.6, 101.5],
  [101.5, 102.5, 100.2, 101.6],
  [101.6, 102, 100.0, 101.2], // pivot low 100.0
  [101.2, 102.2, 100.6, 101.8],
  [101.8, 102, 100.1, 101.4], // pivot low 100.1 → 100.0 x2
  [101.4, 102.3, 100.7, 101.9],
  [101.9, 102, 99.4, 101.5], // runs 100.0 x2, leaves 98.0 x1 intact → bull LB 99.4–100.0 qualified, unrefined
  [101.5, 101.8, 100.9, 101.3],
  [101.3, 101.7, 100.8, 101.2], // filler: no new pivots, zone untouched
  [101.2, 101.6, 100.7, 101.1],
];

// a clean bull trap (98.0 x2 run) anchors the story; then a x2 high 102.1 is run
// while the leg's origin 104.0 stays intact above — E1's Sep-2 10:00 bear LB
const LEFT_INDUCEMENT = [
  [100, 101, 99.5, 100.5],
  [100.5, 101, 98.0, 100.2], // pivot low 98.0
  [100.2, 101.5, 99.8, 101.0],
  [101, 101.6, 98.1, 100.6], // pivot low 98.1 → 98.0 x2
  [100.6, 101.8, 100.0, 101.5],
  [101.5, 104.0, 101.0, 103.2], // pivot high 104.0 — the leg's origin
  [103.2, 103.6, 101.2, 101.6],
  [101.6, 102.0, 97.6, 100.9], // runs 98.0 x2 → bull LB 97.6–98.0, clean and qualified: the anchor
  [100.9, 101.9, 100.4, 101.8],
  [101.8, 102.0, 101.3, 101.9], // pivot high 102.0
  [101.9, 101.9, 101.4, 101.7],
  [101.7, 102.0, 101.2, 101.9], // pivot high 102.0 again (equal, not a sweep) → 102.0 x2
  [101.9, 102.0, 101.3, 101.8],
  [101.8, 102.6, 101.2, 101.6], // runs 102.0 x2, 104.0 intact above → bear LB 102.0–102.6: unrefined, inducement
  [101.6, 101.9, 101.3, 101.5],
];

test("left liquidity: a run that leaves a build-up intact beyond it is INVALID — no story, its tap is a pocket, the sweep of the build-up is the entry", () => {
  const bars = mkBars(INVALID_LEFT);
  const map = buildLiquidityMap(bars, CFG);
  const blk = map.blocks.find((b) => b.side === "bull");
  assert.ok(blk && !blk.dead);
  assert.deepEqual([blk.bot, blk.top], [99.3, 100.0]);
  assert.equal(blk.grade, "invalid");
  assert.equal(blk.left.price, 98.0);
  assert.equal(blk.left.touches, 2);
  assert.ok(map.events.some((e) => e.type === "bull_lb_created" && e.grade === "invalid" && e.left.price === 98.0));
  const story = storyRead(map, bars, CFG);
  assert.notEqual(story.mode, "buy_story");
  assert.match(story.read, /bullish LB 99.3–100 created 4 bars ago is invalid: the low 98 x2 from the left is intact — not a flip; no entry until 98 is run/);
  const read = analyzeMarco(bars, CFG, { bias: 1 });
  const tap = read.triggers.find((t) => t.kind === "tap");
  assert.ok(tap, "the tap exists");
  assert.equal(tap.grade, "invalid");
  assert.equal(tap.pocket.floor, 98.0);
  assert.equal(tap.pocket.from, "structure");
  assert.match(tap.note, /no entry until 98 is run/);
  assert.equal(read.triggers.find((t) => t.kind === "sweep" && t.trigger === 98.0).preferred, true);
  assert.equal(read.blocks.find((b) => b.side === "bull").grade, "invalid");
});

test("left liquidity: only a single-touch swing left behind makes the LB UNREFINED — the trap stands (V8), the tap is the aggressive entry, the sweep of the swing the refined one", () => {
  const bars = mkBars(UNREFINED_LEFT);
  const map = buildLiquidityMap(bars, CFG);
  const blk = map.blocks.find((b) => b.side === "bull");
  assert.deepEqual([blk.bot, blk.top], [99.4, 100.0]);
  assert.equal(blk.qualified, true);
  assert.equal(blk.grade, "unrefined");
  assert.equal(blk.left.kind, "swing");
  assert.equal(blk.left.price, 98.0);
  assert.equal(blk.left.touches, 1);
  // V8 (06:52): "you do not need to wait for this low — that is pattern
  // trading": the x2 build-up run IS the trap; the x1 origin low 98 beyond it
  // is the refined entry, not a requirement — the story flips
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.deepEqual(story.lb.zone, [99.4, 100]);
  assert.match(story.read, /unrefined — the low 98 from the left is intact: the tap is the aggressive entry, the sweep of 98 the refined one; the trap does not need it \(V8\)/);
  const read = analyzeMarco(bars, CFG, { bias: 1 });
  const tap = read.triggers.find((t) => t.kind === "tap");
  assert.equal(tap.grade, "unrefined");
  assert.equal(tap.pocket, undefined);
  assert.equal(tap.unrefined.floor, 98.0);
  assert.equal(tap.unrefined.from, "structure");
  assert.match(tap.note, /this tap is the aggressive entry, the sweep of 98 the refined one/);
  assert.equal(read.triggers.find((t) => t.kind === "sweep" && t.trigger === 98.0).refined, true);
});

test("left liquidity: a counter-side LB with the leg's origin intact is inducement against a live clean anchor — the story holds (E1, MNQ Sep 2 10:00)", () => {
  const bars = mkBars(LEFT_INDUCEMENT);
  const map = buildLiquidityMap(bars, CFG);
  const bull = map.blocks.find((b) => b.side === "bull");
  const bear = map.blocks.find((b) => b.side === "bear");
  assert.ok(bull && !bull.dead && bull.qualified && bull.left === null, "the anchor is clean and qualified");
  assert.ok(bear && !bear.dead);
  assert.deepEqual([bear.bot, bear.top], [102.0, 102.6]);
  assert.equal(bear.qualified, true, "the x2 run qualifies the zone");
  assert.equal(bear.grade, "unrefined");
  assert.equal(bear.left.price, 104.0);
  assert.equal(bear.inducement, true);
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.deepEqual(story.lb.zone, [97.6, 98]);
  assert.deepEqual(story.inducement, { side: "bear", zone: [102, 102.6], alive: true, left: { price: 104, touches: 1 } });
  assert.match(story.read, /bearish LB 102–102.6 created 1 bar ago is inducement \(the high 104 from the left is intact\): a pullback origin, not a flip/);
  const read = analyzeMarco(bars, CFG);
  assert.equal(read.bias_used, 1);
  assert.equal(read.false_reactions[0].inducement, true);
  assert.match(read.false_reactions[0].note, /the high 104 from the left is intact/);
});

// ---------------------------------------------------------------------------
// V8 (Marco, E2n7KMQDYIU "Fix This Liquidity Mistake", 2026-09-19): the trap
// is the run of the level the inducing move came from — "where did this
// reaction occur from? look to the left-hand side" — not of the structural
// swing low pattern traders mark. Diagram 02:26–06:56 in miniature.
const V8_TRAP = [
  [100, 101, 99.5, 100.5],
  [100.5, 101, 98.0, 100.0], // pivot low 98.0 — the structural low the pattern trader marks (x1)
  [100, 102, 99.6, 101.5], // 98.0 registered
  [101.5, 102.4, 101.0, 102.0],
  [102.0, 103.0, 101.6, 102.5], // pivot high 103.0 — the top
  [102.5, 102.7, 101.4, 101.8], // 103.0 registered; the retracement starts
  [101.8, 102.0, 100.0, 100.9], // pivot low 100.0 — the internal low of the leg
  [100.9, 101.9, 100.9, 101.6], // 100.0 registered
  [101.6, 101.8, 100.1, 101.3], // pivot low 100.1 → equal → 100.0 x2 (the zone "from the left")
  [101.3, 102.1, 101.0, 101.9],
  [101.9, 102.2, 101.6, 102.0],
  [102.0, 102.3, 101.3, 101.8], // pivot low 101.3 — a minor low; pivot high 102.3
  [101.8, 102.2, 101.7, 102.1], // both registered
  [102.1, 102.2, 100.5, 100.8], // runs 101.3 — "induces sellers"; the stab stops at 100.5, above the x2 zone
  [100.8, 101.0, 100.6, 100.9],
  [100.9, 101.2, 100.7, 101.1], // no reclaim → breakdown of 101.3; 100.5 is a plain low, no LB
  [101.1, 103.4, 101.0, 103.1], // the rapid move up runs the highs — "inducing buyers"; the move came from 100.5
  [103.1, 103.3, 102.4, 102.7], // reclaim → bear LB 103.0–103.3, x1 and young
  [102.7, 102.9, 101.5, 101.8], // the sell-off "to trap the buyers"
  [101.8, 102.0, 99.7, 100.9], // runs the origin 100.5 AND the x2 zone 100.0, closes back → the trap; 98.0 stays intact
  [100.9, 101.6, 100.7, 101.4],
  [101.4, 101.8, 101.0, 101.6],
];

test("V8: after buyers are induced, the trap pointer names the origin their move came from — 'grab this low, drag it over'", () => {
  const bars = mkBars(V8_TRAP.slice(0, 18)); // through the bear LB, before the sell-off
  const map = buildLiquidityMap(bars, CFG);
  const induced = map.events.find((e) => e.type === "buyers_induced");
  assert.ok(induced, "the run of the highs induced buyers");
  assert.equal(induced.bar, 16);
  assert.equal(induced.origin, 100.5);
  assert.equal(induced.origin_bar, 13);
  assert.ok(map.events.some((e) => e.type === "sellers_induced" && e.bar === 13 && e.level === 101.3), "the minor low run induced sellers first");
  assert.equal(map.origins.bull.price, 100.5);
  assert.equal(map.origins.bull.induced.who, "buyers");
  assert.equal(map.origins.bear, null, "the bear origin 103 was traded through by the rally");
  const story = storyRead(map, bars, CFG);
  assert.equal(story.pointers.bull.price, 100.5);
  assert.equal(story.pointers.bull.induced.who, "buyers");
  assert.match(story.read, /trap pointer: buyers induced 1 bar ago \(the high 10[23](\.\d)? run\) — their stops rest under the origin 100\.5 that move came from: its run is the trap, a reclaim there the long/);
  const read = analyzeMarco(bars, CFG);
  assert.equal(read.trap_pointers.bull.price, 100.5);
});

test("V8: the run of the origin + the x2 zone is the trap and sets the story, although the structural low 98 stays intact — waiting for it is pattern trading", () => {
  const bars = mkBars(V8_TRAP);
  const map = buildLiquidityMap(bars, CFG);
  assert.ok(map.events.some((e) => e.type === "origin_run" && e.side === "bull" && e.bar === 19 && e.origin === 100.5));
  const blk = map.blocks.find((b) => b.side === "bull" && !b.dead);
  assert.deepEqual([blk.bot, blk.top], [99.7, 100.0]);
  assert.equal(blk.qualified, true, "the x2 zone run qualifies the trap");
  assert.equal(blk.sweptTouches, 2);
  assert.equal(blk.trap, true, "the run took the origin the inducing move came from");
  assert.equal(blk.grade, "unrefined", "the x1 structural low 98 is named as the refined entry, not required");
  assert.deepEqual([blk.left.kind, blk.left.price], ["swing", 98.0]);
  assert.equal(blk.inducement, false);
  assert.ok(map.levels.lows.some((l) => l.price === 98.0 && l.touches === 1), "98.0 stays on the map, intact");
  assert.equal(map.origins.bull, null, "the pointer is gone once the origin is run");
  const story = storyRead(map, bars, CFG);
  assert.equal(story.mode, "buy_story");
  assert.equal(story.direction, 1);
  assert.deepEqual(story.lb.zone, [99.7, 100]);
  assert.match(story.read, /the trap does not need it \(V8\)/);
  assert.match(story.read, /the run took the origin of the move that induced the crowd — the trap, V8/);
  const read = analyzeMarco(bars, CFG);
  assert.equal(read.bias_used, 1);
  assert.equal(read.blocks.find((b) => b.side === "bull").trap, true);
  const tap = read.triggers.find((t) => t.kind === "tap");
  assert.equal(tap.grade, "unrefined");
  assert.equal(tap.unrefined.floor, 98.0);
  assert.match(tap.note, /the trap does not need it/);
});

test("V8: an origin sitting at an alive same-side LB extreme is the stop side, not a pointer (E1 build decision 1)", () => {
  const bars = mkBars([
    ...SWEEP_RECLAIM, // bull LB 99.5–100 alive; its run flipped the swing down
    [102.8, 103.9, 102.0, 103.5], // runs the 103.6 high → buyers induced; the move came from 99.5 = the LB extreme
  ]);
  const map = buildLiquidityMap(bars, CFG);
  const induced = map.events.find((e) => e.type === "buyers_induced");
  assert.ok(induced && induced.origin === 99.5);
  assert.equal(map.origins.bull, null);
  assert.equal(storyRead(map, bars, CFG).pointers.bull, null);
});

test("MNQ 2026-09-02 (real bars, E1): the deepened 28927.25 run keeps the 1h buy story, and the 10:00 bear LB under the intact 29317.25 is inducement, not a flip", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/mnq_2026-09-04.json", import.meta.url), "utf-8"));
  const cfg = MARCO_DEFAULTS;
  const et = (m, d, h) => Date.UTC(2026, m - 1, d, h + 4) / 1000; // ET = UTC-4 in September
  const readAt = (cut) => {
    const b60 = fx.bars["60"].filter((x) => x.time <= cut);
    const b240 = fx.bars["240"].filter((x) => x.time <= cut);
    const seed = seedFromMap(buildLiquidityMap(b240, cfg), b240, { before: b60[0].time, price: b60.at(-1).close, cfg });
    const map = buildLiquidityMap(b60, cfg, { seed });
    return { map, story: storyRead(map, b60, cfg) };
  };
  const near = (a, b) => Math.abs(a - b) < 0.01;
  // 07:00 ET: the 05:00 low 28940.75 is wicked to 28927.25 (0.16 ATR) and the bar closes 29083.75
  const r7 = readAt(et(9, 2, 7));
  assert.equal(r7.story.mode, "buy_story");
  assert.ok(near(r7.story.lb.zone[0], 28927.25) && near(r7.story.lb.zone[1], 28947.75), `zone ${r7.story.lb.zone}`);
  assert.ok(r7.map.events.some((e) => e.type === "bull_lb_deepened" && near(e.ext, 28927.25)));
  assert.match(r7.story.read, /the run deepened past 28940.75 before the reclaim — the same trap/);
  // 11:00 ET: the 10:00 bar ran the x2 highs 29171.25 to 29211.75 and closed back — the 29317.25 high from the left is intact
  const r11 = readAt(et(9, 2, 11));
  assert.equal(r11.story.mode, "buy_story");
  assert.equal(r11.story.inducement?.side, "bear");
  assert.ok(near(r11.story.inducement.zone[0], 29171.25) && near(r11.story.inducement.zone[1], 29211.75));
  assert.ok(near(r11.story.inducement.left.price, 29317.25));
  const bear = r11.map.blocks.find((b) => !b.dead && b.side === "bear" && near(b.top, 29211.75));
  assert.equal(bear.grade, "unrefined");
  assert.equal(bear.inducement, true);
});

test("an expired zone's extreme returns to the map as a level — the liquidity outlives the zone", () => {
  const rows = [...SWEEP_RECLAIM, [101.9, 102.5, 101.2, 102.2], [102.2, 102.8, 101.6, 102.5]];
  const map = buildLiquidityMap(mkBars(rows), { ...CFG, zone_max_age: 2 });
  const blk = map.blocks[0];
  assert.equal(blk.death, "expired");
  const lv = map.levels.lows.find((l) => l.price === 99.5);
  assert.ok(lv, "the extreme is an intact level again");
  assert.equal(lv.touches, 1);
  assert.ok(map.events.some((e) => e.type === "bull_lb_retired" && e.reason === "expired" && e.level === 99.5));
});

test("LB vs build-up: a later pivot respecting the zone's extreme retires it into a x2 level; the next run sweeps that level", () => {
  const map = buildLiquidityMap(mkBars(SWEEP_RECLAIM_TWICE), CFG);
  const first = map.blocks[0];
  assert.equal(first.death, "buildup");
  assert.equal(first.respects, 1);
  assert.ok(map.events.some((e) => e.type === "bull_lb_retired" && e.reason === "buildup" && e.touches === 2));
  const bu = map.buildups.find((b) => b.side === "low" && b.price === 99.5);
  assert.ok(bu, "the retired extreme is a build-up record");
  assert.equal(bu.touches, 2);
  assert.equal(bu.swept, 10);
  const second = map.blocks[1];
  assert.equal(second.bot, 99.4);
  assert.equal(second.qualified, true); // it ran a x2 build-up
  assert.equal(second.dead, false);
});

test("pocket floor: a stab that stops within eq_tolerance above a deeper intact level is a poke, not a trap", () => {
  const rows = [
    [100.5, 100.8, 99.8, 100.2],
    [100.2, 100.4, 99.0, 100.0], // pivot low 99.0 — the pocket floor
    [100.0, 100.9, 99.7, 100.8],
    [100.8, 101.5, 100.5, 101.3],
    [101.3, 101.6, 100.0, 101.0], // pivot low 100.0 — an inner level
    [101.0, 101.8, 100.6, 101.5],
    [101.5, 101.7, 99.2, 101.2], // stab under 100.0, stops 0.2 above 99.0, closes back
    [101.2, 101.6, 100.9, 101.4],
    [101.4, 101.7, 101.0, 101.6],
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  const poke = map.events.find((e) => e.type === "low_poke");
  assert.ok(poke, "the stab is recorded as a poke");
  assert.equal(poke.level, 100.0);
  assert.equal(poke.floor, 99.0);
  assert.equal(map.blocks.length, 0, "no LB is born from a stab into the pocket");
  assert.ok(!map.levels.lows.some((l) => l.price === 100.0), "the poked inner level is consumed");
  const floor = map.levels.lows.find((l) => l.price === 99.0);
  assert.ok(floor, "the floor keeps the liquidity");
  assert.equal(floor.touches, 2, "the stab's pivot counts as a respect of the floor");
  const story = storyRead(map, mkBars(rows), CFG);
  assert.match(story.read, /inducement into the pocket/);
});

test("a run of equal lows registers once, on its first bar (no more mutual cancellation)", () => {
  const rows = [
    [100.5, 100.8, 100.2, 100.4],
    [100.4, 100.6, 100.0, 100.3],
    [100.3, 100.5, 100.0, 100.4], // equal low
    [100.4, 101.0, 100.3, 100.9],
    [100.9, 101.2, 100.6, 101.0],
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.levels.lows.length, 1);
  assert.equal(map.levels.lows[0].price, 100.0);
  assert.equal(map.levels.lows[0].touches, 1);
  assert.equal(map.levels.lows[0].born, 1);
});

test("HTF feed: seeded levels enter the map as aged levels, survive the per-side cap and qualify the sweep", () => {
  const seed = { lows: [{ price: 98.0, touches: 1 }, { price: 99.7, touches: 2 }], highs: [] };
  const map = buildLiquidityMap(mkBars(SWEEP_RECLAIM), CFG, { seed });
  const deep = map.levels.lows.find((l) => l.price === 98.0);
  assert.ok(deep?.seeded);
  assert.ok(!map.levels.lows.some((l) => l.price === 99.7), "the seeded 99.7 was swept by the 99.5 run");
  assert.equal(map.blocks[0].qualified, true, "sweeping an aged/x2 HTF level qualifies the LB");

  // seedFromMap: nearest per side, only levels born before the lower window, chains seeded ones
  const htfBars = mkBars(SWEEP_RECLAIM, { step: 14400, start: 1756000000 });
  const htfMap = buildLiquidityMap(htfBars, CFG, { seed: { lows: [{ price: 90, touches: 3 }], highs: [] } });
  const picked = seedFromMap(htfMap, htfBars, { before: 1756000000 + 3 * 14400, price: 100, cfg: { ...CFG, seed_levels: 2 } });
  assert.deepEqual(picked.lows.map((l) => l.price), [90]); // 100.0 was born at bar 1 (< before) but swept; 90 is the seeded one
  assert.equal(picked.highs.length <= 2, true);
});

test("6B 2026-09-04 (real bars): the pocket floor 1.3474 is a x4 intact level on the 1h via the daily feed, Friday's 1.3476 is a poke, no bull LB is born", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/6b_2026-09-04.json", import.meta.url), "utf-8"));
  const cfg = MARCO_DEFAULTS;
  const reads = {};
  for (const tf of ["W", "D", "60"]) {
    const bars = fx.bars[tf];
    const src = tf === "D" ? reads.W : tf === "W" ? null : reads.D;
    const seed = src ? seedFromMap(src.map, src.bars, { before: bars[0].time, price: bars.at(-1).close, cfg }) : null;
    const map = buildLiquidityMap(bars, cfg, { seed });
    reads[tf] = { bars, map, story: storyRead(map, bars, cfg) };
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  assert.ok(reads.D.map.levels.lows.some((l) => near(l.price, 1.3474, 0.0001)), "the daily carries the Aug-13 low");
  const floor = reads["60"].map.levels.lows.find((l) => near(l.price, 1.3474, 0.0001));
  assert.ok(floor, "the 1h inherits it");
  assert.ok(floor.touches >= 3, `x${floor.touches} — Aug 13, Sep 2, Sep 4 all respected it`);
  assert.ok(!reads["60"].map.blocks.some((b) => !b.dead && b.side === "bull" && near(b.bot, 1.3476, 0.0003)), "no bull LB from the 1.3476 stab");
  const poke = [...reads["60"].map.events].reverse().find((e) => e.type === "low_poke");
  assert.ok(poke && near(poke.floor, 1.3474, 0.0001) && near(poke.ext, 1.3476, 0.0001));
  assert.notEqual(reads["60"].story.mode, "buy_story");
  assert.match(reads["60"].story.read, /inducement into the pocket/);
});

// ---------------------------------------------------------------------------
// 2026-09-06 (user): the intraweek layer — targets belong to the trigger,
// ladders are clusters, a stale story is a lean, notes speak to the week's bias.

function fixtureReads(name, cfg = MARCO_DEFAULTS) {
  const fx = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf-8"));
  const reads = {};
  for (const tf of ["W", "D", "240", "60"]) {
    const bars = fx.bars[tf];
    const src = tf === "D" ? reads.W : tf === "W" ? null : reads.D;
    const seed = src ? seedFromMap(src.map, src.bars, { before: bars[0].time, price: bars.at(-1).close, cfg }) : null;
    const map = buildLiquidityMap(bars, cfg, { seed });
    reads[tf] = { bars, map, story: storyRead(map, bars, cfg) };
  }
  return reads;
}

test("clusterTargets: levels within tolerance are one draw (near edge, far edge, summed taps); duplicates across timeframes count once", () => {
  const list = [
    { price: 103, touches: 1 },
    { price: 100.5, touches: 2, kind: "lb", zone: [100.5, 101] },
    { price: 100, touches: 1 },
    { price: 100.5, touches: 2 }, // the same level from the other timeframe
  ];
  const out = clusterTargets(list, 1, 1);
  assert.equal(out.length, 2);
  assert.equal(out[0].price, 100);
  assert.equal(out[0].far, 100.5);
  assert.equal(out[0].touches, 3);
  assert.equal(out[0].kind, "lb");
  assert.equal(out[0].members, 2);
  assert.equal(out[1].price, 103);
  // short side: nearest-first means descending
  const down = clusterTargets(list, 1, -1);
  assert.equal(down[0].price, 103);
});

test("intraweek: week targets are distinct clusters, and each trigger's target is the first rung beyond ITS entry that clears the min RR", () => {
  const cfg = MARCO_DEFAULTS;
  const reads = fixtureReads("mnq_2026-09-04", cfg);
  const bias = resolveBias(reads.W.story, reads.D.story);
  assert.equal(bias.bias_word, "long");
  const { intraweek, triggers } = intraweekLayer(reads, bias, cfg);
  const dAtr = atrSeries(reads.D.bars, cfg.atr_length).at(-1);
  const tol = dAtr * cfg.eq_tolerance_atr;
  for (let i = 1; i < intraweek.ladder.length; i++) {
    assert.ok(intraweek.ladder[i].price - intraweek.ladder[i - 1].far > tol, "consecutive clusters are further apart than the tolerance");
  }
  assert.ok(intraweek.targets.every((t) => t.atr_weeks !== null), "week targets are annotated in weekly ATRs");
  const all = [...triggers["240"], ...triggers["60"]].filter((t) => t.stop !== null && t.target !== null);
  assert.ok(all.length >= 3);
  for (const t of all) {
    assert.ok(t.target > t.trigger, "a long trigger's target sits beyond its own entry");
    assert.ok(t.rr >= cfg.target_min_rr || /no target on the ladder/.test(t.note ?? ""), `RR ${t.rr} at ${t.trigger} clears min RR or is flagged`);
  }
  const stepped = all.find((t) => t.targets && t.targets.length > 1);
  assert.ok(stepped, "a far-stop sweep trigger steps up the ladder");
  assert.ok(stepped.targets[0].rr < cfg.target_min_rr);
  assert.equal(stepped.target, stepped.targets.at(-1).price);
  assert.match(stepped.note, /target moved to/);
  const kept = all.find((t) => t.targets && t.targets.length === 1);
  assert.ok(kept, "a trigger whose T1 already clears the min RR keeps T1");
});

test("intraweek: a target beyond a weekly range says refine the stop instead; the phase note speaks to the week's bias (6B)", () => {
  const cfg = MARCO_DEFAULTS;
  const reads = fixtureReads("6b_2026-09-04", cfg);
  const bias = resolveBias(reads.W.story, reads.D.story);
  assert.equal(bias.bias_word, "short");
  const { intraweek, triggers } = intraweekLayer(reads, bias, cfg);
  // E1 (2026-09-14): the Sep-4 02:00 4h bear LB 1.3548–1.3549 leaves the
  // Aug-31 high 1.3566 x2 intact above it — invalid, not the 4h trap. The
  // trap came on Sep 9 when 1.3566 was run (docs/MARCO-CASES.md D1), so the
  // week opens with no local story and the run of 1.3566 as the trigger.
  const h4 = reads["240"].story;
  assert.equal(h4.mode, "down_continuation");
  assert.match(h4.read, /bearish LB 1.3548–1.3549 created 3 bars ago is invalid: the high 1.3566 x2 from the left is intact/);
  assert.equal(intraweek.phase, "no_local_story");
  assert.equal(intraweek.local_regime, "no_bias");
  assert.doesNotMatch(intraweek.local_read, /counter-trend/);
  assert.ok(Math.abs(intraweek.primary_target - 1.3474) < 0.0001, "the pocket floor is the week's first target");
  const far = [...triggers["240"], ...triggers["60"]].find((t) => t.targets && t.targets.at(-1).atr_weeks > 1);
  assert.ok(far, "a wide-stop sweep reaches a target beyond a weekly range");
  assert.match(far.note, /refine the stop on a lower-TF LB/);
});

test("resolveBias: a stale trap plus a mere continuation on the other side is a lean, not 'aligned'", () => {
  const w = { mode: "down_continuation", direction: -1, fresh: true, targets_below: [{ price: 90, touches: 1 }], lb: null };
  const dStale = { mode: "sell_story", direction: -1, fresh: false, targets_below: [{ price: 95, touches: 2 }], lb: { alive: true, zone: [100, 101] } };
  const r = resolveBias(w, dStale);
  assert.notEqual(r.regime, "aligned");
  assert.equal(r.regime, "daily_only");
  assert.equal(r.stale, true);
  assert.equal(r.bias, -1);
  assert.match(r.note, /stale/);
  const dFresh = { ...dStale, fresh: true };
  const live = resolveBias(w, dFresh);
  assert.equal(live.regime, "aligned");
  assert.equal(live.stale, false);
});
