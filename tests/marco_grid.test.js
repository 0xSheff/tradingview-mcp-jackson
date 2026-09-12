/**
 * Tests for the nested daily read (src/core/marco_grid.js): the H4 grid, the
 * pocket flag on entries, clipping the LTF to the grid, contract-roll
 * detection, the scenarios and the approved brief renderer. Hand-built maps
 * — the state machine that produces them is covered in marco.test.js.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARCO_DEFAULTS,
  h4Grid,
  flagPocket,
  clipToGrid,
  detectRoll,
  shiftPrices,
  basisBars,
  dailyScenarios,
  renderDailyMarkdown,
  triggerSetups,
  storyRead,
  buildLiquidityMap,
} from "../src/core/marco.js";

const CFG = { ...MARCO_DEFAULTS, pivot_len: 1, atr_length: 3, min_touches: 2, respect_tolerance_atr: 0.75, eq_tolerance_atr: 0.25, stop_buffer_atr: 0.1 };

// 20 flat bars of range 2 → ATR 2, respect 1.5, eq_tol 0.5, buffer 0.2; last close 100
const BARS = Array.from({ length: 20 }, (_, i) => ({ time: 1_757_000_000 + i * 14400, open: 100, high: 101, low: 99, close: 100 }));
const n = BARS.length;

// price 100. Below: a single-touch rung 99.6, a bull LB 98.6–99.4 whose
// extreme sits 0.4 above the shelf 98.2 (pocket), a x3 build-up 95 far
// below. Above: a single-touch rung 101, a bear LB 101.8–102.4 (the range
// top), a x2 build-up 104 beyond it.
function handMap() {
  return {
    levels: {
      lows: [
        { price: 99.6, touches: 1, born: 12 },
        { price: 98.2, touches: 1, born: 4 },
        { price: 95, touches: 3, born: 1 },
      ],
      highs: [
        { price: 101, touches: 1, born: 14 },
        { price: 104, touches: 2, born: 2 },
      ],
    },
    blocks: [
      { side: "bull", bot: 98.6, top: 99.4, born: 15, extBar: 15, qualified: true, thin: false, tapped: false, inducement: false, sweptTouches: 2, dead: false },
      { side: "bear", bot: 101.8, top: 102.4, born: 9, extBar: 9, qualified: true, thin: false, tapped: true, inducement: false, sweptTouches: 3, dead: false },
      { side: "bull", bot: 90, top: 91, born: 0, extBar: 0, qualified: false, dead: true, death: "invalidated" },
    ],
    events: [
      { bar: n - 2, type: "low_swept", level: 99.4, touches: 2 },
      { bar: n - 2, type: "bull_lb_created", zone: [98.6, 99.4], qualified: true },
      { bar: 3, type: "high_swept", level: 101.5, touches: 1 },
    ],
    buildups: [],
  };
}

test("h4Grid: the edge is the nearest LB extreme or build-up, extended through the pocket; single touches are rungs; beyond is the redraw target", () => {
  const g = h4Grid(handMap(), BARS, CFG, { bias: 1 });
  assert.equal(g.price, 100);
  assert.equal(g.atr, 2);
  // lower: LB extreme 98.6 is the anchor, the shelf 98.2 sits 0.4 below → one edge
  assert.equal(g.lower.anchor.kind, "lb");
  assert.equal(g.lower.edge, 98.2);
  assert.equal(g.lower.chained, true);
  assert.equal(g.lower.floor_kind, "level", "the edge is a level — a pocket floor");
  assert.deepEqual(g.lower.cluster.map((c) => c.price), [98.6, 98.2]);
  assert.deepEqual(g.lower.rungs.map((r) => r.price), [99.6]);
  assert.deepEqual(g.lower.beyond.map((r) => r.price), [95]);
  assert.equal(g.lower.kill, 98);
  assert.equal(g.lower.weak, false);
  // upper: the bear LB top is the edge; 101 x1 is a rung, 104 x2 is beyond (1.6 > respect 1.5)
  assert.equal(g.upper.edge, 102.4);
  assert.equal(g.upper.chained, false);
  assert.equal(g.upper.floor_kind, "lb");
  assert.deepEqual(g.upper.rungs.map((r) => r.price), [101]);
  assert.deepEqual(g.upper.beyond.map((r) => r.price), [104]);
  assert.equal(g.inside, true);
  // since: the last 6 bars by default — the run and the reclaim, not the old high sweep
  assert.deepEqual(g.since.map((e) => e.type), ["low_swept", "bull_lb_created"]);
});

test("h4Grid: a side with only single-touch levels falls back to the nearest one and is flagged weak; since honours sinceBar", () => {
  const m = handMap();
  m.levels.highs = [{ price: 101, touches: 1, born: 14 }];
  m.blocks = m.blocks.filter((b) => b.side !== "bear");
  const g = h4Grid(m, BARS, CFG, { bias: 1, sinceBar: 0 });
  assert.equal(g.upper.edge, 101);
  assert.equal(g.upper.weak, true);
  assert.equal(g.since.length, 3);
});

test("flagPocket: a tap whose extreme sits within respect_tolerance of a deeper level is inducement, and the sweep at the floor is promoted", () => {
  const m = handMap();
  const triggers = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  const tap = triggers.find((t) => t.kind === "tap");
  assert.ok(tap, "a tap of the bull LB exists");
  const floors = flagPocket(triggers, m, BARS, CFG, 1);
  assert.equal(floors.size, 1);
  assert.equal(tap.pocket.floor, 98.2);
  assert.equal(tap.pocket.kind, "level");
  assert.equal(tap.pocket.gap, 0.4);
  assert.equal(tap.preferred, false);
  assert.match(tap.note, /pocket — inducement/);
  assert.match(tap.note, /no entry until 98.2 is run/);
  const atFloor = triggers.find((t) => t.kind === "sweep" && t.trigger === 98.2);
  assert.equal(atFloor.preferred, true);
  // a tap with nothing within the tolerance below its extreme is untouched
  m.levels.lows = m.levels.lows.filter((l) => l.price !== 98.2);
  const clean = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  flagPocket(clean, m, BARS, CFG, 1);
  assert.equal(clean.find((t) => t.kind === "tap").pocket, undefined);
});

test("clipToGrid: LTF targets past the counter edge become the edge, a story against the bias inside the grid is noise, the local frame stays inside", () => {
  const grid = h4Grid(handMap(), BARS, CFG, { bias: 1 });
  const read = {
    story: { mode: "sell_story", direction: -1, read: "highs were run…" },
    triggers: [{ kind: "sweep", side: "long", trigger: 99.6, stop: 98.4, target: 103.5, rr: 3.25, distance: 0.4, note: null }],
    liquidity: { intact_below: [{ price: 99.8, touches: 1 }], intact_above: [{ price: 102.9, touches: 1 }, { price: 101.5, touches: 2 }] },
    alignment: "against",
  };
  clipToGrid(read, grid, 1);
  const t = read.triggers[0];
  assert.equal(t.target, 102.4);
  assert.equal(t.target_unclipped, 103.5);
  assert.equal(Math.round(t.rr * 1000) / 1000, 2.333);
  assert.match(t.note, /clipped to the H4 grid edge 102.4/);
  assert.equal(read.alignment, "noise");
  assert.match(read.noise_note, /trap city/);
  assert.deepEqual(read.local_frame.below, { price: 99.8, touches: 1, source: "ltf" });
  assert.deepEqual(read.local_frame.above, { price: 101.5, touches: 2, source: "ltf" });
  // no LTF level inside → the grid edge is the frame
  const bare = { story: { direction: 1 }, triggers: [], liquidity: { intact_below: [], intact_above: [{ price: 105, touches: 1 }] } };
  clipToGrid(bare, grid, 1);
  assert.deepEqual(bare.local_frame.below, { price: 98.2, touches: null, source: "h4 edge" });
  assert.deepEqual(bare.local_frame.above, { price: 102.4, touches: null, source: "h4 edge" });
});

test("detectRoll: a constant offset on every shared bar is a roll; a varying one is a data problem; too little overlap is unknown", () => {
  const prev = Array.from({ length: 10 }, (_, i) => ({ time: 1000 + i * 100, open: 1.16 + i * 0.001, high: 1.161 + i * 0.001, low: 1.159 + i * 0.001, close: 1.1605 + i * 0.001 }));
  const shifted = prev.map((b) => ({ ...b, open: b.open + 0.00405, high: b.high + 0.00405, low: b.low + 0.00405, close: b.close + 0.00405 }));
  const r = detectRoll(prev, shifted, { tick: 0.00005 });
  assert.equal(r.status, "rolled");
  assert.equal(r.offset, 0.00405);
  assert.equal(r.shared, 10);
  assert.equal(detectRoll(prev, prev, { tick: 0.00005 }).status, "same");
  const broken = shifted.map((b, i) => (i === 4 ? { ...b, high: b.high + 0.001 } : b));
  assert.equal(detectRoll(prev, broken, { tick: 0.00005 }).status, "inconsistent");
  assert.equal(detectRoll(prev.slice(0, 2), shifted, { tick: 0.00005 }).status, "unknown");
  assert.equal(detectRoll(prev, shifted.map((b) => ({ ...b, time: b.time + 5 }))).status, "unknown");
});

test("shiftPrices moves every price-carrying field and nothing else; basisBars keeps the last closed bars", () => {
  const wk = {
    price: 1.1612,
    bias: { bias: 1, bias_word: "long", targets: [{ price: 1.19235, touches: 1, atr_weeks: 2.4 }], primary_target: 1.19235, invalidation: { level: 1.13635, rule: "weekly close below" } },
    triggers: { 60: [{ trigger: 1.1588, stop: 1.1571, target: 1.16445, stop_anchor: [1.1572, 1.15765], rr: 3.4 }] },
    htf_zones: [{ tf: "W", zone: [1.13635, 1.13675], distance: 0.0248 }],
  };
  const s = shiftPrices(wk, 0.00405);
  assert.equal(s.price, 1.16525);
  assert.equal(s.bias.bias, 1);
  assert.equal(s.bias.targets[0].price, 1.1964);
  assert.equal(s.bias.targets[0].atr_weeks, 2.4);
  assert.equal(s.bias.primary_target, 1.1964);
  assert.equal(s.bias.invalidation.level, 1.1404);
  assert.deepEqual(s.triggers[60][0].stop_anchor, [1.16125, 1.1617]);
  assert.equal(s.triggers[60][0].rr, 3.4);
  assert.deepEqual(s.htf_zones[0].zone, [1.1404, 1.1408]);
  assert.equal(s.htf_zones[0].distance, 0.0248);
  assert.equal(wk.price, 1.1612, "the source is not mutated");
  assert.equal(shiftPrices(wk, 0), wk);
  const b = basisBars(BARS, 5);
  assert.equal(b.length, 5);
  assert.equal(b[4].time, BARS[n - 2].time, "the forming bar is excluded");
  assert.deepEqual(Object.keys(b[0]), ["time", "open", "high", "low", "close"]);
});

test("storyRead: counter-side LB zones on the path are pullback origins; only the furthest is the range extreme with its far edge", () => {
  const m = {
    levels: { lows: [{ price: 99, touches: 1, born: 5 }], highs: [{ price: 101, touches: 1, born: 6 }] },
    blocks: [
      { side: "bear", bot: 101.8, top: 102.4, born: 9, extBar: 9, qualified: false, dead: false, sweptTouches: 1 },
      { side: "bear", bot: 104, top: 105, born: 3, extBar: 3, qualified: true, dead: false, sweptTouches: 3 },
    ],
    events: [],
    buildups: [],
  };
  const s = storyRead(m, BARS, CFG);
  const lbs = s.targets_above.filter((t) => t.kind === "lb");
  assert.deepEqual(lbs.map((t) => [t.price, t.role, t.extreme]), [
    [101.8, "pullback_origin", 102.4],
    [104, "extreme", 105],
  ]);
});

test("dailyScenarios + renderDailyMarkdown: A is inducement when pocketed, B is the run of the bias edge, C redraws, D names the continuation; the brief carries the approved sections", () => {
  const m = handMap();
  const grid = h4Grid(m, BARS, CFG, { bias: 1 });
  const triggers = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  flagPocket(triggers, m, BARS, CFG, 1);
  for (const t of triggers) {
    t.risk_usd = t.stop == null ? null : Math.round(Math.abs(t.trigger - t.stop) * 100);
    t.over_cap = false;
  }
  const r240 = {
    bars_analyzed: n,
    story: { mode: "buy_story", direction: 1, fresh: true, read: "lows were run and reclaimed 1 bar ago (trap) — look for longs at the bullish LB 98.6–99.4", lb: { zone: [98.6, 99.4], alive: true, thin: false } },
    triggers,
    false_reactions: [{ side: "bear", zone: [101.8, 102.4], qualified: true, inducement: false, tapped: true, distance: 1.8 }],
    liquidity: { intact_above: [{ price: 101, touches: 1 }], intact_below: [{ price: 99.6, touches: 1 }] },
    alignment: "aligned",
    h4_model: { available: true, h4_date: "2026-09-10", h4_high: 101.5, h4_low: 99.2, phase: "closed" },
  };
  const r60 = {
    bars_analyzed: n,
    story: { mode: "sell_story", direction: -1, fresh: true, read: "highs were run… (60)", lb: { zone: [100.5, 100.9], alive: true } },
    triggers: [],
    false_reactions: [],
    liquidity: { intact_above: [{ price: 100.8, touches: 2 }], intact_below: [{ price: 99.7, touches: 1 }] },
    alignment: "against",
  };
  clipToGrid(r60, grid, 1);
  const reads = { 240: r240, 60: r60 };
  const sc = dailyScenarios({ grid, reads, bias: 1, cfg: CFG, tfs: ["240", "60"] });
  assert.equal(sc.wait_for.answer, "yes");
  assert.equal(sc.wait_for.timeframe, "240");
  assert.match(sc.A.label, /inducement, not an entry/);
  assert.match(sc.A.text, /Wait for B/);
  assert.match(sc.B.label, /run of the bias-side edge \(main\)/);
  assert.equal(sc.B.trigger, 98.2);
  assert.equal(sc.C.next_edge.price, 95);
  assert.match(sc.C.text, /a 4h trade below 98 without a reclaim/);
  assert.equal(sc.D.beyond.price, 104);
  // 101 x1 (H4 rung) sits within eq_tolerance of the 1h's 100.8 x2 — one draw
  assert.deepEqual(sc.partials.map((p) => p.price), [100.8]);
  assert.ok(sc.not_done.some((s) => /counter-bias LBs 101.8–102.4 \(4h\)/.test(s)));
  assert.equal(sc.h1.alignment, "noise");
  assert.ok(sc.h1.conditions.length >= 3);

  const md = renderDailyMarkdown({
    generated_at: "2026-09-11T06:37:55.806Z",
    trading_day: "2026-09-11",
    weekday: "Fri",
    counter_trend_note: "closed — counter-trend entries are Mon–Tue only",
    direction_from: "briefs/weekly/2026-W37 (global layer)",
    risk_cap: 250,
    timeframes: ["240", "60"],
    exchange_tz: "America/New_York",
    local_tz: "Europe/Athens",
    results: [
      {
        symbol: "TEST:X1!",
        quote: { last: 100 },
        contract: { journal: "X", usd_per_point: 100 },
        roll: { status: "rolled", offset: 0.5, note: "the 240m series moved by +0.5 on every shared bar since weekly 2026-W37 — a contract roll with back-adjustment." },
        weekly: { week: "2026-W37", bias: "long", regime: "aligned", stale: false, primary_target: 110, primary_atr_weeks: 2.4, invalidation: { level: 90, rule: "weekly close below" } },
        grid,
        scenarios: sc,
        timeframes: reads,
      },
      { symbol: "TEST:SKIP", skipped: "not in the weekly brief" },
    ],
  });
  for (const needle of [
    "## X · LONG · 100 · CONTRACT ROLLED",
    "**Roll.**",
    "**Global.** W long/aligned · target 110 (≈2.4w) · invalidation weekly close below 90.",
    "**H4 grid**",
    "▲ 102.4 counter edge — LB 101.8–102.4 [Q tapped]",
    "▼ 98.2 bias edge — pocket: LB 98.6–99.4 [Q] + 98.2 x1",
    "● 100 price",
    "**Since the last check (H4):**",
    "reclaim → bull LB 98.6–99.4 Q 1 bar ago",
    "**Beyond the grid.** ▲ 104 x2 · ▼ 95 x3.",
    "**What we wait for.** Bias-side run + reclaim: **YES** (4h)",
    "- **A — inducement, not an entry.**",
    "- **B — run of the bias-side edge (main).**",
    "- **Grid break — redraw, not a trade.**",
    "- **D — the counter edge 102.4.**",
    "- Partials on the way: 100.8 x2.",
    "**1h.** NOISE — highs were run… (60)",
    "Local frame inside the grid: 99.7 x1 (ltf) ↔ 100.8 x2 (ltf)",
    "**Timing.** NY session only; the 06:00–10:00 ET H4 candle (13:00–17:00 Europe/Athens, gate open until 21:00) sets the gate",
    "## TEST:SKIP — skipped",
  ]) {
    assert.ok(md.includes(needle), `brief is missing: ${needle}\n---\n${md}`);
  }
});

test("PENDING: a run whose reclaim is not confirmed keeps the edge at the run level, the map exposes the sweep, the scenarios make the reclaim the event", () => {
  // the sweep bar closes below the level; the next bar has not reclaimed yet
  const rows = [
    [101, 102, 100.8, 101.5],
    [101.5, 102, 100.0, 101.0], // pivot low 100.0
    [101, 103, 100.5, 102.5],
    [102.5, 103.5, 101.5, 103],
    [103, 103.2, 99.5, 99.8], // run of 100.0, close below → pending
    [99.8, 100.5, 99.6, 99.9], // still below
  ];
  const bars = rows.map(([o, h, l, c], i) => ({ time: 1_756_200_000 + i * 900, open: o, high: h, low: l, close: c }));
  const cfg = { ...MARCO_DEFAULTS, pivot_len: 1, atr_length: 3, confirm_bars: 2, min_touches: 2, min_level_age: 50 };
  const map = buildLiquidityMap(bars, cfg);
  assert.ok(map.pending.bull, "the unresolved sweep is exposed");
  assert.equal(map.pending.bull.level, 100);
  assert.equal(map.pending.bull.ext, 99.5);
  assert.equal(map.pending.bull.run_bar, 4);
  assert.equal(map.pending.bull.missed, 2);
  assert.equal(map.pending.bull.bars_left, 1);
  assert.equal(map.pending.bear, null);
  assert.equal(map.blocks.length, 0, "no LB yet");
  assert.equal(map.levels.lows.length, 0, "the level is consumed");

  // the grid on a hand map with the same pending: the bias edge is the run level, not the next rung
  const m = handMap();
  m.levels.lows = m.levels.lows.filter((l) => l.price !== 99.6);
  m.blocks = m.blocks.filter((b) => !(b.side === "bull" && b.bot === 98.6));
  m.pending = { bull: { level: 99.6, touches: 2, ext: 99.1, run_bar: n - 3, missed: 2, bars_left: 2, qualified: true }, bear: null };
  const g = h4Grid(m, BARS, CFG, { bias: 1 });
  assert.equal(g.lower.edge, 99.6);
  assert.equal(g.lower.floor_kind, "pending");
  assert.equal(g.lower.kill, 99.1);
  assert.equal(g.lower.pending.bars_since_run, 2);
  assert.deepEqual(g.lower.pending.lb_if_reclaimed, [99.1, 99.6]);
  assert.deepEqual(g.lower.beyond.map((r) => r.price), [98.2, 95]);
  assert.equal(g.state, "pending_low");
  assert.equal(g.upper.edge, 102.4);

  const reads = {
    240: {
      story: { mode: "no_mans_land", direction: 0, fresh: null, read: "build-up phase" },
      triggers: [],
      false_reactions: [],
      liquidity: { intact_above: [{ price: 101, touches: 1 }], intact_below: [] },
      alignment: "none",
    },
    60: { story: { mode: "no_mans_land", direction: 0, read: "1h" }, triggers: [], false_reactions: [], liquidity: { intact_above: [], intact_below: [] }, alignment: "none" },
  };
  const sc = dailyScenarios({ grid: g, reads, bias: 1, cfg: CFG, tfs: ["240", "60"], spec: { usd_per_point: 100 }, cap: 250 });
  assert.equal(sc.wait_for.answer, "pending");
  assert.match(sc.wait_for.read, /low 99.6 x2 run 2 bars ago to 99.1 — reclaim not confirmed, 2 of 3 bars left/);
  assert.equal(sc.A.label, "A — the reclaim (the event)");
  assert.equal(sc.A.trigger, 99.6);
  assert.equal(sc.A.stop, 98.9); // 99.1 − 0.1 ATR (ATR 2)
  assert.equal(sc.A.target, 101);
  assert.equal(sc.A.rr, 2);
  assert.equal(sc.A.risk_usd, 70);
  assert.equal(sc.B.label, "B — the run deepens");
  assert.equal(sc.C.label, "Grid break — breakdown, redraw");
  assert.match(sc.C.text, /within 2 bar\(s\)/);
  assert.equal(sc.C.next_edge.price, 98.2);
  assert.ok(sc.not_done[0].startsWith("no entries on the run itself"));
  assert.match(sc.h1.conditions[0], /^A: a 1h\/15m close back above 99.6 within 2 4h bar\(s\)/);

  const md = renderDailyMarkdown({
    generated_at: "x",
    trading_day: "2026-09-12",
    weekday: "Sat",
    counter_trend_note: "closed",
    direction_from: "w",
    risk_cap: 250,
    timeframes: ["240", "60"],
    results: [{ symbol: "T", quote: { last: 100 }, contract: { journal: "T" }, roll: { status: "unknown" }, weekly: { bias: "long", regime: "aligned", primary_target: 110, invalidation: null }, grid: g, scenarios: sc, timeframes: reads }],
  });
  assert.ok(md.includes("▼ 99.6 bias edge — PENDING: run to 99.1 2 bars ago, reclaim not confirmed (2 of 3 bars left)"), md);
  assert.ok(md.includes("● 100 price — the run is unresolved (PENDING)"), md);
  assert.ok(md.includes("Bias-side run + reclaim: **PENDING** (4h)"), md);
});
