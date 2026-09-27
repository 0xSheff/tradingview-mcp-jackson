/**
 * The direction-now read — "is the market heading to the targets now, is it
 * correcting, or has it arrived?" (docs/MARCO.md §3.2; docs/MARCO-DIRECTION.md
 * §9.2 and §17). The liquidity map says where the targets are; this read says
 * which side the market is heading to right now and whether its target is
 * taken. Targets ≠ direction (the trader, 2026-09-25): a target never sets the
 * heading — but the heading ends at its target (the trader, 2026-09-26 evening).
 *
 * [CALIBRATION, user 2026-09-26] The significant levels are the timeframe's
 * 3-bar fractals (one bar each side, the map's tie rule: strictly beyond the
 * bar on the left, beyond-or-equal on the right). The bar that runs a level
 * gives a provisional read; the close of the NEXT bar decides — "we give up to
 * two bars for acceptance beyond the level":
 *
 *   beyond · beyond / back · beyond → accepted beyond the level
 *   beyond · back                   → failed breakout
 *   back   · back                   → the sweep held (a run without acceptance)
 *
 * What a decision MEANS depends on the level's side against the heading and on
 * its role on the map (the trader, 2026-09-26 evening — docs/MARCO-DIRECTION.md §17):
 *   - a failed breakout is the trap: the heading becomes the acceptance side —
 *     on the heading side it turns the heading, on the counter side it confirms;
 *   - a held sweep on the counter side (price came into the level with the
 *     trend and closed back) confirms the heading — the pullback's trap;
 *   - a held sweep on the heading side is a run without acceptance: a pause,
 *     "possibly a move to the nearest opposite liquidity" (bias, order flow and
 *     the weekday decide) — unless the level is a build-up, THE target: then
 *     the target is taken and, with nothing further in reach, the heading is
 *     done (no heading; a reversal candidate the map's LB and story confirm);
 *   - acceptance beyond a level with the trend is nothing — "just another
 *     inducement of the crowd" — recorded as the path; through the target it
 *     takes the target;
 *   - acceptance against the heading is inducement of the other crowd while the
 *     trap's LB stands; beyond the LB extreme (the kill, docs/MARCO.md §2.3) the
 *     heading's basis is gone — no heading until the induced crowd is trapped;
 *   - with no heading only a trap sets one: a failed breakout, or a held sweep
 *     of a build-up; a held sweep of a single-touch level is inducement.
 * A consumed level is gone: a later close back through a level that was run is
 * no event (the v0.3 "lost" state was removed 2026-09-26). Evidence for the
 * decisions themselves: docs/MARCO-DIRECTION.md §8.9 (continuation 54–66% vs
 * 38–44%, failed breakout 46–54% vs 36–37%; a held sweep pooled 45% vs 45% —
 * the split by level role and side is the next measurement, §17.3).
 */

export const DIRECTION_DEFAULTS = {
  enabled: true,
  timeframes: ["W", "D"],
  pivot_len: 1, // a 3-bar fractal
  decision_bars: 2, // the run bar + the next one; the last close decides
  session_hours: 23, // CME Globex: 17:00–16:00 CT — when a D/W bar is closed
  // a target further than this many WEEKLY ATR(14) from the last close is
  // "not in reach": 6E W 1.11 at ≈2.5 weekly ATR was "no targets below" for
  // the trader, 1.1404 x3 at 0.9 was the week's target (2026-09-26). Other
  // timeframes scale their own ATR by √(bars per week) [CALIBRATION]
  reach_atr: 2,
  // the H4 leg (case U2) — a descriptive line, not a signal: on 2 years of H4
  // bars an H4 heading WITH the D heading ran on 52–56% of the time, AGAINST it
  // 46–55% (noise), the same for one and two closes. Two, as on HTF
  // [CALIBRATION — docs/MARCO-DIRECTION.md §10 step 7]
  h4_pivot_len: 3,
  h4_decision_bars: 2,
};

// ICT add-ons (docs/ICT-NOTES.md, the trader's "optional, switchable"): reference
// levels only — never a stop anchor, never a forecast. The previous D/W bar's
// high/low are Marco's HTF candle extremes (V7); the FVG edge nearest to price
// (candle 3's low after an up-move, high after a down-move) behaved like any
// level at the same distance in the data (touched 82% vs 76% D, 88% vs 87% H4;
// held 52–53% vs 51%), so it is off by default — the trader's FVG model (a
// retail POI with engineered liquidity short of it) is a map feature to build,
// docs/MARCO-DIRECTION.md §17.3.
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

// a plain mean true range — tolerances and reach only, not the map's ATR
function atrArr(bars, length = 14) {
  const out = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(1, i - length + 1); k <= i; k++) {
      const b = bars[k];
      const p = bars[k - 1];
      s += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
      c++;
    }
    out[i] = c ? s / c : 0;
  }
  return out;
}

// reach is set in weekly ATR; a timeframe's own ATR scales by √(bars per week)
// (random-walk scaling: a week's range ≈ √5 × a day's, √30 × an H4's)
function weekScale(tf) {
  const mins = Number(tf);
  if (Number.isFinite(mins) && mins > 0) return Math.sqrt(6900 / mins);
  const s = normTf(tf);
  return s === "D" ? Math.sqrt(5) : s === "M" ? 1 / Math.sqrt(4.33) : 1;
}

/**
 * The level roles from the liquidity map of the same bars (docs/MARCO.md §2):
 * intact levels with their taps (a build-up at `min_touches`), and the
 * build-ups already swept — which bar, how deep. Without a map every level is
 * a single touch and no target is known.
 */
function mapRoles(map, cfg) {
  const minT = cfg?.min_touches ?? 2;
  const lv = (xs) => (xs ?? []).map((l) => ({ price: l.price, touches: l.touches ?? 1, buildup: (l.touches ?? 1) >= minT }));
  return {
    has: !!map,
    intact: { high: lv(map?.levels?.highs), low: lv(map?.levels?.lows) },
    swept: (map?.buildups ?? [])
      .filter((b) => b.swept != null)
      .map((b) => ({ side: b.side === "high" ? 1 : -1, price: b.price, touches: b.touches, swept: b.swept, ext: b.sweptExt })),
  };
}

/**
 * One timeframe's direction read over closed bars. `map` (the liquidity map of
 * the same bars) gives the levels their roles; `cfg` the map's tolerances.
 * Returns { timeframe, heading (1 up · −1 down · 0 none), since (the trap that
 * turned it), last, kill, target, taken, done, killed, correction, path,
 * pending, next: { above, below }, events, last_close, last_date }.
 */
export function directionRead(
  bars,
  {
    timeframe = null,
    pivot_len = DIRECTION_DEFAULTS.pivot_len,
    decision_bars = DIRECTION_DEFAULTS.decision_bars,
    reach_atr = DIRECTION_DEFAULTS.reach_atr,
    map = null,
    cfg = null,
  } = {},
) {
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
    let extremeBar = t;
    for (let k = t; k <= Math.min(last, n - 1); k++) {
      closes.push(s > 0 ? bars[k].close > level : bars[k].close < level);
      const x = s > 0 ? bars[k].high : bars[k].low;
      if (s > 0 ? x > extreme : x < extreme) {
        extreme = x;
        extremeBar = k;
      }
    }
    const ev = {
      side: s,
      level,
      levels_run: lv.length,
      run_bar: t,
      run_date: date(t),
      closes: closes.map((c, i) => ({ date: date(t + i), close: bars[t + i].close, beyond: c })),
      extreme,
      extreme_bar: extremeBar,
    };
    if (last > n - 1) {
      ev.decision = "pending";
      ev.decide_bar = null;
    } else {
      const final = closes.at(-1);
      ev.decision = final ? (closes.every(Boolean) ? "invalidated" : "late_acceptance") : closes.some(Boolean) ? "failed_breakout" : "held";
      ev.decide_bar = last;
      ev.decide_date = date(last);
    }
    events.push(ev);
  }

  // the map's roles and the tolerances
  const roles = mapRoles(map, cfg);
  const atr = atrArr(bars, cfg?.atr_length ?? 14);
  const eqTol = (i) => (cfg?.eq_tolerance_atr ?? 0.25) * (atr[i] || 0);
  const close = bars[n - 1].close;
  const reachPx = (i) => reach_atr * (atr[i] || 0) * weekScale(timeframe);
  const inReach = (p, from, i) => !reachPx(i) || Math.abs(p - from) <= reachPx(i);
  const ahead = (side, from) =>
    roles.intact[side > 0 ? "high" : "low"].filter((l) => (side > 0 ? l.price > from : l.price < from)).sort((a, b) => (side > 0 ? a.price - b.price : b.price - a.price));
  // the target on `side` beyond `from`: the nearest build-up in reach, else the nearest level in reach
  const targetOf = (side, from = close, i = n - 1) => {
    const xs = ahead(side, from).filter((l) => inReach(l.price, from, i));
    const t = xs.find((l) => l.buildup) ?? xs[0] ?? null;
    return t ? { price: r7(t.price), touches: t.touches, buildup: t.buildup } : null;
  };
  // the map's build-up this run took: the same bar, the same price within eq_tolerance
  const sweptBuildup = (e) => roles.swept.find((b) => b.side === e.side && b.swept === e.run_bar && Math.abs(b.price - e.level) <= eqTol(e.run_bar)) ?? null;
  // was anything still ahead of `from` when bar k closed: intact now, or swept later
  const furtherAt = (side, from, k) =>
    ahead(side, from).some((l) => inReach(l.price, from, k)) ||
    roles.swept.some((b) => b.side === side && b.swept > k && (side > 0 ? b.price > from : b.price < from) && inReach(b.price, from, k));

  // the state machine over the decisions, in the order they were made
  const byDecide = new Map();
  for (const e of events) if (e.decide_bar != null) (byDecide.get(e.decide_bar) ?? byDecide.set(e.decide_bar, []).get(e.decide_bar)).push(e);
  const decided = [];
  let heading = 0;
  let since = null;
  let kill = null;
  let taken = null;
  let done = null;
  let killed = null;
  const path = [];
  const turn = (e, h) => {
    heading = h;
    since = e;
    kill = e.extreme;
    taken = null;
    done = null;
    killed = null;
    path.length = 0;
  };
  const stop = () => {
    heading = 0;
    since = null;
    kill = null;
    path.length = 0;
  };
  const take = (e, bu, by) => {
    e.role = "target";
    taken = { price: r7(bu.price), touches: bu.touches, date: e.decide_date, by, extreme: r7(e.extreme) };
    if (!furtherAt(heading, e.extreme, e.decide_bar)) {
      done = { side: heading, since, target: taken, date: e.decide_date };
      stop();
    }
  };
  for (const k of [...byDecide.keys()].sort((a, b) => a - b)) {
    for (const e of byDecide.get(k).sort((a, b) => a.run_bar - b.run_bar)) {
      decided.push(e);
      const s = e.side;
      const rel = heading ? (s === heading ? "with" : "against") : "none";
      e.rel = rel;
      const bu = sweptBuildup(e);
      e.buildup = bu ? { price: r7(bu.price), touches: bu.touches } : null;
      if (e.decision === "failed_breakout") {
        if (-s === heading) {
          e.role = "confirm";
          kill = s > 0 ? Math.max(kill, e.extreme) : Math.min(kill, e.extreme);
        } else {
          turn(e, -s);
          e.role = "trap";
        }
      } else if (e.decision === "held") {
        if (rel === "against") {
          e.role = "confirm";
          kill = heading > 0 ? Math.min(kill, e.extreme) : Math.max(kill, e.extreme);
        } else if (rel === "with") {
          if (bu) take(e, bu, "held");
          else e.role = "pause";
        } else if (bu) {
          turn(e, -s);
          e.role = "trap";
        } else e.role = "induce";
      } else if (rel === "with") {
        if (bu) take(e, bu, "accepted");
        else {
          e.role = "path";
          path.push({ level: r7(e.level), date: e.decide_date });
        }
      } else if (rel === "against") {
        if (kill != null && (heading > 0 ? e.level <= kill : e.level >= kill)) {
          e.role = "kill";
          killed = { level: r7(e.level), kill: r7(kill), date: e.decide_date, crowd: s > 0 ? "buyers" : "sellers" };
          stop();
          taken = null;
          done = null;
        } else e.role = "induce";
      } else e.role = "induce";
    }
  }

  const intact = fr.filter((f) => f.conf <= n - 1 && f.run == null);
  // sweep extremes hold no liquidity (docs/MARCO.md §2.3) — the bar that made a
  // reclaimed run's extreme is not a decision level
  const extremeBars = new Set(events.filter((e) => e.decision === "held" || e.decision === "failed_breakout" || e.decision === "pending").map((e) => e.extreme_bar));
  // the decision levels: the nearest intact fractal each side within reach —
  // a level days away is a target of the map, not "now" (the trader, 2026-09-26)
  const nearest = (side) => {
    const xs = intact.filter((f) => f.side === side && (side > 0 ? f.price > close : f.price < close) && !extremeBars.has(f.bar) && inReach(f.price, close, n - 1));
    xs.sort((a, b) => (side > 0 ? a.price - b.price : b.price - a.price));
    return xs[0] ? { price: r7(xs[0].price), date: date(xs[0].bar) } : null;
  };
  const pack = (e) =>
    e
      ? {
          decision: e.decision,
          role: e.role ?? null,
          rel: e.rel ?? null,
          side: e.side > 0 ? "high" : "low",
          level: r7(e.level),
          levels_run: e.levels_run,
          buildup: e.buildup ?? null,
          run_date: e.run_date,
          decide_date: e.decide_date ?? null,
          closes: e.closes.map((c) => ({ date: c.date, close: r7(c.close), beyond: c.beyond })),
          extreme: r7(e.extreme),
        }
      : null;
  const last = decided.at(-1) ?? null;
  const target = heading ? targetOf(heading) : null;
  return {
    timeframe,
    heading,
    since: pack(since),
    last: pack(last),
    kill: kill != null ? r7(kill) : null,
    target,
    taken,
    done: done ? { side: done.side, since: pack(done.since), target: done.target, date: done.date } : null,
    killed,
    // the last decision was a run with the trend that did not accept: the nearest opposite liquidity is the correction's target
    correction: heading && last?.role === "pause" ? { level: r7(last.level), date: last.run_date, to: targetOf(-heading) } : null,
    path: path.slice(),
    pending: events.filter((e) => e.decision === "pending").map(pack),
    next: { above: nearest(1), below: nearest(-1) },
    events: decided.slice(-8).map(pack),
    last_close: r7(close),
    last_date: date(n - 1),
    has_map: roles.has,
    pivot_len,
    decision_bars,
  };
}

/**
 * Today's bar against the previous one, read against the heading
 * (docs/MARCO-DIRECTION.md §9.3). Not a forecast: the data found no
 * directional edge in these classes. It says whether today corrected and,
 * on a correction day, which previous-day extreme (PDL / PDH — Marco's HTF
 * candle extreme, V7) is the next day's sweep-trigger level: that extreme is
 * run the next day ≈63% of the time, the close deciding trap vs continuation.
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
    // a correction day's extreme against the heading = the PDL (heading up) /
    // PDH (heading down): the next day's sweep-trigger level
    pd_level: role === "correction_day" ? r7(heading > 0 ? c.low : c.high) : null,
    pd_kind: role === "correction_day" ? (heading > 0 ? "PDL" : "PDH") : null,
  };
}

/**
 * W + D together — two layers of one fractal market, never a conflict (the
 * trader, 2026-09-26): a D heading against W that came after W's decision is
 * a correction inside the W move; one older than W's turn means the week
 * turned and the day has not confirmed yet (mixed). A timeframe whose target
 * is taken with nothing further in reach is `done` (no heading).
 */
export function composeDirection(W, D) {
  const w = W?.error ? 0 : (W?.heading ?? 0);
  const d = D?.error ? 0 : (D?.heading ?? 0);
  const wAt = W?.since?.decide_date ?? "";
  const dAt = D?.since?.decide_date ?? "";
  let state;
  if (!w && !d) state = W?.done || D?.done ? "done" : "none";
  else if (!w) state = "daily_only";
  else if (!d) state = "weekly_only";
  else if (w === d) state = "with";
  else state = dAt > wAt ? "correction" : "mixed";
  return { state, weekly: w, daily: d, heading: w || d, weekly_done: !!(W && !W.error && W.done), daily_done: !!(D && !D.error && D.done) };
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

/**
 * The whole read for one symbol: W and D over closed bars (with their maps for
 * the level roles), the composition, the last D bar, the H4 leg and the
 * reference levels. `maps` = { W, D, H4 } liquidity maps of the same bars.
 */
export function directionStack({ W = null, D = null, H4 = null } = {}, cfg = {}, { maps = null } = {}) {
  const c = { ...DIRECTION_DEFAULTS, ...(cfg.direction ?? {}) };
  const ict = { ...ICT_DEFAULTS, ...(cfg.ict ?? {}) };
  const opts = { pivot_len: c.pivot_len, decision_bars: c.decision_bars, reach_atr: c.reach_atr, cfg };
  const w = Array.isArray(W) ? directionRead(W, { ...opts, timeframe: "W", map: maps?.W ?? null }) : null;
  const d = Array.isArray(D) ? directionRead(D, { ...opts, timeframe: "D", map: maps?.D ?? null }) : null;
  const both = composeDirection(w, d);
  // the H4 leg (U2): the same machine on H4 swings — described, never a signal
  let leg = null;
  if (Array.isArray(H4) && H4.length) {
    const h = directionRead(H4, { timeframe: "240", pivot_len: c.h4_pivot_len, decision_bars: c.h4_decision_bars, reach_atr: c.reach_atr, cfg, map: maps?.H4 ?? null });
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
    rule: `HTF 3-bar fractals; the close after the run bar decides (decision_bars ${c.decision_bars}); the level's map role says what the decision means — docs/MARCO.md §3.2 [CALIBRATION]`,
  };
}

// ---------------------------------------------------------------- rendering

const fmtP = (x) => (x == null ? "—" : String(r7(x)));
const arrow = (h) => (h > 0 ? "↑" : h < 0 ? "↓" : "—");
const lvlTxt = (t) => (t ? `${fmtP(t.price)}${t.touches >= 2 ? ` x${t.touches}` : ""}` : "—");
const EN = {
  invalidated: "level invalidated",
  late_acceptance: "late acceptance",
  failed_breakout: "failed breakout",
  held: "the sweep held",
  pending: "decision on the next close",
};
const trapEn = (e) => (e.decision === "held" ? `run of the build-up x${e.buildup?.touches ?? "?"}, closed back` : EN[e.decision] ?? e.decision);
const wordEn = (h) => (h > 0 ? "up" : h < 0 ? "down" : "none");
const STATE_EN = {
  with: (d) => `W and D agree — heading ${wordEn(d.heading)} now`,
  correction: (d) => `D is correcting (${wordEn(d.daily)}) inside the W heading (${wordEn(d.weekly)})`,
  mixed: (d) => `the week turned ${wordEn(d.weekly)}, the day (${wordEn(d.daily)}) has not confirmed yet`,
  weekly_only: (d) => `W only (${wordEn(d.weekly)}) — no D heading${d.daily_done ? " (its target is taken)" : ""}`,
  daily_only: (d) => `no W heading${d.weekly_done ? " (its target is taken)" : ""} — D (${wordEn(d.daily)}) is the working direction`,
  done: () => "the target is taken — no heading until the next trap",
  none: () => "no heading on W or D",
};
const stateEn = (d) => STATE_EN[d.state]?.(d) ?? d.state;
const closesEn = (e) => e.closes.map((c) => `${c.date} ${fmtP(c.close)}`).join(" → ");

// the latest decision when it is not the turn itself: what it meant
const lastEn = (l, x) => {
  const hl = l.side === "high" ? "high" : "low";
  if (l.role === "confirm") return `last: run of the ${hl} ${fmtP(l.level)} on ${l.run_date}, closed back — the counter-side trap confirms the heading`;
  if (l.role === "pause") return `last: run of the ${hl} ${fmtP(l.level)} on ${l.run_date} without acceptance — a possible correction to ${lvlTxt(x.correction?.to)} (bias, order flow, weekday)`;
  if (l.role === "induce") return `last: acceptance beyond ${fmtP(l.level)} on ${l.decide_date} against the heading, inside the kill ${fmtP(x.kill)} — ${l.side === "high" ? "buyers" : "sellers"} induced, their trap is the entry with the heading`;
  return `last: ${EN[l.decision] ?? l.decision} ${fmtP(l.level)} (${closesEn(l)})`;
};

// the story's bias against the heading: "targets ≠ direction" said in one line
const againstStory = (dir, storyBias) => !!(dir?.heading && storyBias && dir.heading !== storyBias);

const tfEn = (x, name) => {
  if (!x) return null;
  if (x.error) return `${name}: ${x.error}`;
  const parts = [];
  if (x.done) {
    const t = x.done.target;
    parts.push(
      `${name} ${arrow(x.done.side)} done (since ${x.done.since?.decide_date ?? "—"}): target ${fmtP(t.price)} x${t.touches} taken ${t.date} ${t.by === "held" ? "by a run and a close back — a reversal candidate, the map confirms" : "by acceptance"}; nothing further in reach`,
    );
  } else if (!x.heading) {
    parts.push(
      `${name} — no heading${x.killed ? `: acceptance beyond ${fmtP(x.killed.level)} on ${x.killed.date} killed the LB (kill ${fmtP(x.killed.kill)}) — ${x.killed.crowd} induced, their trap is next` : ""}`,
    );
  } else {
    parts.push(`${name} ${arrow(x.heading)} since ${x.since.decide_date} — trap ${fmtP(x.since.level)} (${trapEn(x.since)}, ${closesEn(x.since)}), kill ${fmtP(x.kill)}`);
    if (x.taken) parts.push(`target ${fmtP(x.taken.price)} x${x.taken.touches} taken ${x.taken.date}; next ${lvlTxt(x.target)}`);
    else parts.push(x.target ? `target ${lvlTxt(x.target)}` : x.has_map ? "no target in reach" : "no map — no target");
    const l = x.last;
    if (l?.role && !["trap", "path", "target"].includes(l.role) && !(l.decide_date === x.since.decide_date && l.level === x.since.level)) parts.push(lastEn(l, x));
  }
  if (x.pending?.length) parts.push(`pending: ${x.pending.map((e) => `${e.side} ${fmtP(e.level)} run ${e.run_date}, closed ${e.closes[0].beyond ? "beyond" : "back"}`).join(", ")}`);
  return parts.join("; ");
};

/** English lines for the weekly brief; `storyBias` (1 / −1) is the story's side. */
export function directionLinesEn(dir, storyBias = 0) {
  if (!dir) return [];
  const next = (x) => (x && !x.error ? `${fmtP(x.next.above?.price)} / ${fmtP(x.next.below?.price)}` : "—");
  return [
    `- Direction now (HTF acceptance, docs/MARCO.md §3.2): ${stateEn(dir)}`,
    ...[tfEn(dir.W, "W"), tfEn(dir.D, "D")].filter(Boolean).map((l) => `  - ${l}`),
    ...(againstStory(dir, storyBias)
      ? [`  - against the story: its ${storyBias > 0 ? "long" : "short"} targets stay on the map, the market is not heading to them now`]
      : []),
    ...(dir.leg
      ? [
          dir.leg.heading
            ? `  - H4 leg ${arrow(dir.leg.heading)}${dir.leg.since ? ` since ${dir.leg.since.decide_date}Z — trap ${fmtP(dir.leg.since.level)} (${trapEn(dir.leg.since)}), kill ${fmtP(dir.leg.kill)}` : ""}${dir.leg.target ? `; H4 target ${lvlTxt(dir.leg.target)}` : ""} (${dir.leg.relation === "with" ? "with the heading" : dir.leg.relation === "against" ? "against the heading — a leg, not a turn" : "no HTF heading to compare"}; descriptive, not a signal)`
            : `  - H4 leg: no heading${dir.leg.done ? " — its target is taken" : ""} (descriptive, not a signal)`,
        ]
      : []),
    `  - decision levels (where the state would change; in reach, sweep extremes excluded): W ${next(dir.W)} · D ${next(dir.D)}`,
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
  held: "sweep утримався",
  pending: "рішення — наступним закриттям",
};
const trapUa = (e) => (e.decision === "held" ? `sweep build-up x${e.buildup?.touches ?? "?"}, закриття назад` : UA[e.decision] ?? e.decision);
const crowdUa = (c) => (c === "buyers" ? "покупці" : "продавці");
const ROLE_UA = {
  continuation_day: "закриття за вчорашнім екстремумом у бік напрямку — завтра ймовірне продовження всередині дня, прогресу понад базу немає: не наздоганяти",
  correction_day: "корекційний день (закриття за вчорашнім екстремумом проти напрямку)",
  failed_push: "невдалий поштовх у бік напрямку — пауза, не розворот",
  one_day_sweep: "однодений run проти напрямку і закриття назад — відкат без сигналу",
  inside: "внутрішній день — нейтрально",
  outside: "run обох сторін, закриття всередині — нейтрально",
};
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
const symUa = (x) => (!x || x.error ? "—" : x.done ? `${arrow(x.done.side)} завершено` : arrow(x.heading));

const lastUa = (l, x) => {
  const hl = l.side === "high" ? "хаю" : "лоу";
  if (l.role === "confirm") return `run ${hl} ${fmtP(l.level)} ${dmy(l.run_date)} і закриття назад — trap на протилежному боці підтвердив напрямок`;
  if (l.role === "pause") return `run ${hl} ${fmtP(l.level)} ${dmy(l.run_date)} без закріплення — можлива корекція до ${lvlTxt(x.correction?.to)} (біас, order flow, день тижня)`;
  if (l.role === "induce") return `закріплення за ${fmtP(l.level)} ${dmy(l.decide_date)} проти напрямку під kill ${fmtP(x.kill)} — ${crowdUa(l.side === "high" ? "buyers" : "sellers")} induced, trap їхніх стопів = вхід за напрямком`;
  return `останнє рішення ${dmy(l.decide_date)} — ${UA[l.decision] ?? l.decision} ${fmtP(l.level)}`;
};

const tfUa = (x, name) => {
  if (!x) return null;
  if (x.error) return `${name}: ${x.error}`;
  const parts = [];
  if (x.done) {
    const t = x.done.target;
    parts.push(
      `${name} ${arrow(x.done.side)} завершено (з ${dmy(x.done.since?.decide_date)}): ціль ${fmtP(t.price)} x${t.touches} знята ${dmy(t.date)} ${t.by === "held" ? "run і закриттям назад — trap-кандидат, підтверджує карта" : "закріпленням"}; далі цілей у межах досяжності немає`,
    );
  } else if (!x.heading) {
    parts.push(
      `${name} — напрямку немає${x.killed ? `: закріплення ${dmy(x.killed.date)} за ${fmtP(x.killed.level)} убило LB (kill ${fmtP(x.killed.kill)}) — ${crowdUa(x.killed.crowd)} induced, чекаємо їхній trap` : ""}`,
    );
  } else {
    parts.push(`${name} ${arrow(x.heading)} з ${dmy(x.since.decide_date)} — trap ${fmtP(x.since.level)} (${trapUa(x.since)}), kill ${fmtP(x.kill)}`);
    if (x.taken) parts.push(`ціль ${fmtP(x.taken.price)} x${x.taken.touches} знята ${dmy(x.taken.date)}; наступна ${lvlTxt(x.target)}`);
    else parts.push(x.target ? `ціль ${lvlTxt(x.target)}` : x.has_map ? "цілі в межах досяжності немає" : "карти немає — ціль невідома");
    const l = x.last;
    if (l?.role && !["trap", "path", "target"].includes(l.role) && !(l.decide_date === x.since.decide_date && l.level === x.since.level)) parts.push(lastUa(l, x));
  }
  if (x.pending?.length) {
    parts.push(
      x.pending
        .map((e) => `run ${e.side === "high" ? "хаю" : "лоу"} ${fmtP(e.level)} ${dmy(e.run_date)}, закриття ${e.closes[0].beyond ? "за рівнем" : "назад"} — рішення наступним ${name === "W" ? "тижневим" : "денним"} закриттям`)
        .join("; "),
    );
  }
  return `${parts.join("; ")}.`;
};

/** The Ukrainian block for the daily brief (format v3.1: meaning first, one levels line after); `storyBias` = the story's side. */
export function directionBlockUa(dir, storyBias = 0) {
  if (!dir) return [];
  const stateTail = dir.state === "correction" ? " — D коригується всередині W-руху" : dir.state === "mixed" ? " — W розвернувся, D ще не підтвердив" : "";
  const lines = [`**Напрямок.** W ${symUa(dir.W)} · D ${symUa(dir.D)}${stateTail}.`];
  for (const l of [tfUa(dir.W, "W"), tfUa(dir.D, "D")]) if (l) lines.push(`- ${l}`);
  if (againstStory(dir, storyBias)) {
    lines.push(`- Проти біасу story: цілі ${storyBias > 0 ? "long" : "short"} лишаються на карті, але ринок зараз іде не до них.`);
  }
  if (dir.leg) {
    const l = dir.leg;
    if (!l.heading) lines.push(`- H4-нога без напрямку${l.done ? " — її ціль знята" : ""} (опис, не сигнал).`);
    else {
      const rel = l.relation === "with" ? "за напрямком" : l.relation === "against" ? "проти напрямку — нога, не розворот" : "HTF-напрямку для порівняння немає";
      lines.push(`- H4-нога ${arrow(l.heading)}${l.since ? ` з ${dmy(l.since.decide_date)} — trap ${fmtP(l.since.level)} (${trapUa(l.since)}), kill ${fmtP(l.kill)}` : ""}${l.target ? `; ціль H4 ${lvlTxt(l.target)}` : ""}; ${rel} (опис, не сигнал).`);
    }
  }
  const day = dir.day;
  if (day?.role) {
    lines.push(
      `- Останній D бар (${dmy(day.date)}): ${ROLE_UA[day.role] ?? day.role}${day.pd_level != null ? ` — його екстремум ${day.pd_kind} ${fmtP(day.pd_level)} завтра рівень sweep-trigger: run + закриття назад у бік напрямку = trap, закриття за ним = корекція триває` : ""}.`,
    );
  }
  const lv = [];
  for (const [x, name] of [
    [dir.W, "W"],
    [dir.D, "D"],
  ]) {
    if (!x || x.error) continue;
    if (x.since) lv.push(`${name} trap ${fmtP(x.since.level)} / kill ${fmtP(x.kill)}`);
    if (x.done) lv.push(`ціль ${name} ${fmtP(x.done.target.price)} знята`);
    else if (x.target) lv.push(`ціль ${name} ${lvlTxt(x.target)}`);
    for (const e of x.pending ?? []) lv.push(`${name} рішення ${fmtP(e.level)}`);
  }
  if (day?.pd_level != null) lv.push(`${day.pd_kind} ${fmtP(day.pd_level)}`);
  const nx = (x, name) => (x && !x.error ? `${name} ${fmtP(x.next.above?.price)} / ${fmtP(x.next.below?.price)}` : null);
  const next = [nx(dir.D, "D"), nx(dir.W, "W")].filter(Boolean);
  if (next.length) lv.push(`рівні рішень ${next.join(" · ")}`);
  if (lv.length) lines.push(`Рівні: ${lv.join(" · ")}`);
  const ref = refLevelsTxt(dir);
  if (ref) lines.push(`Довідкові: ${ref}`);
  return lines;
}

/**
 * The story's bias against the direction layers (the trader, 2026-09-26: keep
 * the divergence rule of docs/MARCO.md §3.1, but downgrade the regime word when
 * the direction is against on both timeframes). "against" = both layers have a
 * heading and both are against the bias; "mixed" = one layer against; "with";
 * "none" = no layer with a heading (or no bias). A print-only downgrade: the
 * regime value itself is untouched, so nothing downstream changes.
 */
export function biasVsDirection(dir, storyBias) {
  const empty = { state: "none", facts: "", text_en: "", text_ua: "" };
  if (!dir || dir.error || !storyBias) return empty;
  const layers = [
    ["W", dir.W],
    ["D", dir.D],
  ].filter(([, x]) => x && !x.error);
  if (!layers.length) return empty;
  const facts = layers.map(([n, x]) => `${n} ${x.done ? `${arrow(x.done.side)}✓` : arrow(x.heading)}`).join(" · ");
  const withHeading = layers.filter(([, x]) => x.heading);
  const against = withHeading.filter(([, x]) => x.heading !== storyBias);
  const state = withHeading.length === 2 && against.length === 2 ? "against" : against.length ? "mixed" : withHeading.length ? "with" : "none";
  const EN = { against: `against the direction (${facts})`, mixed: `direction mixed (${facts})` };
  const UA = { against: `проти напрямку (${facts})`, mixed: `напрямок змішаний (${facts})` };
  return { state, facts, text_en: EN[state] ?? "", text_ua: UA[state] ?? "" };
}
