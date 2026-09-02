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
  triggerSetups,
  resolveBias,
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

test("an invalidated LB's extreme is swept liquidity: reclaim → new LB", () => {
  const rows = [
    ...SWEEP_RECLAIM,
    [101.9, 102, 98.9, 99.2], // close below 99.5 → invalidated, pending opens
    [99.2, 100.5, 98.8, 100.2], // reclaim above 99.5 → LB at the new extreme
  ];
  const map = buildLiquidityMap(mkBars(rows), CFG);
  assert.equal(map.blocks.length, 2);
  const nb = map.blocks[1];
  assert.equal(nb.side, "bull");
  assert.equal(nb.top, 99.5);
  assert.equal(nb.bot, 98.8);
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
  const bars = mkBars(SWEEP_RECLAIM.concat(SWEEP_RECLAIM)); // one alive bull LB below price
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
  assert.deepEqual(story.inducement, { side: "bear", zone: [105, 106], alive: true });
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
