/**
 * The direction-now read (src/core/marco_direction.js, docs/MARCO.md §3.2,
 * docs/MARCO-DIRECTION.md §9.2) and the map fixes of the same build (U4).
 * Real bars: tests/fixtures/6e_2026-09-26.json (case U4), mnq_W_2026-09-26.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MARCO_DEFAULTS,
  buildLiquidityMap,
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
} from "../src/core/marco.js";

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf-8"));
const E6 = fx("6e_2026-09-26");
const through = (bars, iso) => bars.filter((b) => sessionDate(b.time) <= iso);

// synthetic D bars: a flat base with a 3-bar fractal high at 102 on bar 2
function mk(rows, { start = 1_750_000_000, step = 86400 } = {}) {
  return rows.map(([o, h, l, c], i) => ({ time: start + i * step, open: o, high: h, low: l, close: c }));
}
const BASE = [
  [100, 100.5, 99.5, 100],
  [100, 101, 99.8, 100.8],
  [100.8, 102, 100.5, 101], // fractal high 102
  [101, 101.5, 100.2, 100.6],
  [100.6, 101.2, 100, 100.4],
];

test("two-bar decision: beyond·beyond invalidates the level (heading up), back·beyond is late acceptance, beyond·back a failed breakout (heading down), back·back a held sweep (pause)", () => {
  const cases = [
    { rows: [[100.4, 102.6, 100.3, 102.3], [102.3, 102.9, 101.9, 102.5]], decision: "invalidated", heading: 1 },
    { rows: [[100.4, 102.6, 100.3, 101.7], [101.7, 102.9, 101.5, 102.4]], decision: "late_acceptance", heading: 1 },
    { rows: [[100.4, 102.6, 100.3, 102.3], [102.3, 102.4, 100.9, 101.2]], decision: "failed_breakout", heading: -1 },
    { rows: [[100.4, 102.6, 100.3, 101.7], [101.7, 101.9, 100.9, 101.2]], decision: "held", heading: 0 },
  ];
  for (const c of cases) {
    const r = directionRead(mk([...BASE, ...c.rows]), { timeframe: "D" });
    const ev = r.events.at(-1);
    assert.equal(ev.decision, c.decision, c.decision);
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

test("a heading is lost after two closes back through the level that set it — switched off, not flipped", () => {
  const r = directionRead(
    mk([...BASE, [100.4, 102.6, 100.3, 102.3], [102.3, 102.9, 101.9, 102.5], [102.5, 102.6, 101.2, 101.6], [101.6, 101.9, 101.0, 101.4]]),
    { timeframe: "D" },
  );
  assert.equal(r.heading, 0);
  assert.equal(r.last.decision, "lost");
  assert.equal(r.last.level, 102);
  assert.equal(r.since, null);
});

test("6E U4 (real bars): W ↓ since the W35 close — failed breakout of 1.1705 (W34 closed 1.17335 above, W35 1.1628 back)", () => {
  const W = directionRead(through(E6.bars.W, "2026-09-18"), { timeframe: "W" });
  assert.equal(W.heading, -1);
  assert.equal(W.since.decision, "failed_breakout");
  assert.equal(W.since.level, 1.1705);
  assert.equal(W.since.decide_date, "2026-08-28"); // the Friday close, not the Monday of W35
  assert.deepEqual(W.since.closes.map((c) => [c.close, c.beyond]), [[1.17335, true], [1.1628, false]]);
  assert.deepEqual([W.next.above.price, W.next.below.price], [1.1697, 1.14175]);
});

test("6E U4 (real bars): the D timeline — failed breakout 1.1671 (04.09), lost on two closes back (09.09), held sweep 1.1685 (10.09), late acceptance 1.16125 (14.09), 1.15645 invalidated (17.09)", () => {
  const D = directionRead(through(E6.bars.D, "2026-09-18"), { timeframe: "D" });
  const seq = D.events.map((e) => [e.decide_date, e.decision, e.level]);
  for (const ev of [
    ["2026-09-04", "failed_breakout", 1.1671],
    ["2026-09-09", "lost", 1.1671],
    ["2026-09-10", "held", 1.1685],
    ["2026-09-14", "late_acceptance", 1.16125],
    ["2026-09-17", "invalidated", 1.15645],
  ]) {
    assert.ok(seq.some((x) => x[0] === ev[0] && x[1] === ev[1] && x[2] === ev[2]), `missing ${ev.join(" ")} in ${JSON.stringify(seq)}`);
  }
  assert.equal(D.heading, -1);
  assert.equal(D.since.decide_date, "2026-09-17");
});

test("6E U4 (real bars): W and D together — with on the W39 weekend (both ↓), weekly-only while the D heading was off (11.09)", () => {
  const at = (iso) => directionStack({ W: through(E6.bars.W, iso), D: through(E6.bars.D, iso) });
  assert.equal(at("2026-09-04").state, "with");
  assert.equal(at("2026-09-11").state, "weekly_only");
  const w39 = at("2026-09-18");
  assert.equal(w39.state, "with");
  assert.equal(w39.heading, -1);
  // the rendered blocks carry the evidence, not a score
  const en = directionLinesEn(w39).join("\n");
  assert.match(en, /W ↓ since 2026-08-28 — failed breakout 1\.1705 \(2026-08-21 1\.17335 → 2026-08-28 1\.1628\)/);
  const ua = directionBlockUa(w39).join("\n");
  assert.match(ua, /\*\*Напрямок\.\*\* W і D в один бік/);
  assert.match(ua, /Рівні: W 1\.1705 · D 1\.15645/);
});

test("MNQ W (real bars, a V-move): the July heading down is lost on two closes back above 28817.25 — no fractal to decide on, so it does not hang for eight weeks", () => {
  const m = directionRead(through(fx("mnq_W_2026-09-26").bars.W, "2026-09-18"), { timeframe: "W" });
  assert.equal(m.heading, 0);
  assert.equal(m.last.decision, "lost");
  assert.equal(m.last.level, 28817.25);
  assert.equal(m.last.decide_date, "2026-08-14");
});

test("composeDirection: a D heading against W that came after W's decision is a correction; one older than W's turn is mixed", () => {
  const W = { heading: -1, since: { decide_date: "2026-08-28" } };
  assert.equal(composeDirection(W, { heading: 1, since: { decide_date: "2026-09-02" } }).state, "correction");
  assert.equal(composeDirection(W, { heading: 1, since: { decide_date: "2026-08-21" } }).state, "mixed");
  assert.equal(composeDirection(W, { heading: -1, since: { decide_date: "2026-09-02" } }).state, "with");
  assert.equal(composeDirection({ heading: 0 }, { heading: -1, since: { decide_date: "2026-09-02" } }).state, "daily_only");
  assert.equal(composeDirection({ heading: 0 }, { heading: 0 }).state, "none");
});

test("barRead: a correction day names tomorrow's battleground (its extreme against the heading); a failed push is a pause", () => {
  const corr = barRead(mk([[100, 101, 99.5, 100.6], [100.6, 100.8, 99, 99.2]]), 1);
  assert.equal(corr.role, "correction_day");
  assert.equal(corr.battleground, 99);
  const push = barRead(mk([[100, 101, 99.5, 100.6], [100.6, 101.4, 100.2, 100.8]]), 1);
  assert.equal(push.role, "failed_push");
  assert.equal(push.battleground, null);
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
