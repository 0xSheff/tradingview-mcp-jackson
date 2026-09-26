/**
 * The direction-now read — "is the market heading to the targets now, or
 * correcting?" (docs/MARCO-DIRECTION.md §9; docs/MARCO-CASES.md → Approved
 * changes → "HTF direction read"). The liquidity map says where the targets
 * are; this read says which side the market is heading to right now.
 * Targets ≠ direction (the trader, 2026-09-25): the read never looks at the
 * map's merges, build-ups, pockets or LBs.
 *
 * [CALIBRATION, user 2026-09-26] The significant levels are the timeframe's
 * 3-bar fractals (one bar each side, the map's tie rule: strictly beyond the
 * bar on the left, beyond-or-equal on the right). The bar that runs a level
 * gives a provisional read; the close of the NEXT bar decides — "we give up to
 * two bars for acceptance beyond the level":
 *
 *   beyond · beyond → the level is invalidated   — heading = the run side
 *   back   · beyond → late acceptance            — heading = the run side
 *   beyond · back   → failed breakout = acceptance on the original side
 *                     (the trap)                  — heading = the other side
 *   back   · back   → the sweep held             — a pause, heading unchanged
 *
 * A bar that runs levels on both sides decides nothing. Once decided, the level
 * is off this read: a later close back through it is no event. Evidence
 * (docs/MARCO-DIRECTION.md §8.9, W+D of 6E/MNQ/MES/MGC, position-matched
 * baselines): continuation 54–66% vs 38–44%, failed breakout 46–54% vs 36–37%,
 * a held sweep nothing — modest tilts, never certainties; the brief prints the
 * evidence, not a score.
 */

export const DIRECTION_DEFAULTS = {
  enabled: true,
  timeframes: ["W", "D"],
  pivot_len: 1, // a 3-bar fractal
  decision_bars: 2, // the run bar + the next one; the last close decides
  session_hours: 23, // CME Globex: 17:00–16:00 CT — when a D/W bar is closed
  // the H4 leg (case U2) — a descriptive line, not a signal: on 2 years of H4
  // bars an H4 heading WITH the D heading ran on 52–56% of the time, AGAINST it
  // 46–55% (noise), the same for one and two closes. Two, as on HTF: with one
  // close every H4 run that closed back was a pause and the 6E leg of 16–23 Sep
  // showed no heading at all; two closes catch the late acceptance under
  // 1.1495 on 22 Sep [CALIBRATION — docs/MARCO-DIRECTION.md §10 step 7]
  h4_pivot_len: 3,
  h4_decision_bars: 2,
};

// ICT add-ons (docs/ICT-NOTES.md, the trader's "optional, switchable"): reference
// levels only — never a stop anchor, never a forecast. The previous D/W bar's
// high/low are Marco's HTF candle extremes (V7); the FVG edge nearest to price
// (candle 3's low after an up-move, high after a down-move) behaved like any
// level at the same distance in the data (touched 82% vs 76% D, 88% vs 87% H4;
// held 52–53% vs 51%), so it is off by default.
export const ICT_DEFAULTS = {
  prev_bar_levels: true,
  fvg_levels: false,
};

/** D, W, M (with or without a leading 1) — the timeframes the trader reads significant levels on. */
export const isHtfTf = (tf) => /^1?[DWM]$/i.test(String(tf ?? "").trim());

const normTf = (tf) => String(tf ?? "").trim().toUpperCase().replace(/^1(?=[DWM]$)/, "");

/** The trading date of a D/W bar: CME stamps the bar at the session open, the evening before (UTC). */
export const sessionDate = (t) => new Date(t * 1000 + 12 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * The date a bar CLOSES on: D = its trading date; W = that week's Friday.
 * Decisions are ordered by it — a W decision happens at the Friday close, so a
 * D decision on the Tuesday of the same week comes before it, not after.
 */
export const closeDate = (t, tf) => {
  const mins = Number(tf);
  // intraday: the bar's close in UTC, "YYYY-MM-DDTHH:MM"
  if (Number.isFinite(mins) && mins > 0) return new Date((t + mins * 60) * 1000).toISOString().slice(0, 16);
  const d = sessionDate(t);
  if (normTf(tf) !== "W") return d;
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 4);
  return x.toISOString().slice(0, 10);
};

/**
 * Closed D/W/M bars only (docs/MARCO-CASES.md → Engine gaps: states come from
 * closed bars). `splitForming` handles minute timeframes; a D/W bar ends at the
 * session close, not at time + tf. Holiday-merged sessions run longer than
 * `session_hours` — a rare early "closed" read, accepted.
 */
export function splitFormingHtf(bars, tf, nowSec = Date.now() / 1000, { sessionHours = DIRECTION_DEFAULTS.session_hours } = {}) {
  if (!Array.isArray(bars) || bars.length < 2) return { closed: bars ?? [], forming: null };
  const last = bars[bars.length - 1];
  const s = normTf(tf);
  let closesAt;
  if (s === "D") closesAt = last.time + sessionHours * 3600;
  else if (s === "W") closesAt = last.time + (4 * 24 + sessionHours) * 3600;
  else if (s === "M") {
    const d = new Date(last.time * 1000 + 12 * 3600 * 1000);
    closesAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000 - (24 - sessionHours) * 3600;
  } else return { closed: bars, forming: null };
  if (!Number.isFinite(last?.time) || nowSec >= closesAt) return { closed: bars, forming: null };
  return { closed: bars.slice(0, -1), forming: { ...last, closes_at: closesAt } };
}

// fractals with their confirmation bar and the first bar that runs them
function fractalsOf(bars, p) {
  const out = [];
  for (let j = p; j + p < bars.length; j++) {
    let hi = true;
    let lo = true;
    for (let k = j - p; k <= j + p && (hi || lo); k++) {
      if (k === j) continue;
      const left = k < j;
      if (left ? bars[k].high >= bars[j].high : bars[k].high > bars[j].high) hi = false;
      if (left ? bars[k].low <= bars[j].low : bars[k].low < bars[j].low) lo = false;
    }
    if (hi) out.push({ side: 1, price: bars[j].high, bar: j, conf: j + p, run: null });
    if (lo) out.push({ side: -1, price: bars[j].low, bar: j, conf: j + p, run: null });
  }
  for (const f of out) {
    for (let k = f.conf + 1; k < bars.length; k++) {
      if (f.side > 0 ? bars[k].high > f.price : bars[k].low < f.price) {
        f.run = k;
        break;
      }
    }
  }
  return out;
}

const r7 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(7)) : x);

/**
 * One timeframe's direction read over closed bars.
 * Returns { timeframe, heading (1 up · −1 down · 0 none), since, last, pending,
 * next: { above, below }, events, last_close, last_date }.
 */
export function directionRead(bars, { timeframe = null, pivot_len = DIRECTION_DEFAULTS.pivot_len, decision_bars = DIRECTION_DEFAULTS.decision_bars } = {}) {
  const n = Array.isArray(bars) ? bars.length : 0;
  if (n < 2 * pivot_len + 3) return { timeframe, error: `too few bars (${n})` };
  const fr = fractalsOf(bars, pivot_len);
  const byRun = new Map();
  for (const f of fr) if (f.run != null) (byRun.get(f.run) ?? byRun.set(f.run, []).get(f.run)).push(f);

  const date = (k) => closeDate(bars[k].time, timeframe);
  const events = [];
  for (const t of [...byRun.keys()].sort((a, b) => a - b)) {
    const lv = byRun.get(t);
    if (new Set(lv.map((f) => f.side)).size > 1) {
      events.push({ run_bar: t, ambiguous: true, decision: "ambiguous", run_date: date(t) });
      continue;
    }
    const s = lv[0].side;
    const level = s > 0 ? Math.max(...lv.map((f) => f.price)) : Math.min(...lv.map((f) => f.price));
    const last = t + decision_bars - 1;
    const closes = [];
    let extreme = s > 0 ? -Infinity : Infinity;
    for (let k = t; k <= Math.min(last, n - 1); k++) {
      closes.push(s > 0 ? bars[k].close > level : bars[k].close < level);
      extreme = s > 0 ? Math.max(extreme, bars[k].high) : Math.min(extreme, bars[k].low);
    }
    const ev = {
      side: s,
      level,
      levels_run: lv.length,
      run_bar: t,
      run_date: date(t),
      closes: closes.map((c, i) => ({ date: date(t + i), close: bars[t + i].close, beyond: c })),
      extreme,
    };
    if (last > n - 1) {
      ev.decision = "pending";
      ev.decide_bar = null;
      ev.heading = null;
    } else {
      const final = closes.at(-1);
      ev.decision = final ? (closes.every(Boolean) ? "invalidated" : "late_acceptance") : closes.some(Boolean) ? "failed_breakout" : "held";
      ev.decide_bar = last;
      ev.decide_date = date(last);
      ev.heading = final ? s : closes.some(Boolean) ? -s : 0; // 0 = no change (a pause)
    }
    events.push(ev);
  }

  // A heading also ends when the market undoes its premise: decision_bars
  // closes in a row back through the level that set it (the heading's own
  // level — a V-move leaves no fractal to decide on: MNQ W ↓ 24.07 under 28817
  // would otherwise hold through the +2000-point August rally). The heading is
  // switched off, not flipped — a lost acceptance leaned the other way only
  // weakly in the data (+5–7 points, docs/MARCO-DIRECTION.md §8.4).
  const byDecide = new Map();
  for (const e of events) if (e.decide_bar != null) (byDecide.get(e.decide_bar) ?? byDecide.set(e.decide_bar, []).get(e.decide_bar)).push(e);
  const decided = [];
  let heading = 0;
  let since = null;
  let streak = 0;
  for (let k = 0; k < n; k++) {
    let turned = false;
    for (const e of (byDecide.get(k) ?? []).sort((a, b) => a.run_bar - b.run_bar)) {
      decided.push(e);
      if (e.heading) {
        heading = e.heading;
        since = e;
        turned = true;
      }
    }
    if (turned) {
      streak = 0;
      continue;
    }
    if (!heading || !since) continue;
    const back = heading > 0 ? bars[k].close < since.level : bars[k].close > since.level;
    streak = back ? streak + 1 : 0;
    if (streak >= decision_bars) {
      const k0 = k - decision_bars + 1;
      decided.push({
        decision: "lost",
        side: since.side,
        level: since.level,
        levels_run: 0,
        run_bar: k0,
        run_date: date(k0),
        decide_bar: k,
        decide_date: date(k),
        closes: Array.from({ length: decision_bars }, (_, i) => ({ date: date(k0 + i), close: bars[k0 + i].close, beyond: false })),
        extreme: since.level,
        heading: 0,
      });
      heading = 0;
      since = null;
      streak = 0;
    }
  }
  const close = bars[n - 1].close;
  const intact = fr.filter((f) => f.conf <= n - 1 && f.run == null);
  const nearest = (side) => {
    const xs = intact.filter((f) => f.side === side && (side > 0 ? f.price > close : f.price < close));
    xs.sort((a, b) => (side > 0 ? a.price - b.price : b.price - a.price));
    return xs[0] ? { price: r7(xs[0].price), date: date(xs[0].bar) } : null;
  };
  const pack = (e) =>
    e
      ? {
          decision: e.decision,
          side: e.side > 0 ? "high" : "low",
          level: r7(e.level),
          levels_run: e.levels_run,
          run_date: e.run_date,
          decide_date: e.decide_date ?? null,
          closes: e.closes.map((c) => ({ date: c.date, close: r7(c.close), beyond: c.beyond })),
          extreme: r7(e.extreme),
          heading_after: e.heading,
        }
      : null;
  return {
    timeframe,
    heading,
    since: pack(since),
    last: pack(decided.at(-1) ?? null),
    pending: events.filter((e) => e.decision === "pending").map(pack),
    next: { above: nearest(1), below: nearest(-1) },
    events: decided.slice(-8).map(pack),
    last_close: r7(close),
    last_date: date(n - 1),
    pivot_len,
    decision_bars,
  };
}

/**
 * Today's bar against the previous one, read against the heading
 * (docs/MARCO-DIRECTION.md §9.3). Not a forecast: the data found no
 * directional edge in these classes. It says whether today corrected, and
 * where tomorrow's battleground is — a correction day's extreme is run the
 * next day ≈63% of the time, the close deciding trap vs continuation.
 */
export function barRead(bars, heading = 0) {
  const n = Array.isArray(bars) ? bars.length : 0;
  if (n < 2) return null;
  const p = bars[n - 2];
  const c = bars[n - 1];
  const kind =
    c.close > p.high
      ? "close_above_prev_high"
      : c.close < p.low
        ? "close_below_prev_low"
        : c.high > p.high && c.low < p.low
          ? "outside_closed_inside"
          : c.high > p.high
            ? "ran_prev_high_closed_back"
            : c.low < p.low
              ? "ran_prev_low_closed_back"
              : "inside";
  let role = null;
  if (heading) {
    const up = heading > 0;
    if (kind === (up ? "close_above_prev_high" : "close_below_prev_low")) role = "continuation_day";
    else if (kind === (up ? "close_below_prev_low" : "close_above_prev_high")) role = "correction_day";
    else if (kind === (up ? "ran_prev_high_closed_back" : "ran_prev_low_closed_back")) role = "failed_push";
    else if (kind === (up ? "ran_prev_low_closed_back" : "ran_prev_high_closed_back")) role = "one_day_sweep";
    else role = kind === "inside" ? "inside" : "outside";
  }
  return {
    kind,
    role,
    date: closeDate(c.time, "D"),
    prev: { high: r7(p.high), low: r7(p.low) },
    bar: { high: r7(c.high), low: r7(c.low), close: r7(c.close) },
    // a correction day's extreme against the heading: tomorrow's battleground
    battleground: role === "correction_day" ? r7(heading > 0 ? c.low : c.high) : null,
  };
}

/**
 * W + D together. W is the week's heading; D the day's. A D heading against W
 * that came after W's last decision is a correction; one older than W's turn
 * means the week turned and the day has not confirmed yet (mixed).
 */
export function composeDirection(W, D) {
  const w = W?.error ? 0 : W?.heading ?? 0;
  const d = D?.error ? 0 : D?.heading ?? 0;
  const wAt = W?.since?.decide_date ?? "";
  const dAt = D?.since?.decide_date ?? "";
  let state;
  if (!w && !d) state = "none";
  else if (!w) state = "daily_only";
  else if (!d) state = "weekly_only";
  else if (w === d) state = "with";
  else state = dAt > wAt ? "correction" : "mixed";
  return { state, weekly: w, daily: d, heading: w || d };
}

/**
 * The nearest unfilled FVG edge on each side of the last close: a bullish gap
 * (candle 1's high under candle 3's low) leaves candle 3's low as the edge, a
 * bearish gap candle 3's high; "unfilled" = no bar has traded through the edge
 * since. Looks back `lookback` bars.
 */
export function fvgEdges(bars, { lookback = 60 } = {}) {
  const n = Array.isArray(bars) ? bars.length : 0;
  if (n < 4) return { above: null, below: null };
  const close = bars[n - 1].close;
  let above = null;
  let below = null;
  for (let i = Math.max(2, n - lookback); i < n; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    for (const d of [1, -1]) {
      if (!(d > 0 ? c1.high < c3.low : c1.low > c3.high)) continue;
      const edge = d > 0 ? c3.low : c3.high;
      let filled = false;
      for (let k = i + 1; k < n && !filled; k++) filled = d > 0 ? bars[k].low <= edge : bars[k].high >= edge;
      if (filled) continue;
      if (edge < close && (!below || edge > below.price)) below = { price: r7(edge), date: sessionDate(c3.time), side: d > 0 ? "bull" : "bear" };
      if (edge > close && (!above || edge < above.price)) above = { price: r7(edge), date: sessionDate(c3.time), side: d > 0 ? "bull" : "bear" };
    }
  }
  return { above, below };
}

/** The whole read for one symbol: W and D over closed bars, the composition, the last D bar, the H4 leg and the reference levels. */
export function directionStack({ W = null, D = null, H4 = null } = {}, cfg = {}) {
  const c = { ...DIRECTION_DEFAULTS, ...(cfg.direction ?? {}) };
  const ict = { ...ICT_DEFAULTS, ...(cfg.ict ?? {}) };
  const opts = { pivot_len: c.pivot_len, decision_bars: c.decision_bars };
  const w = Array.isArray(W) ? directionRead(W, { ...opts, timeframe: "W" }) : null;
  const d = Array.isArray(D) ? directionRead(D, { ...opts, timeframe: "D" }) : null;
  const both = composeDirection(w, d);
  // the H4 leg (U2): the same machine on H4 swings — described, never a signal
  let leg = null;
  if (Array.isArray(H4) && H4.length) {
    const h = directionRead(H4, { timeframe: "240", pivot_len: c.h4_pivot_len, decision_bars: c.h4_decision_bars });
    if (!h.error) leg = { ...h, relation: !h.heading || !both.heading ? "none" : h.heading === both.heading ? "with" : "against" };
  }
  const prevOf = (bars, tf) => {
    const b = Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null;
    return b ? { high: r7(b.high), low: r7(b.low), date: closeDate(b.time, tf) } : null;
  };
  const levels = {
    prev: ict.prev_bar_levels ? { D: prevOf(D, "D"), W: prevOf(W, "W") } : null,
    fvg: ict.fvg_levels ? { D: Array.isArray(D) ? fvgEdges(D) : null, H4: Array.isArray(H4) ? fvgEdges(H4) : null } : null,
  };
  return {
    W: w,
    D: d,
    ...both,
    day: Array.isArray(D) ? barRead(D, both.heading) : null,
    leg,
    levels,
    rule: `HTF 3-bar fractals; the close after the run bar decides (decision_bars ${c.decision_bars}) — docs/MARCO-DIRECTION.md §9.2 [CALIBRATION]`,
  };
}

// ---------------------------------------------------------------- rendering

const fmtP = (x) => (x == null ? "—" : String(r7(x)));
const arrow = (h) => (h > 0 ? "↑" : h < 0 ? "↓" : "—");
const EN = {
  invalidated: "level invalidated",
  late_acceptance: "late acceptance",
  failed_breakout: "failed breakout",
  held: "the sweep held (pause)",
  pending: "decision on the next close",
  lost: "heading lost — two closes back through its level",
};
const wordEn = (h) => (h > 0 ? "up" : h < 0 ? "down" : "none");
const STATE_EN = {
  with: (d) => `W and D agree — heading ${wordEn(d.heading)} now`,
  correction: (d) => `D is correcting (${wordEn(d.daily)}) against the W heading (${wordEn(d.weekly)})`,
  mixed: (d) => `the week turned ${wordEn(d.weekly)}, the day (${wordEn(d.daily)}) has not confirmed yet`,
  weekly_only: (d) => `W only (${wordEn(d.weekly)}) — no D heading`,
  daily_only: (d) => `no W heading — D (${wordEn(d.daily)}) is the working direction`,
  none: () => "no heading on W or D",
};
const stateEn = (d) => STATE_EN[d.state]?.(d) ?? d.state;

const evEn = (e) =>
  e ? `${EN[e.decision] ?? e.decision} ${fmtP(e.level)} (${e.closes.map((c) => `${c.date} ${fmtP(c.close)}`).join(" → ")})` : "—";

// the story's bias against the heading: "targets ≠ direction" said in one line
const againstStory = (dir, storyBias) => !!(dir?.heading && storyBias && dir.heading !== storyBias);

/** English lines for the weekly brief; `storyBias` (1 / −1) is the story's side. */
export function directionLinesEn(dir, storyBias = 0) {
  if (!dir) return [];
  const tfLine = (x, name) =>
    !x ? null : x.error ? `${name}: ${x.error}` : `${name} ${arrow(x.heading)}${x.since ? ` since ${x.since.decide_date} — ${evEn(x.since)}` : ""}${x.last && x.last !== x.since && x.last.decide_date !== x.since?.decide_date ? `; last: ${evEn(x.last)}` : ""}${x.pending?.length ? `; pending: ${x.pending.map((e) => `${e.side} ${fmtP(e.level)} run ${e.run_date}, closed ${e.closes[0].beyond ? "beyond" : "back"}`).join(", ")}` : ""}`;
  const next = (x) => (x && !x.error ? `${fmtP(x.next.above?.price)} / ${fmtP(x.next.below?.price)}` : "—");
  return [
    `- Direction now (HTF acceptance, docs/MARCO-DIRECTION.md §9.2): ${stateEn(dir)}`,
    ...[tfLine(dir.W, "W"), tfLine(dir.D, "D")].filter(Boolean).map((l) => `  - ${l}`),
    ...(againstStory(dir, storyBias)
      ? [`  - against the story: its ${storyBias > 0 ? "long" : "short"} targets stay on the map, the market is not heading to them now`]
      : []),
    ...(dir.leg
      ? [
          dir.leg.heading
            ? `  - H4 leg ${arrow(dir.leg.heading)}${dir.leg.since ? ` since ${dir.leg.since.decide_date}Z — ${evEn(dir.leg.since)}` : ""} (${dir.leg.relation === "with" ? "with the heading" : dir.leg.relation === "against" ? "against the heading — a leg, not a turn" : "no HTF heading to compare"}; descriptive, not a signal)`
            : "  - H4 leg: no heading (descriptive, not a signal)",
        ]
      : []),
    `  - next decisions: W ${next(dir.W)} · D ${next(dir.D)}`,
    ...(refLevelsTxt(dir) ? [`  - reference levels: ${refLevelsTxt(dir)}`] : []),
  ];
}

// PDH/PDL, PWH/PWL and (when on) the nearest unfilled FVG edges — reference only
function refLevelsTxt(dir) {
  const L = dir?.levels;
  if (!L) return "";
  const out = [];
  if (L.prev?.D) out.push(`PDH ${fmtP(L.prev.D.high)} / PDL ${fmtP(L.prev.D.low)}`);
  if (L.prev?.W) out.push(`PWH ${fmtP(L.prev.W.high)} / PWL ${fmtP(L.prev.W.low)}`);
  for (const [tf, f] of Object.entries(L.fvg ?? {})) if (f && (f.above || f.below)) out.push(`FVG ${tf} ↑${fmtP(f.above?.price)} / ↓${fmtP(f.below?.price)}`);
  return out.join(" · ");
}

const UA = {
  invalidated: "рівень інвалідовано",
  late_acceptance: "запізніле закріплення",
  failed_breakout: "невдалий пробій",
  held: "sweep утримався (пауза)",
  pending: "рішення — наступним закриттям",
  lost: "напрямок знято — два закриття назад через його рівень",
};
const wordUa = (h) => (h > 0 ? "вгору" : h < 0 ? "вниз" : "немає");
const STATE_UA = {
  with: (d) => `W і D в один бік — ринок зараз іде ${wordUa(d.heading)}`,
  correction: (d) => `D коригується (${wordUa(d.daily)}) проти тижневого напрямку (${wordUa(d.weekly)})`,
  mixed: (d) => `тиждень розвернувся ${wordUa(d.weekly)}, день (${wordUa(d.daily)}) ще не підтвердив`,
  weekly_only: (d) => `напрямок дає лише W (${wordUa(d.weekly)}) — на D напрямку немає`,
  daily_only: (d) => `тижневого напрямку немає — робочий напрямок дає D (${wordUa(d.daily)})`,
  none: () => "напрямку немає ні на W, ні на D",
};
const stateUa = (d) => STATE_UA[d.state]?.(d) ?? d.state;
const ROLE_UA = {
  continuation_day: "закриття за вчорашнім екстремумом у бік напрямку — завтра ймовірне продовження всередині дня, прогресу понад базу немає: не наздоганяти",
  correction_day: "корекційний день (закриття за вчорашнім екстремумом проти напрямку)",
  failed_push: "невдалий поштовх у бік напрямку — пауза, не розворот",
  one_day_sweep: "однодений run проти напрямку і закриття назад — trap ще не відбувся (V8): чекати другого run або LTF build-up",
  inside: "внутрішній день — нейтрально",
  outside: "run обох сторін, закриття всередині — нейтрально",
};
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");

/** The Ukrainian block for the daily brief (format v3.1: meaning first, one levels line after); `storyBias` = the story's side. */
export function directionBlockUa(dir, storyBias = 0) {
  if (!dir) return [];
  const tf = (x, name) => {
    if (!x) return null;
    if (x.error) return `${name}: ${x.error}`;
    const since = x.since ? ` з ${dmy(x.since.decide_date)} — ${UA[x.since.decision]}` : "";
    const last = x.last && x.last.decide_date !== x.since?.decide_date ? `; останнє рішення ${dmy(x.last.decide_date)} — ${UA[x.last.decision]}` : "";
    const pend = x.pending?.length ? `; ${x.pending.map((e) => `run ${e.side === "high" ? "хаю" : "лоу"} ${dmy(e.run_date)}, закриття ${e.closes[0].beyond ? "за рівнем" : "назад"} — рішення наступним ${name === "W" ? "тижневим" : "денним"} закриттям`).join("; ")}` : "";
    return `${name} ${arrow(x.heading)}${since}${last}${pend}.`;
  };
  const lines = [`**Напрямок.** ${stateUa(dir)}.`];
  for (const l of [tf(dir.W, "W"), tf(dir.D, "D")]) if (l) lines.push(`- ${l}`);
  if (againstStory(dir, storyBias)) {
    lines.push(`- Проти біасу story: цілі ${storyBias > 0 ? "long" : "short"} лишаються на карті, але ринок зараз іде не до них.`);
  }
  if (dir.leg) {
    const l = dir.leg;
    if (!l.heading) lines.push("- H4-нога без напрямку (опис, не сигнал).");
    else {
      const rel = l.relation === "with" ? "за напрямком" : l.relation === "against" ? "проти напрямку — нога, не розворот" : "HTF-напрямку для порівняння немає";
      lines.push(`- H4-нога ${arrow(l.heading)}${l.since ? ` з ${dmy(l.since.decide_date)} — ${UA[l.since.decision]}` : ""}; ${rel} (опис, не сигнал).`);
    }
  }
  const day = dir.day;
  if (day?.role) {
    lines.push(
      `- Останній D бар (${dmy(day.date)}): ${ROLE_UA[day.role] ?? day.role}${day.battleground != null ? " — завтра поле бою його екстремум: run + закриття назад у бік напрямку = trap, закриття за ним = корекція триває" : ""}.`,
    );
  }
  const lv = [];
  if (dir.W?.since) lv.push(`W ${fmtP(dir.W.since.level)}`);
  if (dir.D?.since) lv.push(`D ${fmtP(dir.D.since.level)}`);
  for (const [x, name] of [[dir.W, "W"], [dir.D, "D"]]) for (const e of x?.pending ?? []) lv.push(`${name} рішення ${fmtP(e.level)}`);
  if (day?.battleground != null) lv.push(`поле бою ${fmtP(day.battleground)}`);
  const nx = (x, name) => (x && !x.error ? `${name} ${fmtP(x.next.above?.price)} / ${fmtP(x.next.below?.price)}` : null);
  const next = [nx(dir.D, "D"), nx(dir.W, "W")].filter(Boolean);
  if (next.length) lv.push(`наступні рішення ${next.join(" · ")}`);
  if (lv.length) lines.push(`Рівні: ${lv.join(" · ")}`);
  const ref = refLevelsTxt(dir);
  if (ref) lines.push(`Довідкові: ${ref}`);
  return lines;
}
