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
  basisReference,
  shiftPrices,
  basisBars,
  splitForming,
  dailyScenarios,
  dailySetups,
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

test("dailyScenarios + dailySetups + renderDailyMarkdown: A is inducement when pocketed, B is the run of the bias edge, C redraws, D names the continuation; the v3 brief prints Bias · Now · Grid and every scenario as a journal setup in Ukrainian", () => {
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

  // the engine analysed the closed 09:00–13:00 Athens bar; the 13:00–17:00 bar is still open
  const r1 = {
    symbol: "TEST:X1!",
    quote: { last: 100 },
    contract: { journal: "X", usd_per_point: 100 },
    roll: { status: "rolled", offset: 0.5, note: "the 240m series moved by +0.5 on every shared bar since weekly 2026-W37 — a contract roll with back-adjustment." },
    weekly: { week: "2026-W37", bias: "long", regime: "aligned", stale: false, primary_target: 110, primary_atr_weeks: 2.4, invalidation: { level: 90, rule: "weekly close below" } },
    grid,
    scenarios: sc,
    timeframes: reads,
    exec_bars: {
      timeframe: "240",
      last_closed_time: Date.parse("2026-09-11T06:00:00Z") / 1000,
      forming: { time: Date.parse("2026-09-11T10:00:00Z") / 1000, open: 100, high: 100.6, low: 99.5, close: 100.2 },
    },
  };
  const daily = {
    generated_at: "2026-09-11T10:37:55.806Z",
    trading_day: "2026-09-11",
    weekday: "Fri",
    counter_trend_open: false,
    counter_trend_note: "closed — counter-trend entries are Mon–Tue only",
    direction_from: "briefs/weekly/2026-W37 (global layer)",
    risk_cap: 250,
    timeframes: ["240", "60"],
    exchange_tz: "America/New_York",
    local_tz: "Europe/Athens",
    results: [r1, { symbol: "TEST:SKIP", skipped: "not in the weekly brief" }],
  };

  // the setups in the journal's shape: the edge run is the main one, the next edge beyond the grid a setup of its own, the pocketed tap only a skip line
  const S = dailySetups(r1, daily);
  assert.equal(S.state, "VALID");
  assert.deepEqual(
    S.setups.map((s) => [s.n, s.main, s.instrument, s.direction, s.setup_type, s.key_levels, s.targets, s.planned_size, s.planned_r]),
    [
      [1, true, "X", "long", "sweep-trigger", [98.2], [101, 102.4, 104], 1, null],
      [2, false, "X", "long", "sweep-trigger", [95], [98.2, 100.8, 102.4], 1, null],
    ],
  );
  for (const s of S.setups) assert.ok(s.key_levels.some((k) => k < s.targets[0]), "journal invariant: a key level on the entry side of T1");
  assert.ok(S.setups[0].setup_description.startsWith("long/aligned · inval 90 Wclose\n- entry when: "), S.setups[0].setup_description);
  assert.ok(!/no-entry|timing:|not done/i.test(S.setups[0].setup_description));
  assert.ok(!S.setups.some((s) => s.setup_type === "early-week-counter-trend"), "Friday: no counter-trend setup");
  // Monday: the counter edge becomes an early-week-counter-trend setup against the bias, nearest with-bias liquidity as the only target
  const ct = dailySetups(r1, { ...daily, weekday: "Mon", counter_trend_open: true }).setups.find((s) => s.setup_type === "early-week-counter-trend");
  assert.ok(ct, "counter-trend setup on Monday");
  assert.equal(ct.direction, "short");
  assert.deepEqual(ct.key_levels, [102.4]);
  assert.deepEqual(ct.targets, [100.8]);
  assert.match(ct.setup_description, /^контр-тренд \(пн–вт\) проти W long · long\/aligned · inval 90 Wclose\n- entry when: run 102.4 \+ 1h-закриття назад під ним → short/);

  const md = renderDailyMarkdown(daily);
  for (const needle of [
    "Знято 13:37 Europe/Athens.",
    "| X | LONG | VALID | 1. sweep+reclaim 98.2 (−1.8 пт) → long · stop з 1h/15m LB · T1 101 |",
    "**Сьогодні.** Вікна London 10:00–18:30 · NY 16:30–23:00 Europe/Athens",
    "Гейт: 4h-свічка 13:00–17:00; з 17:00 до 21:00 входи з біасом після трейду за її екстремум (V5). Наступні 4h-закриття: 17:00 · 21:00 · 01:00. Контр-тренд: закритий (лише пн–вт).",
    "## X · LONG · 100 · inval W close < 90 · CONTRACT ROLLED",
    "**Roll.**",
    "**Bias.** W long/aligned · глобальна ціль 110 (≈2.4w).",
    "**Now: VALID (4h).** trap: лоу run і повернення у барі 05:00–09:00 → bull LB 98.6–99.4.",
    "повернення → bull LB 98.6–99.4 Q у барі 05:00–09:00",
    "Стан змінить: 4h-трейд під 98 без повернення → BREAKDOWN · run 102.4 → TOP.",
    "Бар 13:00–17:00 ще відкритий: H 100.6 / L 99.5 / зараз 100.2 — до закриття не рахується.",
    "**Grid 4h**",
    "▲ 102.4 контр-край — LB 101.8–102.4 [Q tapped]",
    "▼ 98.2 край біасу — кишеня: LB 98.6–99.4 [Q] + 98.2 x1",
    "● 100 ціна",
    "  далі: ▲ 104 x2 · ▼ 95 x3",
    "**Сетапи** (спочатку досяжні сьогодні; size 1, ліміт $250).",
    "### 1. X · long · sweep-trigger · K 98.2 · T 101 / 102.4 / 104 · R — · size 1 — головний",
    "```\nlong/aligned · inval 90 Wclose\n- entry when: 1h/15m-закриття під 98.2 і наступне закриття назад над ним → тап LB, яку лишить той бар · London 10:00–18:30 · NY 16:30–23:00 · після 17:00 через гейт\n",
    "- K1 sweep+reclaim 98.2 · stop під лоу run з 1h/15m LB, макс 2.5 пт = $250 · RR — · run краю біасу x1",
    "- BE: 101 · стоп → вхід після взяття",
    "- breakdown: 4h-трейд під 98 без повернення → край 98.2 знято, сітка перемальовується до 95 x3 · entry when: run того краю закривається назад",
    "- aggressive tap 98.6–99.4 (4h LB): skip · inducement, під нею кишеня до 98.2",
    "- global: 110 (≈2.4w) лише фінальна ціль\n```",
    "### 2. X · long · sweep-trigger · K 95 · T 98.2 / 100.8 / 102.4 · R — · size 1",
    "- entry when: run 95 (95 x3) + 1h/15m-закриття назад над ним → тап LB, яку лишить закриття",
    "- breakdown: тижневе закриття під 90 = інвалідація W-біасу, лонгів нема",
    "Все інше = чекаємо. Часткова фіксація: 100.8 x2.",
    "TOP 102.4: часткова фіксація на long біля 102.4 · контр-тренд закритий (лише пн–вт) · білдап, який лишить його хибна реакція, = наступний тригер на long · continuation when: 1h-закриття над 102.4 → шлях до 104 x2 відкритий, стоп у BE.",
    "1h: NOISE · sell story проти біасу — вхід лише з 15m-структури повернення · рамка 99.7 x1 ↔ 100.8 x2.",
    "Гейт-свічка (2026-09-10): H 101.5 / L 99.2 — закрита.",
    "**Alerts:** 102.4 ↑ · 98.2 ↓ · 95 ↓.",
    "## TEST:SKIP — пропущено",
  ]) {
    assert.ok(md.includes(needle), `brief is missing: ${needle}\n---\n${md}`);
  }
  assert.ok(!/no-entry|Not done:|NY session only|Scenarios|entry when: a /.test(md), md);
});

test("splitForming: the bar still open is cut from the series and returned as forming; a closed last bar and D/W timeframes pass through untouched", () => {
  const bars = [
    { time: 1000, open: 1, high: 1, low: 1, close: 1 },
    { time: 1000 + 14400, open: 2, high: 2, low: 2, close: 2 },
    { time: 1000 + 28800, open: 3, high: 3, low: 3, close: 3 },
  ];
  const mid = splitForming(bars, "240", 1000 + 28800 + 120);
  assert.equal(mid.closed.length, 2);
  assert.equal(mid.forming.time, 1000 + 28800);
  assert.equal(mid.forming.closes_at, 1000 + 43200);
  const done = splitForming(bars, "240", 1000 + 43200);
  assert.equal(done.closed.length, 3);
  assert.equal(done.forming, null);
  assert.equal(splitForming(bars, "D", 0).closed.length, 3);
  assert.equal(splitForming(bars, "W", 0).forming, null);
  assert.equal(splitForming([bars[0]], "240", 0).closed.length, 1);
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
  for (const needle of [
    "▼ 99.6 край біасу — PENDING: run до 99.1 2 бар(ів) тому, повернення не підтверджене (2 з 3 барів лишилось)",
    "● 100 ціна — run не вирішений (PENDING)",
    "**Now: PENDING (4h).** лоу 99.6 x2 run 2 бар(ів) тому до 99.1 — вирішує повернення.",
    "Стан змінить: 4h-закриття назад над 99.6 протягом 2 4h-бар(ів) → VALID (bull LB 99.1–99.6) · пропуск або 4h-трейд під 99.1 → BREAKDOWN.",
    "| T | LONG | PENDING | 1. sweep+reclaim 99.6 протягом 2 4h-бар(ів) → тап 99.1–99.6 · stop 98.9 · $70 · T1 101 |",
    "### 1. T · long · sweep-trigger · K 99.6 · T 101 / 102.4 / 104 · R 2 · size 1 — головний",
    "- entry when: 1h/15m-закриття назад над 99.6 протягом 2 4h-бар(ів) → тап bull LB 99.1–99.6, яку лишить закриття (не на самому run, V6) · London 08:00–16:30 UK · NY 09:30–16:00 ET · після 10:00 ET через гейт",
    "- K1 sweep+reclaim 99.6 · stop 98.9 · $70 · RR 2 · run краю 99.6 x2, повернення = trap",
    "- BE: 101 · стоп → вхід після взяття",
    "- deeper run: новий лоу під 99.1 — екстремум і стоп їдуть за ним, $ перерахувати проти ліміту · те саме entry when",
    "- breakdown: нема закриття назад над 99.6 протягом 2 4h-бар(ів), або 4h-трейд під 99.1 → сітка перемальовується до 98.2 x1 · entry when: run того краю закривається назад",
    "### 2. T · long · sweep-trigger · K 98.2 · T 99.6 / 101 / 102.4 · R — · size 1",
    "- K1 sweep+reclaim 98.2 · stop під лоу run з 1h/15m LB · RR — · наступний край за сіткою, −1.8 пт від ціни",
    "**Alerts:** 102.4 ↑ · 99.6 ↓ · 99.1 ↓ · 98.2 ↓.",
  ]) {
    assert.ok(md.includes(needle), `brief is missing: ${needle}\n---\n${md}`);
  }
  assert.ok(!/no-entry|Not done:|NY session only|not on the run/.test(md), md);

  // the bar in progress (2026-09-23 engine gap): shown, never counted — a deeper low and a
  // price back over the level are named as "in progress", the state stays PENDING
  const md2 = renderDailyMarkdown({
    generated_at: "2026-09-12T10:07:00.000Z",
    trading_day: "2026-09-12",
    weekday: "Sat",
    counter_trend_note: "closed",
    direction_from: "w",
    risk_cap: 250,
    timeframes: ["240", "60"],
    results: [
      {
        symbol: "T",
        quote: { last: 99.8 },
        contract: { journal: "T" },
        roll: { status: "unknown" },
        weekly: { bias: "long", regime: "aligned", primary_target: 110, invalidation: null },
        grid: g,
        scenarios: sc,
        timeframes: reads,
        exec_bars: {
          timeframe: "240",
          last_closed_time: Date.parse("2026-09-12T06:00:00Z") / 1000,
          forming: { time: Date.parse("2026-09-12T10:00:00Z") / 1000, open: 100, high: 100.3, low: 99, close: 99.8 },
        },
      },
    ],
  });
  assert.ok(md2.includes("| T | LONG | PENDING |"), md2);
  assert.ok(md2.includes("**Now: PENDING (4h).** лоу 99.6 x2 run у барі 18:00–22:00 до 99.1 — вирішує повернення."), md2);
  assert.ok(md2.includes("Бар 06:00–10:00 ще відкритий: H 100.3 / L 99 / зараз 99.8 — до закриття не рахується · новий лоу за 99.1 · ціна над 99.6, повернення лише на закритті 10:00."), md2);
  assert.ok(md2.includes("- entry when: 1h/15m-закриття назад над 99.6 до 14:00 → тап bull LB 99.1–99.6"), md2);
});

test("basisReference: the freshest stored basis wins — a daily older than the new weekly hands over to the weekly and its shift stays behind", () => {
  const bars = [{ time: 1, open: 1, high: 1, low: 1, close: 1 }];
  const prevDaily = { generated_at: "2026-09-11T07:28:53Z", trading_day: "2026-09-11" };
  const prev = { basis: { 240: bars }, weekly_shift: 0.00405 };
  const weekly = { generated_at: "2026-09-13T18:38:32Z", week: "2026-W38" };
  const wk0 = { basis: { 240: bars } };
  // Monday after a new weekend brief: compare against the weekly, carry nothing (the W37→W38 6E double-shift)
  const r = basisReference({ prev, prevDaily, weekly, wk0, execTf: "240" });
  assert.equal(r.from, "weekly 2026-W38");
  assert.equal(r.carried, 0);
  // mid-week: the previous daily is newer than the weekly — its shift carries
  const later = { generated_at: "2026-09-15T07:00:00Z", trading_day: "2026-09-15" };
  const r2 = basisReference({ prev, prevDaily: later, weekly, wk0, execTf: "240" });
  assert.equal(r2.from, "daily 2026-09-15");
  assert.equal(r2.carried, 0.00405);
  // a weekly without a stored basis: the older daily's bars still serve, its shift does not
  const r3 = basisReference({ prev, prevDaily, weekly, wk0: {}, execTf: "240" });
  assert.equal(r3.from, "daily 2026-09-11");
  assert.equal(r3.carried, 0);
  assert.equal(basisReference({ prev: null, prevDaily: null, weekly, wk0: {}, execTf: "240" }), null);
});

// ---------------------------------------------------------------------------
// E1 (Elijah, 2026-09-14): the structural tier — what the run left intact
// inside its own structure, at any distance.

test("flagPocket structural tier: an invalid tap is a pocket at the build-up it left behind; an unrefined tap is the aggressive entry and the sweep of the left swing is refined", () => {
  const m = handMap();
  m.levels.lows = m.levels.lows.filter((l) => l.price !== 98.2); // nothing within respect distance now
  const bull = m.blocks.find((b) => b.side === "bull" && !b.dead);
  bull.grade = "invalid";
  bull.left = { price: 95, touches: 3, strong: { price: 95, touches: 3 } };
  let triggers = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  let tap = triggers.find((t) => t.kind === "tap");
  assert.equal(tap.grade, "invalid");
  const floors = flagPocket(triggers, m, BARS, CFG, 1);
  assert.equal(floors.size, 1);
  assert.equal(tap.pocket.floor, 95);
  assert.equal(tap.pocket.from, "structure");
  assert.equal(tap.pocket.gap, 3.6);
  assert.match(tap.note, /no entry until 95 is run/);
  assert.equal(triggers.find((t) => t.kind === "sweep" && t.trigger === 95).preferred, true);

  bull.grade = "unrefined";
  bull.left = { price: 97, touches: 1, strong: null };
  m.levels.lows.push({ price: 97, touches: 1, born: 6 });
  triggers = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  tap = triggers.find((t) => t.kind === "tap");
  flagPocket(triggers, m, BARS, CFG, 1);
  assert.equal(tap.pocket, undefined);
  assert.deepEqual(tap.unrefined, { floor: 97, touches: 1, gap: 1.6, from: "structure", kind: "swing" });
  assert.match(tap.note, /this tap is the aggressive entry, the sweep of 97 the refined one/);
  assert.equal(triggers.find((t) => t.kind === "sweep" && t.trigger === 97).refined, true);
  assert.equal(triggers.find((t) => t.kind === "sweep" && t.trigger === 95).preferred, undefined);
});

test("clipToGrid structural tier: a level edge is the floor at any distance, an LB edge is not liquidity, an x1 rung between the LTF extreme and the edge makes the tap unrefined", () => {
  const tap = () => ({ kind: "tap", side: "long", trigger: 99.3, stop: 98.7, stop_anchor: [98.9, 99.3], target: 101, rr: 2.8, distance: 0.7, note: null });
  // edge = the x3 level 95, 3.9 below the LTF extreme — beyond respect (1.5)
  const far = handMap();
  far.levels.lows = far.levels.lows.filter((l) => l.price !== 98.2);
  far.blocks = far.blocks.filter((b) => b.side !== "bull");
  const gFar = h4Grid(far, BARS, CFG, { bias: 1 });
  assert.equal(gFar.lower.edge, 95);
  const rFar = { story: { direction: 1 }, triggers: [tap()], liquidity: { intact_below: [], intact_above: [] } };
  clipToGrid(rFar, gFar, 1);
  assert.equal(rFar.triggers[0].pocket.floor, 95);
  assert.equal(rFar.triggers[0].pocket.from, "h4 grid");
  // edge = the bull LB extreme 98.6 (Elijah's 5m entry above the 1h LB): the stop refinement, not liquidity
  const lb = handMap();
  lb.levels.lows = lb.levels.lows.filter((l) => l.price !== 98.2);
  const gLb = h4Grid(lb, BARS, CFG, { bias: 1 });
  assert.equal(gLb.lower.floor_kind, "lb");
  const rLb = { story: { direction: 1 }, triggers: [tap()], liquidity: { intact_below: [], intact_above: [] } };
  clipToGrid(rLb, gLb, 1);
  assert.equal(rLb.triggers[0].pocket, undefined);
  assert.equal(rLb.triggers[0].unrefined, undefined);
  // an x1 rung 99.0 between the LTF extreme 99.2 and the LB edge → unrefined from the grid
  const rung = handMap();
  rung.levels.lows = [{ price: 99.6, touches: 1, born: 12 }, { price: 99.0, touches: 1, born: 10 }, { price: 95, touches: 3, born: 1 }];
  rung.blocks = rung.blocks.map((b) => (b.side === "bull" && !b.dead ? { ...b, bot: 97.6, top: 98.4 } : b));
  const gRung = h4Grid(rung, BARS, CFG, { bias: 1 });
  assert.deepEqual(gRung.lower.rungs.map((r) => r.price), [99.6, 99.0]);
  const t3 = { ...tap(), trigger: 99.5, stop_anchor: [99.2, 99.5] };
  const rRung = { story: { direction: 1 }, triggers: [t3], liquidity: { intact_below: [], intact_above: [] } };
  clipToGrid(rRung, gRung, 1);
  assert.equal(t3.pocket, undefined);
  assert.deepEqual(t3.unrefined, { floor: 99.0, touches: 1, gap: 0.2, from: "h4 grid", kind: "swing" });
});

test("dailyScenarios (E1): an unrefined A is the aggressive grade with its refined sweep named; D calls the counter LB invalid and points at the build-up under it; the brief prints the deepened run", () => {
  const m = handMap();
  m.levels.lows = [{ price: 99.6, touches: 1, born: 12 }, { price: 97, touches: 1, born: 6 }, { price: 95, touches: 3, born: 1 }];
  const bull = m.blocks.find((b) => b.side === "bull" && !b.dead);
  bull.grade = "unrefined";
  bull.left = { price: 97, touches: 1, strong: null };
  m.events.push({ bar: n - 3, type: "bull_lb_deepened", zone: [98.8, 99.4], ext: 98.6, level: 99.4 });
  const grid = h4Grid(m, BARS, CFG, { bias: 1 });
  const triggers = triggerSetups(m, BARS, CFG, { direction: 1, max: 6 });
  flagPocket(triggers, m, BARS, CFG, 1);
  for (const t of triggers) {
    t.risk_usd = t.stop == null ? null : Math.round(Math.abs(t.trigger - t.stop) * 100);
    t.over_cap = false;
  }
  const r240 = {
    bars_analyzed: n,
    story: { mode: "buy_story", direction: 1, fresh: true, read: "lows were run and reclaimed 1 bar ago (trap)", lb: { zone: [98.6, 99.4], alive: true, thin: false } },
    triggers,
    false_reactions: [],
    liquidity: { intact_above: [{ price: 101, touches: 1 }], intact_below: [{ price: 99.6, touches: 1 }] },
    alignment: "aligned",
  };
  const sc = dailyScenarios({ grid, reads: { 240: r240 }, bias: 1, cfg: CFG, tfs: ["240"] });
  assert.match(sc.A.label, /tap of the bias-side LB \(aggressive\)/);
  assert.match(sc.A.text, /Unrefined \(E1\): the low 97 from the left is intact — the refined entry is its sweep: 97 → stop/);
  assert.match(sc.A.text, /Elijah waits for that point/);
  assert.match(sc.D.text, /invalid \(E1\)/);
  assert.match(sc.D.text, /no buys above it/);
  assert.ok(sc.not_done.some((s) => /build-up forming under a counter-bias LB/.test(s)));
  assert.ok(sc.h1 === null);
  const md = renderDailyMarkdown({
    generated_at: "2026-09-14T06:00:00.000Z",
    trading_day: "2026-09-14",
    weekday: "Mon",
    counter_trend_note: "open",
    direction_from: "briefs/weekly/2026-W38 (global layer)",
    risk_cap: 250,
    timeframes: ["240"],
    results: [{ symbol: "TEST:X1!", quote: { last: 100 }, weekly: { bias: "long", regime: "aligned" }, grid, scenarios: sc, timeframes: { 240: r240 } }],
  });
  assert.ok(md.includes("bull LB 98.8–99.4 поглиблена до 98.6 у барі 18:00–22:00 — той самий trap; вирішує повернення за 99.4"), md);
  assert.ok(/### \d\. TEST:X1! · long · lb-zone-tap · K [0-9.]+/.test(md), md);
  assert.ok(/- K1 tap [0-9.]+ · stop [0-9.]+ · \$\d+ · RR [0-9.—]+ · 4h LB [0-9.–]+, агресивний вхід \(E1\)/.test(md), md);
  assert.ok(/- refined \(E1\): лоу 97( x\d)? зліва цілий — уточнений вхід, коли його 1h\/15m-run закриється назад, той самий стоп/.test(md), md);
});

// ---------------------------------------------------------------------------
// Horizon (trader, 2026-09-23): positions are held a day or two — a scenario is
// a 4h/1h level; 15m/5m structure only refines the stop inside it.

test("dailyScenarios (horizon): a 5m trap next to price never becomes the scenario — the nearest H4 rung run does, and a 15m tap only refines the 4h zone", () => {
  const edge = (e, extra = {}) => ({ edge: e, anchor: { kind: "level", price: e, touches: 3 }, cluster: [], weak: false, chained: false, floor_kind: "level", rungs: [], beyond: [], kill: e, ...extra });
  const grid = {
    price: 1000,
    atr: 10,
    inside: true,
    lower: edge(900, { rungs: [{ kind: "level", price: 960, touches: 1 }], beyond: [{ kind: "level", price: 880, touches: 2 }], kill: 898 }),
    upper: edge(1060, { rungs: [{ kind: "level", price: 1030, touches: 1 }], beyond: [{ kind: "level", price: 1100, touches: 2 }] }),
    since: [],
  };
  const trig = (tf, kind, trigger, stop, zone = null) => ({ tf, kind, side: "long", trigger, stop, stop_anchor: zone, target: 1010, rr: 3, distance: Math.abs(1000 - trigger), confirmed: false, touches: 1, risk_usd: Math.abs(trigger - stop) * 2, over_cap: false, note: null });
  const read = (triggers) => ({ story: { mode: "buy_story", direction: 1, fresh: true, read: "lows were run and reclaimed 2 bars ago (trap)", lb: { zone: [900, 940] } }, triggers, false_reactions: [], liquidity: { intact_above: [], intact_below: [] }, alignment: "aligned" });
  const reads = {
    240: read([{ ...trig("240", "tap", 940, 890, [900, 940]), over_cap: true }]),
    15: read([trig("15", "tap", 925, 919, [920, 925])]),
    5: read([trig("5", "sweep", 995, 992, [992, 994])]),
  };
  const sc = dailyScenarios({ grid, reads, bias: 1, cfg: CFG, tfs: ["240", "15", "5"], spec: { usd_per_point: 2 }, cap: 60 });
  assert.equal(sc.B.trigger, 960);
  assert.match(sc.B.label, /nearest H4 rung/);
  assert.equal(sc.B.target, 1030);
  assert.equal(sc.A.tf, "240");
  assert.equal(sc.A.trigger, 940);
  // the 4h tap is over the cap; the 15m tap inside the zone is its refinement, not a scenario
  assert.equal(sc.A.refined.tf, "15");
  assert.equal(sc.A.refined.trigger, 925);
});
