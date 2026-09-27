/**
 * The direction-now read (src/core/marco_direction.js, docs/MARCO.md §3.2,
 * docs/MARCO-DIRECTION.md §9.2 and §17) and the map fixes of the same build (U4).
 * Real bars: tests/fixtures/6e_2026-09-26.json (case U4), mnq_W_2026-09-26.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARCO_DEFAULTS,
  buildLiquidityMap,
  seedFromMap,
  storyRead,
  cfgForTf,
  isHtfTf,
  sessionDate,
  closeDate,
  splitFormingHtf,
  directionRead,
  barRead,
  composeDirection,
  directionStack,
  directionLinesEn,
  directionBlockUa,
  biasVsDirection,
  fvgEdges,
} from "../src/core/marco.js";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf-8"));
const E6 = fx("6e_2026-09-26");
const through = (bars, iso) => bars.filter((b) => sessionDate(b.time) <= iso);
const cfg = MARCO_DEFAULTS;
// the maps of the same closed bars give the levels their roles (the D map inherits the W levels, as in the runs)
const mapsFor = (W, D) => {
  const mW = buildLiquidityMap(W, cfgForTf(cfg, "W"));
  const mD = D ? buildLiquidityMap(D, cfgForTf(cfg, "D"), { seed: seedFromMap(mW, W, { before: D[0]?.time, price: D.at(-1)?.close, cfg }) }) : null;
  return { W: mW, D: mD };
};
const stackAt = (iso) => {
  const W = through(E6.bars.W, iso);
  const D = through(E6.bars.D, iso);
  return directionStack({ W, D }, cfg, { maps: mapsFor(W, D) });
};

// synthetic D bars: a flat base with a 3-bar fractal high at 102 on bar 2 and a fractal low at 100 on bar 4
function mk(rows, { start = 1_750_000_000, step = 86400 } = {}) {
  return rows.map(([o, h, l, c], i) => ({ time: start + i * step, open: o, high: h, low: l, close: c }));
}
const BASE = [
  [100, 100.5, 99.5, 100],
  [100, 101, 99.8, 100.8],
  [100.8, 102, 100.5, 101], // fractal high 102
  [101, 101.5, 100.2, 100.6],
  [100.6, 101.2, 100, 100.4], // fractal low 100
];
const TRAP = [
  [100.4, 102.6, 100.3, 102.3],
  [102.3, 102.9, 101.9, 101.2],
]; // 102 run, closed beyond, then back = failed breakout → heading down, kill 102.9

test("two-bar decision on a bare fractal: the closes name the decision; only the failed breakout (the trap) sets a heading — an acceptance is inducement, a held sweep of a single-touch level too", () => {
  const cases = [
    { rows: [[100.4, 102.6, 100.3, 102.3], [102.3, 102.9, 101.9, 102.5]], decision: "invalidated", role: "induce", heading: 0 },
    { rows: [[100.4, 102.6, 100.3, 101.7], [101.7, 102.9, 101.5, 102.4]], decision: "late_acceptance", role: "induce", heading: 0 },
    { rows: [[100.4, 102.6, 100.3, 102.3], [102.3, 102.4, 100.9, 101.2]], decision: "failed_breakout", role: "trap", heading: -1 },
    { rows: [[100.4, 102.6, 100.3, 101.7], [101.7, 101.9, 100.9, 101.2]], decision: "held", role: "induce", heading: 0 },
  ];
  for (const c of cases) {
    const r = directionRead(mk([...BASE, ...c.rows]), { timeframe: "D" });
    const ev = r.events.at(-1);
    assert.equal(ev.decision, c.decision, c.decision);
    assert.equal(ev.role, c.role, c.decision);
    assert.equal(ev.level, 102);
    assert.equal(r.heading, c.heading, c.decision);
  }
  // one bar after the run: provisional, the next close decides
  const p = directionRead(mk([...BASE, [100.4, 102.6, 100.3, 102.3]]), { timeframe: "D" });
  assert.equal(p.heading, 0);
  assert.equal(p.pending.length, 1);
  assert.equal(p.pending[0].closes[0].beyond, true);
});

test("a bar that runs levels on both sides decides nothing; the furthest level of one side is the one decided", () => {
  // a fractal low at 99 on bar 2 as well, then an outside bar through both
  const rows = [
    [100, 100.5, 99.5, 100],
    [100, 101, 99.4, 100.8],
    [100.8, 102, 99, 101], // fractal high 102 and low 99
    [101, 101.5, 99.6, 100.6],
    [100.6, 101.2, 99.8, 100.4],
    [100.4, 102.5, 98.7, 100.5], // runs both
    [100.5, 101, 100, 100.6],
  ];
  const r = directionRead(mk(rows), { timeframe: "D" });
  assert.equal(r.heading, 0);
  assert.ok(!r.events.some((e) => e.decision === "invalidated" || e.decision === "failed_breakout"));
});

test("the trap sets the heading and its kill; closes back through the consumed level are no event (no 'lost' state); acceptance beyond the kill ends it (the other crowd induced); a failed breakout on the other side flips it", () => {
  const down = directionRead(mk([...BASE, ...TRAP]), { timeframe: "D" });
  assert.equal(down.heading, -1);
  assert.equal(down.since.role, "trap");
  assert.equal(down.since.level, 102);
  assert.equal(down.kill, 102.9);
  // two closes back above the consumed 102 — nothing
  const back = [
    [101.2, 102.4, 101.0, 102.2],
    [102.2, 102.5, 101.8, 102.3],
  ];
  const still = directionRead(mk([...BASE, ...TRAP, ...back]), { timeframe: "D" });
  assert.equal(still.heading, -1);
  assert.deepEqual(still.last, still.since);
  assert.ok(!still.events.some((e) => e.decision === "lost"));
  // acceptance beyond the kill 102.9: the LB is gone, buyers induced, no heading until their trap
  const killed = directionRead(mk([...BASE, ...TRAP, ...back, [102.3, 103.2, 102.0, 103.1], [103.1, 103.5, 102.8, 103.3]]), { timeframe: "D" });
  assert.equal(killed.heading, 0);
  assert.equal(killed.since, null);
  assert.equal(killed.last.role, "kill");
  assert.deepEqual(killed.killed, { level: 102.9, kill: 102.9, date: killed.last.decide_date, crowd: "buyers" });
  // a failed breakout at the low 100 while heading down: the trap on the other side turns it up
  const flipped = directionRead(mk([...BASE, ...TRAP, [101.2, 101.4, 99.8, 99.9], [99.9, 100.6, 99.7, 100.4]]), { timeframe: "D" });
  assert.equal(flipped.heading, 1);
  assert.equal(flipped.since.role, "trap");
  assert.equal(flipped.since.level, 100);
  assert.equal(flipped.kill, 99.7);
});

test("the map's roles: a held sweep of a build-up is the trap with no heading; with the heading it takes the target — done when nothing further is in reach, else the next target", () => {
  // bar 5 confirms the fractal low 100 (bar 4); bar 6 runs it and closes back, bar 7 closes back too
  const bars = mk([...BASE, [100.4, 100.9, 100.1, 100.6], [100.6, 100.7, 99.8, 100.2], [100.2, 100.9, 100.1, 100.5]]);
  const buildup = { side: "low", price: 100, touches: 3, swept: 6, sweptExt: 99.8 };
  const bare = directionRead(bars, { timeframe: "D" });
  assert.equal(bare.heading, 0);
  assert.equal(bare.last.role, "induce");
  const withMap = directionRead(bars, { timeframe: "D", map: { levels: { lows: [], highs: [] }, buildups: [buildup] }, cfg });
  assert.equal(withMap.heading, 1);
  assert.equal(withMap.since.role, "trap");
  assert.deepEqual(withMap.since.buildup, { price: 100, touches: 3 });
  assert.equal(withMap.kill, 99.8);
  // heading down from the trap at 102, then the build-up 100 is run and accepted through (bar 7): the target is taken
  const run = mk([...BASE, ...TRAP, [101.2, 101.3, 99.9, 99.95], [99.95, 100.2, 99.6, 99.7]]);
  const bu = { side: "low", price: 100, touches: 2, swept: 7, sweptExt: 99.6 };
  const done = directionRead(run, { timeframe: "D", map: { levels: { lows: [], highs: [] }, buildups: [bu] }, cfg });
  assert.equal(done.heading, 0);
  assert.equal(done.last.role, "target");
  assert.deepEqual(done.taken, { price: 100, touches: 2, date: done.last.decide_date, by: "accepted", extreme: 99.6 });
  assert.equal(done.done.side, -1);
  assert.equal(done.done.since.level, 102);
  const more = directionRead(run, { timeframe: "D", map: { levels: { lows: [{ price: 98, touches: 1 }], highs: [] }, buildups: [bu] }, cfg });
  assert.equal(more.heading, -1);
  assert.equal(more.done, null);
  assert.deepEqual(more.target, { price: 98, touches: 1, buildup: false });
});

test("6E U4 (real bars, W map): W ↓ since the W35 close — the trap at 1.1705 (W34 closed 1.17335 above, W35 1.1628 back), kill 1.17625, target 1.1404 x2", () => {
  const W = through(E6.bars.W, "2026-09-18");
  const w = directionRead(W, { timeframe: "W", map: mapsFor(W, null).W, cfg });
  assert.equal(w.heading, -1);
  assert.equal(w.since.decision, "failed_breakout");
  assert.equal(w.since.role, "trap");
  assert.equal(w.since.level, 1.1705);
  assert.equal(w.since.decide_date, "2026-08-28"); // the Friday close, not the Monday of W35
  assert.deepEqual(w.since.closes.map((c) => [c.close, c.beyond]), [[1.17335, true], [1.1628, false]]);
  assert.equal(w.kill, 1.17625);
  assert.deepEqual(w.target, { price: 1.1404, touches: 2, buildup: true });
  assert.deepEqual([w.next.above.price, w.next.below.price], [1.1697, 1.14175]);
});

test("6E U4 (real bars, D map): D ↓ since the trap at 1.1671 (04.09); the 08–09.09 closes above it are no event; the counter-side sweep 1.1685 (10.09) confirms, 1.16125 / 1.15645 are the path, 1.1566 (15.09) a pause; the target is 1.1404 x3", () => {
  const st = stackAt("2026-09-18");
  const D = st.D;
  const seq = D.events.map((e) => [e.decide_date, e.decision, e.role, e.level]);
  for (const ev of [
    ["2026-09-04", "failed_breakout", "trap", 1.1671],
    ["2026-09-10", "held", "confirm", 1.1685],
    ["2026-09-14", "late_acceptance", "path", 1.16125],
    ["2026-09-15", "held", "pause", 1.1566],
    ["2026-09-17", "invalidated", "path", 1.15645],
  ]) {
    assert.ok(seq.some((x) => x[0] === ev[0] && x[1] === ev[1] && x[2] === ev[2] && x[3] === ev[3]), `missing ${ev.join(" ")} in ${JSON.stringify(seq)}`);
  }
  assert.ok(!seq.some((x) => x[1] === "lost"));
  assert.equal(D.heading, -1);
  assert.equal(D.since.decide_date, "2026-09-04"); // the turn
  assert.equal(D.kill, 1.1697); // the 09.09 run deepened the trap's extreme
  assert.deepEqual(D.target, { price: 1.1404, touches: 3, buildup: true });
  assert.deepEqual(D.path.map((p) => p.level), [1.16125, 1.15645]);
  assert.equal(D.last.decide_date, "2026-09-17");
  assert.equal(st.state, "with");
  // the rendered blocks carry the evidence, not a score
  const en = directionLinesEn(st, 1).join("\n");
  assert.match(en, /W ↓ since 2026-08-28 — trap 1\.1705 \(failed breakout, 2026-08-21 1\.17335 → 2026-08-28 1\.1628\), kill 1\.17625; target 1\.1404 x2/);
  assert.match(en, /D ↓ since 2026-09-04 — trap 1\.1671 \(failed breakout, .*\), kill 1\.1697; target 1\.1404 x3/);
  assert.match(en, /against the story: its long targets stay on the map/);
  const ua = directionBlockUa(st, 1).join("\n");
  assert.match(ua, /\*\*Напрямок\.\*\* W ↓ · D ↓\./);
  assert.match(ua, /- D ↓ з 04\.09 — trap 1\.1671 \(невдалий пробій\), kill 1\.1697; ціль 1\.1404 x3\./);
  assert.match(ua, /Рівні: W trap 1\.1705 \/ kill 1\.17625 · ціль W 1\.1404 x2 · D trap 1\.1671 \/ kill 1\.1697 · ціль D 1\.1404 x3 · рівні рішень D 1\.15975 \/ 1\.1404 · W 1\.1697 \/ 1\.14175/);
});

test("6E (real bars, the W39 close): the D target 1.1404 x3 is taken by the 24.09 run and the close back — the D heading is done, no target below in reach; the W run of its target is pending the W40 close", () => {
  const st = stackAt("2026-09-25");
  assert.equal(st.state, "weekly_only");
  assert.equal(st.daily_done, true);
  assert.equal(st.D.heading, 0);
  assert.deepEqual(st.D.taken, { price: 1.1404, touches: 3, date: "2026-09-25", by: "held", extreme: 1.1397 });
  assert.equal(st.D.done.side, -1);
  assert.equal(st.D.done.since.decide_date, "2026-09-04");
  assert.equal(st.D.next.below, null); // the sweep low 1.1397 holds no liquidity — not a decision level
  assert.equal(st.W.heading, -1);
  assert.equal(st.W.pending[0].level, 1.1404);
  const ua = directionBlockUa(st, 1).join("\n");
  assert.match(ua, /\*\*Напрямок\.\*\* W ↓ · D ↓ завершено\./);
  assert.match(ua, /- D ↓ завершено \(з 04\.09\): ціль 1\.1404 x3 знята 25\.09 run і закриттям назад — trap-кандидат, підтверджує карта; далі цілей у межах досяжності немає\./);
  assert.match(ua, /- W ↓ з 28\.08 — trap 1\.1705 \(невдалий пробій\), kill 1\.17625; .*run лоу 1\.1404 25\.09, закриття назад — рішення наступним тижневим закриттям\./);
  assert.match(ua, /Рівні: .*ціль D 1\.1404 знята/);
  assert.match(directionLinesEn(st, 1).join("\n"), /D ↓ done \(since 2026-09-04\): target 1\.1404 x3 taken 2026-09-25 by a run and a close back/);
});

test("6E U4 (real bars): W and D together — with from the 04.09 D trap through the W39 weekend (both ↓)", () => {
  assert.equal(stackAt("2026-09-04").state, "with");
  assert.equal(stackAt("2026-09-11").state, "with");
  assert.equal(stackAt("2026-09-18").heading, -1);
});

test("MNQ W (real bars, W map): down since the 05.06 trap at 30373.75 (kill 31397.75) holds through the August rally — the June highs above were never run, 29457.25 / 28817.25 are the path, not a lost heading", () => {
  const W = through(fx("mnq_W_2026-09-26").bars.W, "2026-09-18");
  const m = directionRead(W, { timeframe: "W", map: buildLiquidityMap(W, cfgForTf(cfg, "W")), cfg });
  assert.equal(m.heading, -1);
  assert.equal(m.since.decision, "failed_breakout");
  assert.equal(m.since.level, 30373.75);
  assert.equal(m.since.decide_date, "2026-06-05");
  assert.equal(m.kill, 31397.75);
  assert.deepEqual(m.path.map((p) => p.level), [29457.25, 28817.25]);
  assert.ok(!m.events.some((e) => e.decision === "lost"));
  assert.equal(m.next.above.price, 30062); // the 11.09 high — the nearest intact level above; 30637, 31272.75 and 31397.75 beyond it
});

test("composeDirection: a D heading against W that came after W's decision is a correction; one older than W's turn is mixed; a done layer has no heading", () => {
  const W = { heading: -1, since: { decide_date: "2026-08-28" } };
  assert.equal(composeDirection(W, { heading: 1, since: { decide_date: "2026-09-02" } }).state, "correction");
  assert.equal(composeDirection(W, { heading: 1, since: { decide_date: "2026-08-21" } }).state, "mixed");
  assert.equal(composeDirection(W, { heading: -1, since: { decide_date: "2026-09-02" } }).state, "with");
  assert.equal(composeDirection({ heading: 0 }, { heading: -1, since: { decide_date: "2026-09-02" } }).state, "daily_only");
  assert.equal(composeDirection({ heading: 0 }, { heading: 0 }).state, "none");
  const c = composeDirection(W, { heading: 0, done: { side: -1 } });
  assert.equal(c.state, "weekly_only");
  assert.equal(c.daily_done, true);
  assert.equal(composeDirection({ heading: 0 }, { heading: 0, done: { side: -1 } }).state, "done");
});

test("barRead: a correction day names the PDL/PDH sweep-trigger level (its extreme against the heading); a failed push is a pause", () => {
  const corr = barRead(mk([[100, 101, 99.5, 100.6], [100.6, 100.8, 99, 99.2]]), 1);
  assert.equal(corr.role, "correction_day");
  assert.equal(corr.pd_level, 99);
  assert.equal(corr.pd_kind, "PDL");
  const push = barRead(mk([[100, 101, 99.5, 100.6], [100.6, 101.4, 100.2, 100.8]]), 1);
  assert.equal(push.role, "failed_push");
  assert.equal(push.pd_level, null);
});

test("splitFormingHtf: a D bar is open until the session closes (23h), a W bar until Friday's close; minute timeframes pass through", () => {
  const t0 = 1_758_492_000; // a Sunday-evening session open
  const bars = [
    { time: t0 - 7 * 86400, open: 1, high: 1, low: 1, close: 1 },
    { time: t0, open: 1, high: 1, low: 1, close: 1 },
  ];
  assert.equal(splitFormingHtf(bars, "D", t0 + 22 * 3600).forming?.time, t0);
  assert.equal(splitFormingHtf(bars, "D", t0 + 23 * 3600).forming, null);
  assert.equal(splitFormingHtf(bars, "W", t0 + 3 * 86400).closed.length, 1);
  assert.equal(splitFormingHtf(bars, "W", t0 + (4 * 24 + 23) * 3600).forming, null);
  assert.equal(splitFormingHtf(bars, "240", t0).forming, null);
  assert.equal(closeDate(t0, "W"), "2025-09-26");
  assert.equal(isHtfTf("1W") && isHtfTf("D") && !isHtfTf("240"), true);
});

test("cfgForTf: the map keeps its HTF pivot unless htf_pivot_len differs; the direction read has its own 3-bar fractal", () => {
  assert.equal(cfgForTf(MARCO_DEFAULTS, "W").pivot_len, MARCO_DEFAULTS.htf_pivot_len);
  assert.equal(cfgForTf({ ...MARCO_DEFAULTS, htf_pivot_len: 1 }, "D").pivot_len, 1);
  assert.equal(cfgForTf({ ...MARCO_DEFAULTS, htf_pivot_len: 1 }, "240").pivot_len, MARCO_DEFAULTS.pivot_len);
  assert.equal(MARCO_DEFAULTS.direction.pivot_len, 1);
  assert.equal(MARCO_DEFAULTS.direction.decision_bars, 2);
  assert.equal(MARCO_DEFAULTS.direction.reach_atr, 2);
});

test("6E U4 (real W bars): a pivot beyond a thin zone's inner edge, within eq_tolerance of its extreme, is a respect — the anchor 1.1404–1.1408 retires into a x2 build-up at the W34 close and tells no story", () => {
  const W = through(E6.bars.W, "2026-09-18");
  const map = buildLiquidityMap(W, MARCO_DEFAULTS);
  const anchor = map.blocks.find((b) => b.side === "bull" && b.bot === 1.1404 && b.top === 1.1408);
  assert.ok(anchor, "the June W LB exists");
  assert.equal(anchor.death, "buildup");
  const retired = map.events.find((e) => e.type === "bull_lb_retired" && e.level === 1.1404);
  assert.equal(closeDate(W[retired.bar].time, "W"), "2026-08-21");
  const lvl = map.levels.lows.find((l) => l.price === 1.1404);
  assert.ok(lvl && lvl.touches >= 2, "1.1404 is a build-up on the W map");
  const st = storyRead(map, W, MARCO_DEFAULTS);
  assert.notEqual(st.mode, "buy_story");
});

test("the H4 leg (U2) on real 6E bars: the same machine — no map, so only failed breakouts set it: ↓ from the 25.09 18:00Z trap at 1.14365 (kill 1.14485); on the 22.09 morning no heading, its last LB killed 28.08", () => {
  const at = (iso) => {
    const t = Date.parse(`${iso}:00Z`) / 1000;
    return directionStack(
      {
        W: E6.bars.W.filter((b) => b.time + 119 * 3600 <= t),
        D: E6.bars.D.filter((b) => b.time + 23 * 3600 <= t),
        H4: E6.bars["240"].filter((b) => b.time + 4 * 3600 <= t),
      },
      cfg,
    );
  };
  const morning = at("2026-09-22T09:00");
  assert.equal(morning.leg.heading, 0);
  assert.equal(morning.leg.relation, "none");
  assert.equal(morning.leg.killed.date, "2026-08-28T18:00");
  const friday = at("2026-09-25T21:00");
  assert.equal(friday.leg.heading, -1);
  assert.equal(friday.leg.relation, "with");
  assert.equal(friday.leg.since.role, "trap");
  assert.equal(friday.leg.since.level, 1.14365);
  assert.equal(friday.leg.since.decide_date, "2026-09-25T18:00");
  assert.equal(friday.leg.kill, 1.14485);
  const ua = directionBlockUa(friday, 1).join("\n");
  assert.match(ua, /- H4-нога ↓ з 25\.09 — trap 1\.14365 \(невдалий пробій\), kill 1\.14485; за напрямком \(опис, не сигнал\)\./);
  assert.match(directionLinesEn(friday, 1).join("\n"), /H4 leg ↓ since 2026-09-25T18:00Z — trap 1\.14365 \(failed breakout\)/);
});

test("reference levels: the previous D/W bar's high/low on by default, FVG edges only when switched on", () => {
  const W = through(E6.bars.W, "2026-09-18");
  const D = through(E6.bars.D, "2026-09-18");
  const off = directionStack({ W, D });
  assert.deepEqual(off.levels.prev.D, { high: 1.15315, low: 1.1495, date: "2026-09-18" });
  assert.deepEqual([off.levels.prev.W.high, off.levels.prev.W.low], [1.164, 1.1495]);
  assert.equal(off.levels.fvg, null);
  assert.match(directionBlockUa(off).join("\n"), /\nДовідкові: PDH 1\.15315 \/ PDL 1\.1495 · PWH 1\.164 \/ PWL 1\.1495$/);
  const on = directionStack({ W, D }, { ict: { fvg_levels: true, prev_bar_levels: false } });
  assert.equal(on.levels.prev, null);
  assert.equal(on.levels.fvg.D.above.price, 1.15385);
});

test("fvgEdges: the unfilled edge nearest to price on each side — candle 3's low under a bullish gap, candle 3's high over a bearish one; a filled gap is gone", () => {
  const rows = [
    [100, 101, 99, 100.5],
    [100.5, 103, 100.4, 102.8],
    [102.8, 104, 101.6, 103.8], // bullish gap: c1.high 101 < c3.low 101.6 → edge 101.6
    [103.8, 104.5, 102.2, 102.4],
    [102.4, 102.6, 101.8, 102],
  ];
  assert.equal(fvgEdges(mk(rows)).below.price, 101.6);
  assert.equal(fvgEdges(mk([...rows, [102, 102.2, 101.5, 101.7]])).below, null); // traded through 101.6
});

test("biasVsDirection (p.6, 2026-09-26): both layers against the bias downgrade the regime word in print; one layer against is mixed; a done layer has no heading", () => {
  const W = { heading: -1 };
  assert.equal(biasVsDirection({ W, D: { heading: -1 } }, 1).state, "against");
  assert.equal(biasVsDirection({ W, D: { heading: -1 } }, 1).text_ua, "проти напрямку (W ↓ · D ↓)");
  assert.equal(biasVsDirection({ W, D: { heading: -1 } }, 1).text_en, "against the direction (W ↓ · D ↓)");
  assert.equal(biasVsDirection({ W, D: { heading: 1 } }, 1).state, "mixed");
  assert.equal(biasVsDirection({ W: { heading: 1 }, D: { heading: 1 } }, 1).state, "with");
  assert.equal(biasVsDirection({ W: { heading: 1 }, D: { heading: 1 } }, 1).text_ua, "");
  const done = biasVsDirection({ W, D: { heading: 0, done: { side: -1 } } }, 1);
  assert.equal(done.state, "mixed");
  assert.equal(done.facts, "W ↓ · D ↓✓");
  assert.equal(biasVsDirection(null, 1).state, "none");
  assert.equal(biasVsDirection({ W, D: { heading: -1 } }, 0).state, "none");
});
