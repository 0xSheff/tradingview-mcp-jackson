/**
 * The nested daily read (docs/MARCO.md §3.1 "the H4 grid", docs/MARCO-CASES.md
 * principles 1–3, approved 2026-09-10/11):
 *
 *   W/D  → direction, invalidation, big targets (the weekend brief)
 *   H4   → the GRID: the nearest untaken liquidity each side, the ladder
 *          between them, the next rung beyond each edge. Scenarios are
 *          events at the grid edges, phrased in H4 levels.
 *   H1…  → scenarios INSIDE the grid only: the confirmation structure at an
 *          edge, the local frame, partials. An LTF read never leaves the grid;
 *          price leaving the grid is an H4 event (redraw).
 *
 * Everything here is pure — it takes maps/bars/reads and returns data or
 * markdown. `runMarcoDaily` (marco.js) wires it to TradingView.
 *
 * Every threshold reused here (eq_tolerance_atr, respect_tolerance_atr,
 * min_touches, stop_buffer_atr, target_min_rr) is a [CALIBRATION] from
 * docs/MARCO.md §6.
 */
import { atrSeries } from "./marco.js";

// significant digits, like marco.js — 6J trades at 0.0063x, MNQ at 30000+
function round(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return n;
  return Number(n.toPrecision(7));
}
const fmt = (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : String(round(n)));
const fmtRr = (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : (Math.round(n * 100) / 100).toString());
const tfLabel = (tf) => (String(tf) === "240" ? "4h" : String(tf) === "60" ? "1h" : `${tf}m`);
const zoneTxt = (z) => (z ? `${fmt(z[0])}–${fmt(z[1])}` : "—");
const itemTxt = (it) => {
  if (!it) return "—";
  if (it.kind === "lb") {
    const flags = [
      it.qualified ? "Q" : null,
      it.thin ? "thin" : null,
      it.tapped ? "tapped" : null,
      it.inducement ? "ind" : null,
      it.grade === "invalid" ? "invalid" : it.grade === "unrefined" ? "unrefined" : null,
    ].filter(Boolean);
    return `LB ${zoneTxt(it.zone)}${flags.length ? ` [${flags.join(" ")}]` : ""}`;
  }
  return `${fmt(it.price)} x${it.touches}${it.seeded ? " (HTF)" : ""}`;
};

// ------------------------------------------------------------------ grid --

/**
 * The H4 grid. Edge candidates on a side are the alive same-side LB
 * extremes and the intact build-ups (≥ min_touches); the nearest one is the
 * anchor, and the edge then extends outward through anything (any level,
 * any LB extreme) sitting within respect_tolerance beyond it — the chain
 * (6E: LB 1.16335 + shelf 1.16285 = one edge; MGC: the nested LB inside the
 * daily LB). Single-touch levels between price and the edge are rungs; what
 * lies past the edge is "beyond" — the redraw target on the bias side, the
 * continuation path on the other. A side with no strong candidate falls
 * back to its nearest level and is flagged `weak`.
 */
export function h4Grid(map, bars, cfg, { bias = 0, sinceBar = null } = {}) {
  const n = bars.length;
  const price = bars[n - 1].close;
  const atr = atrSeries(bars, cfg.atr_length);
  const atrNow = atr[n - 1] ?? 0;
  const respect = (cfg.respect_tolerance_atr ?? 0.75) * atrNow;
  const buf = (cfg.stop_buffer_atr ?? 0) * atrNow;
  const alive = map.blocks.filter((b) => !b.dead);

  const itemsOf = (side) => {
    const isLow = side === "below";
    const levels = (isLow ? map.levels.lows : map.levels.highs).filter((l) => (isLow ? l.price < price : l.price > price));
    const zones = alive.filter((b) => (isLow ? b.side === "bull" && b.bot < price : b.side === "bear" && b.top > price));
    return [
      ...levels.map((l) => ({
        kind: "level",
        price: round(l.price),
        touches: l.touches,
        buildup: l.touches >= cfg.min_touches,
        bars_ago: n - 1 - l.born,
        seeded: l.seeded === true,
      })),
      ...zones.map((b) => ({
        kind: "lb",
        price: round(isLow ? b.bot : b.top),
        zone: [round(b.bot), round(b.top)],
        touches: b.sweptTouches ?? 1,
        qualified: b.qualified,
        thin: b.thin === true,
        tapped: b.tapped,
        inducement: b.inducement === true,
        grade: b.grade ?? "clean",
        bars_ago: n - 1 - b.born,
      })),
    ].sort((a, b) => (isLow ? b.price - a.price : a.price - b.price)); // nearest first
  };

  const sideOf = (side) => {
    const isLow = side === "below";
    const items = itemsOf(side);
    // PENDING (docs/MARCO.md §3.1): the edge was run but the reclaim is not
    // confirmed yet — the level is gone from the map, the LB is not born.
    // The edge stays at the run level until the sweep resolves; everything
    // on this side is what the grid falls back to on a breakdown.
    const p = (map.pending ?? {})[isLow ? "bull" : "bear"] ?? null;
    if (p) {
      return {
        edge: round(p.level),
        anchor: { kind: "pending", price: round(p.level), touches: p.touches, buildup: p.touches >= cfg.min_touches },
        cluster: [],
        weak: false,
        chained: false,
        floor_kind: "pending",
        rungs: [],
        beyond: items.slice(0, 3),
        kill: round(p.ext),
        pending: {
          level: round(p.level),
          ext: round(p.ext),
          touches: p.touches,
          qualified: p.qualified,
          bars_since_run: n - 1 - p.run_bar,
          bars_left: p.bars_left,
          confirm_bars: cfg.confirm_bars,
          lb_if_reclaimed: isLow ? [round(p.ext), round(p.level)] : [round(p.level), round(p.ext)],
          deepened: p.deepened ? [round(p.deepened[0]), round(p.deepened[1])] : null,
        },
      };
    }
    const strong = items.filter((it) => it.kind === "lb" || it.buildup);
    const anchor = strong[0] ?? items[0] ?? null;
    if (!anchor) return { edge: null, anchor: null, cluster: [], weak: true, chained: false, floor_kind: null, rungs: [], beyond: [], kill: null };
    const weak = !strong.length;
    const cluster = [anchor];
    let cur = anchor.price;
    for (;;) {
      const next = items
        .filter((it) => !cluster.includes(it) && (isLow ? it.price < cur && cur - it.price <= respect : it.price > cur && it.price - cur <= respect))
        .sort((a, b) => (isLow ? b.price - a.price : a.price - b.price))[0];
      if (!next) break;
      cluster.push(next);
      cur = next.price;
    }
    const rungs = items.filter((it) => !cluster.includes(it) && (isLow ? it.price > cur : it.price < cur));
    const beyond = items.filter((it) => !cluster.includes(it) && (isLow ? it.price < cur : it.price > cur)).slice(0, 3);
    return {
      edge: round(cur),
      anchor,
      cluster,
      weak,
      chained: cluster.length > 1,
      // what the edge itself is: a level (liquidity — a pocket floor) or an LB extreme
      floor_kind: cluster[cluster.length - 1].kind,
      rungs,
      beyond,
      // a trade past this kills the edge: the stop of anything anchored here
      kill: round(isLow ? cur - buf : cur + buf),
    };
  };

  const lower = sideOf("below");
  const upper = sideOf("above");

  // what the H4 did since the last check — the run/reclaim events only
  const since = (sinceBar === null ? map.events.filter((e) => n - 1 - e.bar <= 6) : map.events.filter((e) => e.bar >= sinceBar))
    .filter((e) =>
      [
        "low_swept",
        "high_swept",
        "bull_lb_created",
        "bear_lb_created",
        "bull_lb_invalidated",
        "bear_lb_invalidated",
        "bull_lb_deepened",
        "bear_lb_deepened",
        "low_poke",
        "high_poke",
        "bull_lb_tap",
        "bear_lb_tap",
        "low_breakdown",
        "high_breakdown",
      ].includes(e.type),
    )
    .map((e) => ({
      bars_ago: n - 1 - e.bar,
      type: e.type,
      ...(e.level !== undefined ? { level: round(e.level) } : {}),
      ...(e.touches !== undefined ? { touches: e.touches } : {}),
      ...(e.zone ? { zone: [round(e.zone[0]), round(e.zone[1])] } : {}),
      ...(e.qualified !== undefined ? { qualified: e.qualified } : {}),
      ...(e.floor !== undefined ? { floor: round(e.floor), ext: round(e.ext) } : {}),
      ...(e.floor === undefined && e.ext !== undefined ? { ext: round(e.ext) } : {}),
    }));

  const inside = lower.edge !== null && upper.edge !== null && price > lower.edge && price < upper.edge;
  return {
    price: round(price),
    atr: round(atrNow),
    respect: round(respect),
    bias,
    lower,
    upper,
    inside,
    state: lower.pending ? "pending_low" : upper.pending ? "pending_high" : inside ? "inside" : "outside",
    since,
  };
}

// ---------------------------------------------------------------- pocket --

function markPocket(t, floor, ext) {
  t.pocket = { floor: floor.price, kind: floor.kind, touches: floor.touches, gap: round(Math.abs(ext - floor.price)) };
  t.preferred = false;
  const why =
    `pocket — inducement: the LB extreme ${fmt(ext)} sits ${fmt(t.pocket.gap)} ${floor.side === "above" ? "below" : "above"} the x${floor.touches} level ${fmt(floor.price)}` +
    `; no entry until ${fmt(floor.price)} is run — the sweep trigger there is the entry`;
  t.note = t.note ? `${t.note}; ${why}` : why;
}

// E1: single-touch swings left intact beyond the zone's extreme — the tap is
// the aggressive entry, the sweep of the nearest such swing the refined one
function markUnrefined(t, left, ext, from) {
  t.unrefined = { floor: left.price, touches: left.touches, gap: round(Math.abs(ext - left.price)), from, kind: left.kind ?? "swing" };
  const what = left.kind === "origin" ? "the inducing move came from" : "from the left";
  const why =
    `unrefined — the ${t.side === "long" ? "low" : "high"} ${fmt(left.price)}${left.touches > 1 ? ` x${left.touches}` : ""} ${what} is intact ` +
    `${fmt(t.unrefined.gap)} ${t.side === "long" ? "below" : "above"} the LB extreme ${fmt(ext)}: this tap is the aggressive entry, the sweep of ${fmt(left.price)} the refined one (E1; V8: the trap does not need it)`;
  t.note = t.note ? `${t.note}; ${why}` : why;
}

/**
 * Pocket flag on entries [CALIBRATION, user-raised, 2026-09-10]. Tiers on
 * existing parameters: within eq_tolerance the map already refuses to print
 * an LB (poke, §2.3). Within respect_tolerance the LB exists but is INSIDE
 * THE POCKET of a deeper LEVEL of liquidity: its tap is inducement — the
 * buyers parked there are the fuel for the run of the floor — so the tap is
 * downgraded and the sweep trigger at the floor becomes the preferred entry.
 * A deeper same-side LB extreme is NOT a pocket floor: that is the V6 stop
 * refinement (the nested LB inside the daily LB), not a trap. E1 (built
 * 2026-09-14) adds the STRUCTURAL tier at any distance: the liquidity the
 * run left intact inside its own structure (`left`, from the map) — a
 * build-up left behind (or an unqualified zone) is the same pocket, a
 * single-touch swing left behind makes the tap `unrefined` (aggressive)
 * with its sweep as the refined entry. Mutates `triggers` (adds `pocket` /
 * `unrefined`, `preferred` / `refined`, extends `note`) and returns the
 * floors found, keyed by anchor extreme, so blocks can carry the flag.
 */
export function flagPocket(triggers, map, bars, cfg, direction) {
  const floors = new Map();
  if (!direction || !Array.isArray(triggers) || !triggers.length) return floors;
  const n = bars.length;
  const atr = atrSeries(bars, cfg.atr_length);
  const respect = (cfg.respect_tolerance_atr ?? 0.75) * (atr[n - 1] ?? 0);
  const long = direction > 0;
  const levels = long ? map.levels.lows : map.levels.highs;

  for (const t of triggers) {
    if (t.kind !== "tap" || !t.stop_anchor) continue;
    const ext = long ? t.stop_anchor[0] : t.stop_anchor[1];
    const deeper = levels
      .filter((l) => (long ? l.price < ext && ext - l.price <= respect : l.price > ext && l.price - ext <= respect))
      .map((l) => ({ kind: "level", price: round(l.price), touches: l.touches, side: long ? "below" : "above" }))
      .sort((a, b) => (long ? a.price - b.price : b.price - a.price)); // the furthest member of the pocket = the real floor
    if (!deeper.length) continue;
    markPocket(t, deeper[0], ext);
    floors.set(ext, t.pocket);
  }
  // E1 structural tier — what the run left intact inside its structure
  const refined = new Set();
  for (const t of triggers) {
    if (t.kind !== "tap" || !t.stop_anchor || t.pocket || !t.left) continue;
    const ext = long ? t.stop_anchor[0] : t.stop_anchor[1];
    if (t.grade === "invalid") {
      const floor = t.left.strong ?? t.left;
      markPocket(t, { kind: "level", price: floor.price, touches: floor.touches, side: long ? "below" : "above" }, ext);
      t.pocket.from = "structure";
      floors.set(ext, t.pocket);
    } else if (t.grade === "unrefined") {
      markUnrefined(t, t.left, ext, "structure");
      refined.add(t.left.price);
    }
  }
  for (const t of triggers) {
    if (t.kind !== "sweep") continue;
    for (const p of floors.values()) if (Math.abs(t.trigger - p.floor) <= 1e-9) t.preferred = true;
    for (const p of refined) if (Math.abs(t.trigger - p) <= 1e-9) t.refined = true;
  }
  return floors;
}

// ------------------------------------------------------------------ clip --

/**
 * Clip a lower-timeframe read to the H4 grid (approved 2026-09-10). Targets
 * past an edge become the edge; a story against the bias inside the grid is
 * `noise` (D1 "trap city"), never "against"; the local frame is the nearest
 * LTF liquidity each side, bounded by the grid edges. The H4's pocket
 * governs the LTF too: a bias-side LTF tap whose extreme sits within the H4
 * respect tolerance of a level edge is inducement whatever the LTF's own
 * ATR says (6E 15m 1.16405 inside the 4h pocket 1.16285–1.16515).
 */
export function clipToGrid(read, grid, bias) {
  if (!read || read.error || !grid) return read;
  const long = bias > 0;
  const lowEdge = grid.lower.edge;
  const highEdge = grid.upper.edge;
  const counterEdge = long ? highEdge : lowEdge;
  const biasSide = long ? grid.lower : grid.upper;

  for (const t of read.triggers ?? []) {
    if (t.target != null && counterEdge !== null && (long ? t.target > counterEdge : t.target < counterEdge)) {
      t.target_unclipped = t.target;
      t.target = round(counterEdge);
      const risk = t.stop == null ? null : Math.abs(t.trigger - t.stop);
      t.rr = risk ? round(Math.abs(t.target - t.trigger) / risk) : null;
      const why = `target clipped to the H4 grid edge ${fmt(t.target)}`;
      t.note = t.note ? `${t.note}; ${why}` : why;
    }
    // E1 (structural — replaces the respect-distance tier of 2026-09-11): an
    // LTF bias-side LB inside the grid sits above the grid's own liquidity.
    // The edge, when it is a level, is the floor at any distance — no entry
    // until it is run; an x1 H4 rung between the LB extreme and the edge
    // makes the tap unrefined — the rung's sweep is the refined entry. An
    // edge that is an LB extreme is the V6 stop refinement, not liquidity.
    if (t.kind === "tap" && t.stop_anchor && !t.pocket && biasSide.edge !== null) {
      const ext = long ? t.stop_anchor[0] : t.stop_anchor[1];
      const beyond = (p) => (long ? p < ext : p > ext);
      if (biasSide.floor_kind === "level" && beyond(biasSide.edge)) {
        const floorItem = biasSide.cluster[biasSide.cluster.length - 1];
        markPocket(t, { kind: "level", price: biasSide.edge, touches: floorItem.touches, side: long ? "below" : "above" }, ext);
        t.pocket.from = "h4 grid";
      } else if (!t.unrefined) {
        const rung = biasSide.rungs
          .filter((r) => r.kind === "level" && beyond(r.price))
          .sort((a, b) => (long ? b.price - a.price : a.price - b.price))[0];
        if (rung) markUnrefined(t, { price: rung.price, touches: rung.touches }, ext, "h4 grid");
      }
    }
  }

  if (bias && read.story?.direction === -bias) {
    read.alignment = "noise";
    read.noise_note = `the ${read.story.mode} on this timeframe runs against the bias inside the H4 grid ${fmt(lowEdge)}–${fmt(highEdge)} — trap city, not a story`;
  }

  const near = (list, isLow) => {
    const inside = (list ?? []).filter((l) => (isLow ? lowEdge === null || l.price >= lowEdge : highEdge === null || l.price <= highEdge));
    const pick = inside[0] ?? null;
    if (pick) return { price: pick.price, touches: pick.touches, source: "ltf" };
    const edge = isLow ? lowEdge : highEdge;
    return edge === null ? null : { price: edge, touches: null, source: "h4 edge" };
  };
  read.local_frame = {
    below: near(read.liquidity?.intact_below, true),
    above: near(read.liquidity?.intact_above, false),
  };
  return read;
}

// ------------------------------------------------------------------ roll --

/**
 * Contract roll detection (approved 2026-09-11 — 6E1! rolled U6→Z6 with a
 * +40.5 pip back-adjustment). The same bars, read twice: a constant
 * difference on every shared bar is a roll; a varying one is a data problem,
 * not a roll; too little overlap is unknown.
 */
export function detectRoll(prevBars, currBars, { tick = null, minShared = 3 } = {}) {
  if (!Array.isArray(prevBars) || !Array.isArray(currBars)) return { status: "unknown", shared: 0, offset: 0 };
  const byTime = new Map(currBars.map((b) => [b.time, b]));
  const diffs = [];
  for (const p of prevBars) {
    const c = byTime.get(p.time);
    if (!c) continue;
    for (const k of ["open", "high", "low", "close"]) {
      if (typeof p[k] === "number" && typeof c[k] === "number") diffs.push(c[k] - p[k]);
    }
  }
  const shared = diffs.length / 4;
  if (shared < minShared) return { status: "unknown", shared, offset: 0 };
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread = sorted[sorted.length - 1] - sorted[0];
  const scale = Math.max(Math.abs(prevBars[0].close ?? 1), 1);
  const tol = tick ? tick * 0.51 : scale * 1e-6;
  if (spread > tol) return { status: "inconsistent", shared, offset: round(median), spread: round(spread) };
  if (Math.abs(median) <= tol) return { status: "same", shared, offset: 0 };
  return { status: "rolled", shared, offset: round(median) };
}

const PRICE_KEYS = new Set([
  "price",
  "near",
  "far",
  "level",
  "trigger",
  "stop",
  "target",
  "target_unclipped",
  "primary_target",
  "h4_high",
  "h4_low",
  "last_price",
  "week_target",
  "extreme",
  "floor",
  "ext",
]);
const PAIR_KEYS = new Set(["zone", "stop_anchor"]);

/** Deep-copy `obj` with every price-carrying field shifted by `offset`. */
export function shiftPrices(obj, offset) {
  if (!offset) return obj;
  const walk = (v, key) => {
    if (Array.isArray(v)) {
      if (PAIR_KEYS.has(key) && v.every((x) => typeof x === "number")) return v.map((x) => round(x + offset));
      return v.map((x) => walk(x, null));
    }
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, k);
      return out;
    }
    if (typeof v === "number" && PRICE_KEYS.has(key)) return round(v + offset);
    return v;
  };
  return walk(obj, null);
}

/**
 * The closed bars of an intraday series and the bar still forming, split
 * (docs/MARCO-CASES.md → Engine gaps, 2026-09-23: two minutes into the 6E
 * 17–21 bar the daily read the unclosed bar as the close back and printed
 * VALID). Every state — run, reclaim, PENDING, breakdown — is computed on
 * the closed bars only; the forming bar is returned so the brief can show it
 * as "in progress". A bar is forming while now < its open + the timeframe.
 * Minute timeframes only: a D/W bar does not end at time + tf.
 */
export function splitForming(bars, tf, nowSec = Date.now() / 1000) {
  const mins = Number(tf);
  if (!Array.isArray(bars) || bars.length < 2 || !Number.isFinite(mins) || mins <= 0) return { closed: bars, forming: null };
  const last = bars[bars.length - 1];
  if (!Number.isFinite(last?.time) || last.time + mins * 60 <= nowSec) return { closed: bars, forming: null };
  return { closed: bars.slice(0, -1), forming: { ...last, closes_at: last.time + mins * 60 } };
}

/** The last `count` CLOSED bars of a series — the basis a later run compares against. */
export function basisBars(bars, count = 30) {
  if (!Array.isArray(bars) || bars.length < 2) return [];
  return bars.slice(-count - 1, -1).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
}

// ------------------------------------------------------------- scenarios --

const money = (t) => (t?.risk_usd == null ? "" : ` · $${Math.round(t.risk_usd)}${t.over_cap ? " ⚠ over cap" : ""}`);

/**
 * The four scenarios of the approved brief format, derived from the grid and
 * the reads. A = the nearest bias-side LB tap (inducement when pocketed);
 * B = the run of the bias-side edge — the level sweep there, or the next
 * LTF bias-side trap inside the grid that clears the min RR and the cap, or
 * the edge itself when it is an LB extreme; C = the grid break (redraw, not
 * a trade); D = the counter edge (run + reclaim → pullback origin; run
 * without reclaim → continuation to the next rung beyond). Plus what is not
 * done, partials and the 1h conditions.
 */
export function dailyScenarios({ grid, reads, bias, cfg, tfs = ["240", "60", "15", "5"], spec = null, cap = null }) {
  const long = bias > 0;
  const side = long ? "long" : "short";
  const biasEdge = long ? grid.lower : grid.upper;
  const counterEdge = long ? grid.upper : grid.lower;
  const eqTol = Math.max((cfg.eq_tolerance_atr ?? 0.25) * (grid.atr ?? 0), 1e-9);
  const minRr = cfg.target_min_rr ?? 1.5;
  const all = (kind, pred = () => true) =>
    tfs
      .flatMap((tf) => (reads[tf]?.triggers ?? []).filter((t) => t.kind === kind && t.side === side && pred(t)).map((t) => ({ tf, ...t })))
      .sort((a, b) => a.distance - b.distance);
  const beyondPrice = (t) => t.target != null && (long ? t.target > grid.price : t.target < grid.price);
  const pendBias = biasEdge.pending ?? null;
  const pendCounter = counterEdge.pending ?? null;
  const agoTxt = (k) => (k === 0 ? "this bar" : k === 1 ? "1 bar ago" : `${k} bars ago`);

  // the one question — three answers: yes (trap in), no (no-man's land),
  // pending (the edge was run, the reclaim is not confirmed: V6 "just
  // because we took the low does not mean buy right away")
  const storyDir = (s) => (s?.mode === "buy_story" ? 1 : s?.mode === "sell_story" ? -1 : 0);
  const eventIn = ["240", "60"].find((tf) => storyDir(reads[tf]?.story) === bias) ?? null;
  const waitFor = pendBias
    ? {
        answer: "pending",
        timeframe: "240",
        fresh: true,
        read:
          `${long ? "low" : "high"} ${fmt(pendBias.level)}${pendBias.touches > 1 ? ` x${pendBias.touches}` : ""} run ${agoTxt(pendBias.bars_since_run)} to ${fmt(pendBias.ext)} — ` +
          `reclaim not confirmed, ${pendBias.bars_left} of ${pendBias.confirm_bars} bars left: a close back ${long ? "above" : "below"} ${fmt(pendBias.level)} is the trap ` +
          `(${long ? "bull" : "bear"} LB ${zoneTxt(pendBias.lb_if_reclaimed)}), a miss is the breakdown`,
      }
    : {
        answer: eventIn ? "yes" : "no",
        read: eventIn ? reads[eventIn].story.read : reads["240"]?.story?.read ?? null,
        timeframe: eventIn,
        fresh: eventIn ? reads[eventIn].story.fresh : null,
      };
  // V8 trap pointer on the bias side: the intact origin of the last move
  // that induced the crowd we want trapped — "grab this low, drag it over";
  // its run is the trap, a reclaim there the entry. Nearest timeframe first.
  const ptrTf = ["240", "60", "15"].find((tf) => reads[tf]?.trap_pointers?.[long ? "bull" : "bear"]) ?? null;
  waitFor.pointer = ptrTf ? { timeframe: ptrTf, ...reads[ptrTf].trap_pointers[long ? "bull" : "bear"] } : null;

  // A — the nearest bias-side LB tap (240 first at equal distance). Over the
  // cap, the V6 refinement is a nested same-side LB inside the zone with a
  // stop the cap allows — name it instead of just saying "refine".
  // Horizon (trader, 2026-09-23): positions are held a day or two, so a
  // scenario is a 4h/1h level or zone; 15m/5m structure only refines the
  // stop inside it (the V6 refinement below), it never is the scenario.
  const htf = (t) => t.tf === "240" || t.tf === "60";
  const tapsAll = all("tap");
  const taps = tapsAll.filter(htf);
  const A = taps[0] ?? null;
  if (A?.over_cap && A.stop_anchor) {
    const inside = tapsAll.find(
      (t) =>
        t !== A &&
        !t.over_cap &&
        t.stop != null &&
        t.stop_anchor &&
        t.stop_anchor[0] >= A.stop_anchor[0] &&
        t.stop_anchor[1] <= A.stop_anchor[1],
    );
    if (inside) A.refined = inside;
  }

  // B — the run of the bias-side edge
  const sweepsAll = all("sweep");
  const sweeps = sweepsAll.filter(htf);
  // E1: an unrefined tap's refined counterpart — the sweep of the left swing
  const refinedOf = (t) => {
    if (!t?.unrefined) return null;
    const s = sweepsAll.find((x) => Math.abs(x.trigger - t.unrefined.floor) <= eqTol) ?? null;
    return s
      ? `the refined entry is its sweep: ${fmt(s.trigger)} → stop ${fmt(s.stop)} → T1 ${fmt(s.target)} (RR ${fmtRr(s.rr)})${money(s)}`
      : "the refined entry is its sweep with a 1h/15m reclaim structure and the same stop";
  };
  const nearEdge = (t) => biasEdge.edge !== null && Math.abs(t.trigger - biasEdge.edge) <= eqTol;
  const atEdge = sweeps.find((t) => nearEdge(t) && t.stop != null) ?? sweeps.find(nearEdge) ?? null;
  const insideGrid = sweeps.find(
    (t) =>
      t.stop != null &&
      grid.inside &&
      t.trigger > grid.lower.edge &&
      t.trigger < grid.upper.edge &&
      beyondPrice(t) &&
      (t.rr ?? 0) >= minRr &&
      !t.over_cap,
  );
  // the nearest bias-side H4 rung between price and the edge: its run with a
  // 1h/15m reclaim is the next 4h-level trap before the edge itself
  const rung = (long ? [...biasEdge.rungs].sort((a, b) => b.price - a.price) : [...biasEdge.rungs].sort((a, b) => a.price - b.price)).find(
    (it) => it.price != null && (long ? it.price < grid.price : it.price > grid.price),
  ) ?? null;
  const rungRun =
    !atEdge && !insideGrid && rung && !pendBias
      ? {
          tf: "240",
          kind: "sweep",
          side,
          trigger: rung.price,
          distance: round(Math.abs(grid.price - rung.price)),
          stop: null,
          stop_anchor: null,
          target: counterEdge.rungs[0]?.price ?? counterEdge.edge ?? null,
          rr: null,
          confirmed: (rung.touches ?? 1) >= (cfg.min_touches ?? 2),
          touches: rung.touches ?? 1,
          synthetic: true,
          risk_usd: null,
          over_cap: null,
          note: null,
        }
      : null;
  let B = atEdge ?? insideGrid ?? rungRun ?? null;
  let Bkind = atEdge ? "edge" : insideGrid ? "inside" : rungRun ? "rung" : null;
  if (!B && biasEdge.edge !== null && !pendBias) {
    // the edge is an LB extreme (or a level no sweep trigger reached): the
    // run of the edge itself, with the stop under the next LB beyond it
    const floorItem = biasEdge.cluster.at(-1) ?? biasEdge.anchor;
    const nextLb = biasEdge.beyond.find((it) => it.kind === "lb") ?? null;
    const buf = (cfg.stop_buffer_atr ?? 0) * (grid.atr ?? 0);
    const stop = nextLb ? round(long ? nextLb.zone[0] - buf : nextLb.zone[1] + buf) : null;
    const target = counterEdge.rungs[0]?.price ?? counterEdge.edge ?? null;
    const risk = stop === null ? null : Math.abs(biasEdge.edge - stop);
    B = {
      tf: "240",
      kind: "sweep",
      side,
      trigger: biasEdge.edge,
      distance: round(Math.abs(grid.price - biasEdge.edge)),
      stop,
      stop_anchor: nextLb ? nextLb.zone : null,
      target,
      rr: risk && target !== null ? round(Math.abs(target - biasEdge.edge) / risk) : null,
      confirmed: biasEdge.floor_kind === "level" ? (floorItem?.touches ?? 1) >= (cfg.min_touches ?? 2) : false,
      touches: floorItem?.touches ?? 1,
      synthetic: true,
      risk_usd: risk !== null && spec ? round(risk * spec.usd_per_point) : null,
      over_cap: risk !== null && spec && cap != null ? risk * spec.usd_per_point > cap : null,
      note: null,
    };
    Bkind = "edge";
  }

  // partials: H4 rungs toward the counter edge + 1h levels inside the grid, clustered
  const partials = [
    ...counterEdge.rungs.map((r) => ({ ...r, tf: "240" })),
    ...(reads["60"]?.liquidity?.[long ? "intact_above" : "intact_below"] ?? [])
      .filter((l) => (long ? l.price > grid.price && l.price < (grid.upper.edge ?? Infinity) : l.price < grid.price && l.price > (grid.lower.edge ?? -Infinity)))
      .map((l) => ({ kind: "level", price: l.price, touches: l.touches, tf: "60" })),
  ]
    .sort((a, b) => (long ? a.price - b.price : b.price - a.price))
    .filter((r, i, arr) => arr.findIndex((o) => Math.abs(o.price - r.price) <= eqTol) === i)
    .slice(0, 4);

  // PENDING on the bias side: the reclaim is the event, the tap of the LB it
  // leaves is the entry, the stop sits beyond the excursion extreme; a miss
  // within confirm_bars is the breakdown (redraw)
  let pendA = null;
  let pendB = null;
  let pendC = null;
  if (pendBias) {
    const buf = (cfg.stop_buffer_atr ?? 0) * (grid.atr ?? 0);
    const entry = pendBias.level;
    const stop = round(long ? pendBias.ext - buf : pendBias.ext + buf);
    const target = partials[0]?.price ?? counterEdge.edge ?? null;
    const risk = Math.abs(entry - stop);
    const rr = target !== null && risk ? round(Math.abs(target - entry) / risk) : null;
    const usd = spec ? round(risk * spec.usd_per_point) : null;
    const over = usd != null && cap != null && usd > cap;
    pendA = {
      label: "A — the reclaim (the event)",
      kind: "reclaim",
      side,
      trigger: entry,
      stop,
      stop_anchor: pendBias.lb_if_reclaimed,
      target,
      rr,
      risk_usd: usd,
      over_cap: over,
      pending: true,
      text:
        `a 1h/15m close back ${long ? "above" : "below"} ${fmt(entry)} within ${pendBias.bars_left} 4h bar(s) → ${long ? "bull" : "bear"} LB ${zoneTxt(pendBias.lb_if_reclaimed)}: ` +
        `entry on the tap of that zone, stop ${fmt(stop)} → T1 ${fmt(target)} (RR ${fmtRr(rr)})${usd != null ? ` · $${Math.round(usd)}${over ? " ⚠ over cap" : ""}` : ""}. ` +
        `Not on the run itself — "just because we took the low does not mean buy right away" (V6).`,
    };
    pendB = {
      label: "B — the run deepens",
      text: `a new ${long ? "low" : "high"} beyond ${fmt(pendBias.ext)} while still pending moves the extreme and the stop with it; the trap completes only on the close back ${long ? "above" : "below"} ${fmt(entry)} — nothing to do ${long ? "below" : "above"} it.`,
    };
    pendC = {
      label: "Grid break — breakdown, redraw",
      text: `no close back ${long ? "above" : "below"} ${fmt(entry)} within ${pendBias.bars_left} bar(s) → the level is consumed without a trap; the grid redraws with ${biasEdge.beyond[0] ? itemTxt(biasEdge.beyond[0]) : "no level in view"} as the next ${long ? "lower" : "upper"} edge. No H1 scenario until then.`,
      next_edge: biasEdge.beyond[0] ?? null,
    };
  }

  const counterZones = tfs
    .flatMap((tf) => (reads[tf]?.false_reactions ?? []).map((f) => ({ tf, ...f })))
    .filter((f, i, arr) => arr.findIndex((o) => o.zone[0] === f.zone[0] && o.zone[1] === f.zone[1]) === i)
    .slice(0, 4);
  const notDone = [
    pendBias ? "no entries on the run itself — pattern trading (V6): the reclaim is the event" : null,
    counterZones.length
      ? `no ${long ? "shorts" : "longs"} from the counter-bias LBs ${counterZones.map((f) => `${zoneTxt(f.zone)} (${tfLabel(f.tf)})`).join(", ")} — pullback origins`
      : null,
    `no ${side}s mid-grid without an event at an edge`,
    `no ${long ? "buys above" : "sells below"} a build-up forming under a counter-bias LB — its run is the trigger (E1)`,
  ].filter(Boolean);

  const biasExt = (t) => (t?.stop_anchor ? fmt(t.stop_anchor[long ? 0 : 1]) : "—");
  const inH4Lb = A && A.tf !== "240" && reads["240"]?.blocks?.some((b) => b.role === "entry" && grid.price >= b.zone[0] && grid.price <= b.zone[1]);
  return {
    wait_for: waitFor,
    A: pendA ?? (A
      ? {
          ...A,
          label: A.pocket
            ? "A — inducement, not an entry"
            : `A — tap of the bias-side LB${A.unrefined ? " (aggressive)" : ""}${A.tf !== "240" ? ` (${tfLabel(A.tf)})` : ""}`,
          text: A.pocket
            ? `LB ${zoneTxt(A.stop_anchor)}${A.tf !== "240" ? ` (${tfLabel(A.tf)})` : ""} holds; a sweep of ${biasExt(A)} that closes back is another respect of ${fmt(A.pocket.floor)} — its ${long ? "buyers" : "sellers"} are the fuel for the run of the floor. Wait for B.`
            : `tap ${fmt(A.trigger)} (LB ${zoneTxt(A.stop_anchor)}${inH4Lb ? ", the LTF structure inside the 4h LB price sits in" : ""}) → stop ${fmt(A.stop)} → T1 ${fmt(A.target)} (RR ${fmtRr(A.rr)})${money(A)}${/thin zone/.test(A.note ?? "") ? " — thin zone, take the stop from the 5m LB" : ""}${
                A.over_cap
                  ? A.refined
                    ? ` — over the cap; refined inside the zone: tap ${fmt(A.refined.trigger)} (LB ${zoneTxt(A.refined.stop_anchor)}, ${tfLabel(A.refined.tf)}) → stop ${fmt(A.refined.stop)} → RR ${fmtRr(A.refined.rr)}${money(A.refined)}; a deeper stab into ${zoneTxt(A.stop_anchor)} takes that stop, not the idea — re-enter (V7)`
                    : " — over the cap: refine the stop on a lower-TF LB inside the zone or pass"
                  : ""
              }. Killed by a trade past ${fmt(A.stop)}.${
                A.unrefined
                  ? ` Unrefined (E1): the ${long ? "low" : "high"} ${fmt(A.unrefined.floor)}${A.unrefined.touches > 1 ? ` x${A.unrefined.touches}` : ""} from the left is intact — ${refinedOf(A)}; Elijah waits for that point.`
                  : ""
              }`,
        }
      : { label: "A — no bias-side LB to tap", text: "no alive LB on the bias side below price" }),
    B: pendB ?? (B
      ? {
          ...B,
          label: Bkind === "edge" ? "B — run of the bias-side edge (main)" : Bkind === "rung" ? "B — run of the nearest H4 rung" : "B — the next trap inside the grid",
          text:
            `${Bkind === "edge" ? "run" : "sweep"} of ${fmt(B.trigger)}${B.confirmed ? ` (x${B.touches})` : ""}${B.tf !== "240" ? ` (${tfLabel(B.tf)})` : ""} with a 1h/15m reclaim structure` +
            (B.stop == null
              ? ` → no H4 stop anchor beyond it: the stop is the 1h/15m LB left by the reclaim → T1 ${fmt(B.target)}.`
              : ` → stop ${fmt(B.stop)} (${long ? "under" : "over"} LB ${zoneTxt(B.stop_anchor)}) → T1 ${fmt(B.target)} (RR ${fmtRr(B.rr)})${money(B)}.`) +
            (B.over_cap ? " Over the cap at the H4 anchor — take the stop from the 1h/15m LB left by the reclaim." : ""),
        }
      : { label: "B — no run to wait for", text: "no bias-side edge in view" }),
    C: pendC ?? {
      label: "Grid break — redraw, not a trade",
      text:
        biasEdge.edge === null
          ? "no bias-side edge"
          : `a 4h trade ${long ? "below" : "above"} ${fmt(biasEdge.kill)} without a reclaim kills the edge ${fmt(biasEdge.edge)}; the grid redraws with ${biasEdge.beyond[0] ? itemTxt(biasEdge.beyond[0]) : "no level in view"} as the next ${long ? "lower" : "upper"} edge. No H1 scenario until then.`,
      next_edge: biasEdge.beyond[0] ?? null,
    },
    D: {
      label: `D — the counter edge ${fmt(counterEdge.edge)}${pendCounter ? " (PENDING)" : ""}`,
      text:
        counterEdge.edge === null
          ? "no counter edge in view"
          : pendCounter
            ? `run ${agoTxt(pendCounter.bars_since_run)} to ${fmt(pendCounter.ext)}, reclaim not confirmed (${pendCounter.bars_left} of ${pendCounter.confirm_bars} bars left): a 1h close back ${long ? "below" : "above"} ${fmt(pendCounter.level)} = a new ${long ? "bear" : "bull"} LB ${zoneTxt(pendCounter.lb_if_reclaimed)}, a pullback origin — partial, then wait for the next ${long ? "low" : "high"}; a miss = continuation, the path to ${counterEdge.beyond[0] ? itemTxt(counterEdge.beyond[0]) : "the next level beyond"} is open, stop to BE.`
            : `run + reclaim → a new ${long ? "bear" : "bull"} LB — invalid (E1): it does not align with the bias, so it is a pullback origin: partial, then wait for the next ${long ? "low" : "high"}; its false reaction is where the next build-up forms, and the ${side} trigger is the run of that build-up — no ${long ? "buys above" : "sells below"} it. Run without reclaim → the path to ${counterEdge.beyond[0] ? itemTxt(counterEdge.beyond[0]) : "the next level beyond"} is open, stop to BE.`,
      beyond: counterEdge.beyond[0] ?? null,
      ...(pendCounter ? { pending: pendCounter } : {}),
    },
    partials,
    stop_buffer: round((cfg.stop_buffer_atr ?? 0) * (grid.atr ?? 0)),
    not_done: notDone,
    h1:
      reads["60"] && !reads["60"].error
        ? {
            story: reads["60"].story.read,
            mode: reads["60"].story.mode ?? null,
            alignment: reads["60"].alignment,
            noise_note: reads["60"].noise_note ?? null,
            lb: reads["60"].story.lb,
            local_frame: reads["60"].local_frame ?? null,
            conditions: [
              pendBias
                ? `A: a 1h/15m close back ${long ? "above" : "below"} ${fmt(pendBias.level)} within ${pendBias.bars_left} 4h bar(s), then the tap of ${zoneTxt(pendBias.lb_if_reclaimed)} — stop ${long ? "under" : "over"} ${fmt(pendBias.ext)}; no such close = breakdown, the grid redraws`
                : null,
              !pendBias && A && !A.pocket
                ? `A${A.unrefined ? " (aggressive)" : ""}: a 1h close back into LB ${zoneTxt(A.stop_anchor)} plus a 5m sweep of ${biasExt(A)} that closes back — that 5m ${long ? "low" : "high"} is the stop` +
                  (A.unrefined ? `; refined: the 1h/15m sweep of ${fmt(A.unrefined.floor)} and its close back — the same stop under LB ${zoneTxt(A.stop_anchor)}` : "")
                : null,
              !pendBias && A && A.pocket ? `A: not traded — a 1h sweep of ${biasExt(A)} is a respect of ${fmt(A.pocket.floor)}, wait for B` : null,
              !pendBias && B
                ? `B: a 1h/15m close ${long ? "below" : "above"} ${fmt(B.trigger)} and the next close back ${long ? "above" : "below"} it — that bar's ${long ? "low" : "high"} is the 1h LB and the stop; no reclaim within a few bars and pressure on ${fmt(biasEdge.kill)} is the grid break`
                : null,
              counterEdge.edge !== null ? `D: a spike past ${fmt(counterEdge.edge)} that closes back on the 1h = pullback origin; a 1h close beyond = continuation` : null,
            ].filter(Boolean),
          }
        : null,
  };
}

// ---------------------------------------------------------------- render --

/**
 * The daily brief v3 — every scenario as a JOURNAL SETUP, in Ukrainian
 * (trader, 2026-09-23: "the result in the format of setups, exactly as we
 * add them to the journal, so I can go through them and pick which ones to
 * add"). Per instrument: Bias · Now · Grid, then the setups ranked with the
 * ones a trader can act on today first — each one the journal's own fields
 * (`instrument · direction · setup_type · K · T · R · size`) and its
 * `setup_description` line list (header · entry when · K-rows · BE · deeper
 * run · breakdown · aggressive tap … skip · global). `dailySetups` builds the
 * objects — `runMarcoDaily` stores them in the JSON as `setups`, ready for
 * plan_add_setup — and `renderDailyMarkdown` prints them. Method terms stay
 * English inside the Ukrainian text (trap, run, LB, tap), a reclaim is
 * "закриття назад", per the trader's glossary. Spec: docs/MARCO-CASES.md →
 * Approved changes (v3); the 2026-09-22 `entry when` grammar (v2) and the
 * v2.1 refinements (summary table, reachable first, tick prices, clock
 * times, alerts) all carry over.
 */
const H_MS = 3600000;
const REACH_ATR = 3; // [CALIBRATION] "reachable today" = within 3 × the 4h ATR of the price
const WINDOWS_FALLBACK = "London 08:00–16:30 UK · NY 09:30–16:00 ET";

const MODE_UA = {
  buy_story: "buy story",
  sell_story: "sell story",
  up_continuation: "continuation вгору",
  down_continuation: "continuation вниз",
  no_mans_land: "no-man's land",
};
const PHASE_UA = { forming: "ще формується", active: "активна", closed: "закрита" };

function hourIn(tz, day, hourEt, exchangeTz, minute = 0) {
  // the wall-clock time `hourEt:minute` of `day` in the exchange zone, rendered in `tz`
  try {
    const probe = new Date(`${day}T12:00:00Z`);
    const partsIn = (d, zone) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
      return { hour: Number(p.hour === "24" ? 0 : p.hour), minute: Number(p.minute), day: Number(p.day) };
    };
    const exch = partsIn(probe, exchangeTz);
    const target = new Date(probe.getTime() + (hourEt - exch.hour) * 3600000 + minute * 60000);
    const loc = partsIn(target, tz);
    return `${String(loc.hour).padStart(2, "0")}:${String(loc.minute).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/**
 * The bar clock of one instrument. `bar(k)` is the wall-clock range of the
 * bar the engine calls "k bars ago" — index 0 is the LAST BAR ANALYSED, i.e.
 * the last closed 4h bar when `r.exec_bars` says one was still forming
 * (2026-09-23: states come from closed bars only). `closes(n)` are the next
 * n 4h closes counted from the bar in progress; `cur` is that bar's range.
 * Without `exec_bars` (older JSONs, hand-built tests) it falls back to the
 * wall clock at `generated_at`, index 0 being the bar open at that moment.
 */
function briefClock(daily, r = null) {
  const exch = daily.exchange_tz ?? "America/New_York";
  const tz = daily.local_tz ?? exch;
  try {
    const hm = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(ms)).replace(/^24/, "00");
    const eb = r?.exec_bars ?? null;
    let last = Number.isFinite(eb?.last_closed_time) ? eb.last_closed_time * 1000 : null;
    let cur = Number.isFinite(eb?.forming?.time) ? eb.forming.time * 1000 : null;
    if (last == null) {
      const now = Date.parse(daily.generated_at);
      if (!Number.isFinite(now)) return null;
      const etHour = (ms) =>
        Number(new Intl.DateTimeFormat("en-US", { timeZone: exch, hour12: false, hour: "2-digit" }).formatToParts(new Date(ms)).find((p) => p.type === "hour").value) % 24;
      // CME 4h bars open at 18/22/02/06/10/14 ET
      let open = Math.floor(now / H_MS) * H_MS;
      for (let i = 0; i < 8 && (etHour(open) + 6) % 4 !== 0; i++) open -= H_MS;
      last = open;
      cur = open;
    } else if (cur == null) {
      cur = last + 4 * H_MS; // nothing forming — the market is closed, the next bar is the next close
    }
    return {
      bar: (k) => `${hm(last - k * 4 * H_MS)}–${hm(last - (k - 1) * 4 * H_MS)}`,
      cur: `${hm(cur)}–${hm(cur + 4 * H_MS)}`,
      closes: (n) => Array.from({ length: Math.max(0, n) }, (_, i) => hm(cur + (i + 1) * 4 * H_MS)),
      stamp: (ms) => hm(ms),
    };
  } catch {
    return null;
  }
}

function tickFns(tick) {
  if (!tick || !Number.isFinite(tick)) return { near: (n) => n, down: (n) => n, up: (n) => n };
  const dec = (String(tick).split(".")[1] ?? "").length;
  const q = (n, f) => (n === null || n === undefined || !Number.isFinite(n) ? n : Number((f(n) * tick).toFixed(dec)));
  return {
    near: (n) => q(n, (x) => Math.round(x / tick)),
    down: (n) => q(n, (x) => Math.floor(x / tick + 1e-9)),
    up: (n) => q(n, (x) => Math.ceil(x / tick - 1e-9)),
  };
}

// "N bars ago" inside an engine read → the bar index, or null
function agoOf(read) {
  const m = /(?:^|\s)(?:(this bar)|(1) bar ago|(\d+) bars ago)/.exec(read ?? "");
  return !m ? null : m[1] ? 0 : m[2] ? 1 : Number(m[3]);
}

// the weekly invalidation rule in the two spellings the brief uses
const invalUa = (rule) => (/weekly close below/.test(rule ?? "") ? "тижневе закриття під" : /weekly close above/.test(rule ?? "") ? "тижневе закриття над" : /daily close below/.test(rule ?? "") ? "денне закриття під" : /daily close above/.test(rule ?? "") ? "денне закриття над" : rule ?? "");
const invalShort = (rule) => (/weekly close below/.test(rule ?? "") ? "W close <" : /weekly close above/.test(rule ?? "") ? "W close >" : /daily close below/.test(rule ?? "") ? "D close <" : /daily close above/.test(rule ?? "") ? "D close >" : rule ?? "");
const invalTag = (rule) => (/weekly/.test(rule ?? "") ? "Wclose" : /daily/.test(rule ?? "") ? "Dclose" : rule ?? "");

const row = (...parts) => parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

function gridLinesUa(grid, long, barTxt) {
  const lines = [];
  const rung = (it) => `    ${itemTxt(it)}`;
  const edgeLine = (side) => {
    const s = side === "upper" ? grid.upper : grid.lower;
    const arrow = side === "upper" ? "▲" : "▼";
    if (s.edge === null) return `  ${arrow} ${side === "upper" ? "верхнього" : "нижнього"} краю в полі зору нема`;
    const isBias = side === "upper" ? !long : long;
    const role = isBias ? "край біасу" : "контр-край";
    if (s.pending) {
      const p = s.pending;
      return `  ${arrow} ${fmt(s.edge)} ${role} — PENDING: run до ${fmt(p.ext)} ${barTxt(p.bars_since_run)}, повернення не підтверджене (${p.bars_left} з ${p.confirm_bars} барів лишилось)${p.deepened ? ` — поглиблено за LB ${zoneTxt(p.deepened)}, той самий trap` : ""}`;
    }
    const members = s.cluster.length > 1 ? ` — ${isBias && s.floor_kind === "level" ? "кишеня" : "кластер"}: ${s.cluster.map(itemTxt).join(" + ")}` : ` — ${itemTxt(s.anchor)}`;
    return `  ${arrow} ${fmt(s.edge)} ${role}${s.weak ? " (слабкий: один дотик)" : ""}${members}`;
  };
  lines.push(edgeLine("upper"));
  for (const r of [...grid.upper.rungs].sort((a, b) => b.price - a.price)) lines.push(rung(r));
  const state = grid.state ?? (grid.inside ? "inside" : "outside");
  lines.push(`  ● ${fmt(grid.price)} ціна${state === "inside" ? "" : state.startsWith("pending") ? " — run не вирішений (PENDING)" : " — ПОЗА сіткою, перемалювання попереду"}`);
  for (const r of [...grid.lower.rungs].sort((a, b) => b.price - a.price)) lines.push(rung(r));
  lines.push(edgeLine("lower"));
  return lines;
}

function sinceLinesUa(grid, barTxt) {
  if (!grid.since.length) return ["нічого — ні run, ні повернення на 4h"];
  const lb = (t) => (t.startsWith("bull") ? "bull" : "bear");
  return grid.since.slice(-8).map((e) => {
    const when = barTxt(e.bars_ago);
    switch (e.type) {
      case "low_swept":
      case "high_swept":
        return `${e.type === "low_swept" ? "лоу" : "хай"} ${fmt(e.level)}${e.touches > 1 ? ` x${e.touches}` : ""} run ${when}`;
      case "bull_lb_created":
      case "bear_lb_created":
        return `повернення → ${lb(e.type)} LB ${zoneTxt(e.zone)}${e.qualified ? " Q" : ""} ${when}`;
      case "bull_lb_invalidated":
      case "bear_lb_invalidated":
        return `${lb(e.type)} LB ${zoneTxt(e.zone)} killed ${when} (трейд за екстремум)`;
      case "bull_lb_deepened":
      case "bear_lb_deepened":
        return `${lb(e.type)} LB ${zoneTxt(e.zone)} поглиблена до ${fmt(e.ext)} ${when} — той самий trap; вирішує повернення за ${fmt(e.level)}`;
      case "low_poke":
      case "high_poke":
        return `прокол ${fmt(e.level)} до ${fmt(e.ext)} ${when} — дно ${fmt(e.floor)} ціле (inducement у кишеню)`;
      case "bull_lb_tap":
      case "bear_lb_tap":
        return `тап ${lb(e.type)} LB ${zoneTxt(e.zone)} ${when}`;
      case "low_breakdown":
      case "high_breakdown":
        return `${e.type === "low_breakdown" ? "лоу" : "хай"} ${fmt(e.level)} пройдено без повернення ${when} — continuation`;
      case "buyers_induced":
      case "sellers_induced":
        return `${e.type === "buyers_induced" ? "покупців" : "продавців"} індуковано ${when} (run ${e.type === "buyers_induced" ? "хаю" : "лоу"} ${fmt(e.level)}) — їхні стопи біля origin ${fmt(e.origin)} (V8)`;
      case "origin_run":
        return `origin ${fmt(e.origin)} run ${when} — індуковані ${e.side === "bull" ? "покупці" : "продавці"} в пастці; вирішує повернення (V8)`;
      default:
        return `${e.type} ${when}`;
    }
  });
}

/**
 * The setups of one instrument in the journal's shape — the fields
 * `plan_add_setup` takes (instrument, direction, setup_type, key_levels,
 * targets ≤ 3, planned_size, planned_r, setup_description) plus what the
 * brief needs to rank and print them (trigger, actionable, over_cap, far,
 * short, title). Rules from .claude/skills/journal-weekly-plan/SKILL.md:
 * tap → lb-zone-tap, run + reclaim → sweep-trigger, a counter-edge trade →
 * early-week-counter-trend (Mon–Tue only); two rungs at most per setup and
 * only in one zone; targets nearest first from the rung's own T1; the global
 * target never in `targets`; `BE:` = the first target-side level; the $ risk
 * from the tick-rounded stop; every `entry when` a positive condition with
 * the two session windows and the gate folded in.
 */
export function dailySetups(r, daily = {}) {
  const g = r.grid;
  const sc = r.scenarios;
  const w = r.weekly ?? {};
  const empty = { state: "—", setups: [], alerts: [], partials: [], top: null, skip: [], windows: null };
  if (!g || !sc || !w.bias) return empty;
  const long = w.bias === "long";
  const side = long ? "long" : "short";
  const cSide = long ? "short" : "long";
  const over = long ? "над" : "під"; // a close back OVER the level (long) / UNDER it (short)
  const under = long ? "під" : "над"; // the stop / a trade UNDER (long) / OVER (short)
  const lowWord = long ? "лоу" : "хай";
  const lbWord = long ? "bull" : "bear";
  const cLbWord = long ? "bear" : "bull";
  const tz = daily.local_tz ?? null;
  const exch = daily.exchange_tz ?? "America/New_York";
  const clock = briefClock(daily, r);
  const at = (h, zone, m = 0) => (tz ? hourIn(tz, daily.trading_day, h, zone, m) : null);
  const windows = tz ? `London ${at(8, "Europe/London")}–${at(16, "Europe/London", 30)} · NY ${at(9, exch, 30)}–${at(16, exch)}` : WINDOWS_FALLBACK;
  const gateFrom = tz ? at(10, exch) : "10:00 ET";
  const win = `${windows} · після ${gateFrom} через гейт`;
  const ctOpen = daily.counter_trend_open ?? !/^closed/i.test(daily.counter_trend_note ?? "");
  const byTxt = (n) => (clock && n > 0 ? `до ${clock.closes(n).at(-1)}` : `протягом ${n} 4h-бар(ів)`);
  const barTxt = (k) => (clock ? `у барі ${clock.bar(k)}` : k === 0 ? "у цьому барі" : `${k} бар(ів) тому`);

  const tick = r.contract?.tick ?? null;
  const T = tickFns(tick);
  const fx = (tick ?? 1) < 0.001;
  const stopPx = (n) => (n == null ? null : long ? T.down(n) : T.up(n));
  const price = r.quote?.last ?? g.price ?? null;
  const atr = g.atr ?? null;
  const pts = (n) => (n == null ? "—" : fx ? `${Number((n / 0.0001).toFixed(1))} pips` : `${fmt(T.near(n))} пт`);
  const dist = (p) => (p == null || price == null ? "" : `${p >= price ? "+" : "−"}${pts(Math.abs(p - price))}`);
  const reachable = (p) => (p == null || price == null || !atr ? true : Math.abs(p - price) / atr <= REACH_ATR);
  const farTxt = (p) => `не сьогодні: ${dist(p)} ≈ ${Math.round(Math.abs(p - price) / atr)}× ATR 4h`;
  const upp = r.contract?.usd_per_point ?? null;
  const cap = daily.risk_cap ?? null;
  const usd = (entry, stop, fb) => (upp && entry != null && stop != null ? Math.round(Math.abs(entry - stop) * upp) : fb != null ? Math.round(fb) : null);
  const overCap = (n) => cap != null && n != null && n > cap;
  const capPts = upp && cap != null ? cap / upp : null;
  const stopRule = `stop ${under} ${lowWord} run з 1h/15m LB${capPts != null ? `, макс ${pts(capPts)} = $${cap}` : ""}`;
  const usdTxt = (n) => (n == null ? null : `$${n}${overCap(n) ? " ⚠ над лімітом" : ""}`);
  const rrOf = (entry, stop, t1) => (entry == null || stop == null || t1 == null || entry === stop ? null : Math.round((Math.abs(t1 - entry) / Math.abs(entry - stop)) * 10) / 10);
  const beLine = (t1) => (t1 == null ? null : `BE: ${fmt(t1)} · стоп → вхід після взяття`);

  const biasEdge = long ? g.lower : g.upper;
  const counterEdge = long ? g.upper : g.lower;
  const pend = biasEdge?.pending ?? null;
  const kill = biasEdge?.kill != null ? stopPx(biasEdge.kill) : null;
  const respect = g.respect ?? 0;
  const buf = sc.stop_buffer ?? (atr ? atr * 0.1 : 0);
  const edgeLvl = (it) => (!it ? null : it.kind === "lb" ? it.zone[long ? 1 : 0] : it.price);
  const nextEdgeItem = sc.C?.next_edge ?? null;
  const nextEdge = nextEdgeItem ? itemTxt(nextEdgeItem) : "рівня в полі зору нема";
  const redrawTo = nextEdgeItem ? `сітка перемальовується до ${nextEdge}` : "сітка перемальовується, наступного рівня в полі зору нема";
  const nextLvl = edgeLvl(nextEdgeItem);
  const header = row(`${w.mode ?? side}/${w.regime ?? "—"}`, w.invalidation ? `inval ${fmt(w.invalidation.level)} ${invalTag(w.invalidation.rule)}` : null);
  const globalLine = w.primary_target != null ? `global: ${fmt(w.primary_target)}${w.primary_atr_weeks != null ? ` (≈${w.primary_atr_weeks}w)` : ""} лише фінальна ціль` : null;
  const invalLine = w.invalidation ? `breakdown: ${invalUa(w.invalidation.rule)} ${fmt(w.invalidation.level)} = інвалідація W-біасу, ${long ? "лонгів" : "шортів"} нема` : null;

  // the target ladder beyond an entry: the rung's own T1 first, then the
  // counter rungs, the counter edge and what lies beyond it — at most three
  const ladder = [...(sc.partials ?? []).map((p) => p.price), counterEdge?.edge ?? null, edgeLvl(sc.D?.beyond)].filter((p) => p != null);
  const targetsFrom = (entry, t1) => {
    if (entry == null) return [];
    const beyond = (p) => (long ? p > entry : p < entry);
    const cands = [t1, ...ladder].filter((p) => p != null && beyond(p)).sort((a, b) => (long ? a - b : b - a));
    const out = [];
    for (const p of cands) {
      if (t1 != null && (long ? p < t1 : p > t1)) continue;
      if (!out.some((q) => fmt(q) === fmt(p) || Math.abs(q - p) <= respect / 3)) out.push(p);
      if (out.length === 3) break;
    }
    return out;
  };

  const alerts = [];
  const addAlert = (p) => {
    if (p == null || price == null || !Number.isFinite(p)) return;
    const v = T.near(p);
    if (!alerts.includes(v)) alerts.push(v);
  };
  const name = r.contract?.journal ?? r.symbol;
  const mk = (o) => ({ instrument: name, direction: side, planned_size: 1, header, far: null, over_cap: false, ...o });
  const opp = [];
  const skip = [];

  const wf = sc.wait_for;
  const state = wf.answer === "pending" ? "PENDING" : wf.answer === "yes" ? "VALID" : "WAITING";

  if (pend) {
    // the reclaim is the event; the tap of the LB it leaves is the entry (V6)
    const A = sc.A;
    const stop = stopPx(A.stop);
    const risk = usd(A.trigger, stop, A.risk_usd);
    const targets = targetsFrom(A.trigger, A.target);
    const rr = rrOf(A.trigger, stop, targets[0]);
    opp.push(
      mk({
        kind: "reclaim",
        setup_type: "sweep-trigger",
        trigger: A.trigger,
        key_levels: [A.trigger],
        targets,
        stop,
        risk,
        planned_r: rr,
        actionable: !overCap(risk),
        over_cap: overCap(risk),
        lines: [
          `entry when: 1h/15m-закриття назад ${over} ${fmt(A.trigger)} ${byTxt(pend.bars_left)} → тап ${lbWord} LB ${zoneTxt(A.stop_anchor)}, яку лишить закриття (не на самому run, V6) · ${win}`,
          row(`K1 sweep+reclaim ${fmt(A.trigger)}`, `stop ${fmt(stop)}`, usdTxt(risk), `RR ${fmtRr(rr)}`, `run краю ${fmt(pend.level)}${pend.touches > 1 ? ` x${pend.touches}` : ""}, повернення = trap`, overCap(risk) ? "над лімітом: стоп з 1h/15m LB після повернення або пропуск" : null),
          beLine(targets[0]),
          `deeper run: новий ${lowWord} ${under} ${fmt(pend.ext)} — екстремум і стоп їдуть за ним, $ перерахувати проти ліміту · те саме entry when`,
          `breakdown: нема закриття назад ${over} ${fmt(A.trigger)} ${byTxt(pend.bars_left)}, або 4h-трейд ${under} ${fmt(kill)} → ${redrawTo} · entry when: run того краю закривається назад`,
          globalLine,
        ].filter(Boolean),
        short: row(`sweep+reclaim ${fmt(A.trigger)} ${byTxt(pend.bars_left)} → тап ${zoneTxt(A.stop_anchor)}`, `stop ${fmt(stop)}`, usdTxt(risk), `T1 ${fmt(targets[0])}`),
      }),
    );
    addAlert(A.trigger);
    addAlert(pend.ext);
  } else {
    const B = sc.B;
    const A = sc.A;
    const hasB = !!(B && B.trigger != null);
    const hasA = !!(A && A.trigger != null && !A.pocket);
    const useA = hasA ? (A.over_cap && A.refined ? A.refined : A) : null;
    const bKind = /run of the bias-side edge/.test(B?.label ?? "") ? "edge" : /nearest H4 rung/.test(B?.label ?? "") ? "rung" : "trap";
    const bWhy = !hasB
      ? null
      : bKind === "edge"
        ? `run краю біасу${B.confirmed ? ` x${B.touches}` : " x1"}`
        : bKind === "rung"
          ? `найближчий 4h-рівень${B.touches > 1 ? ` x${B.touches}` : " x1"} перед краєм ${fmt(biasEdge?.edge)}`
          : `${tfLabel(B.tf)} trap усередині сітки`;
    const bEntryWhen = (lvl) => `1h/15m-закриття ${under} ${fmt(lvl)} і наступне закриття назад ${over} ним → тап LB, яку лишить той бар`;
    const bStop = hasB && B.stop != null && !B.over_cap ? stopPx(B.stop) : null;
    const bStopTxt = !hasB ? null : bStop != null ? `stop ${fmt(bStop)} (${under} LB ${zoneTxt(B.stop_anchor)})` : stopRule;
    const bRisk = hasB && bStop != null ? usd(B.trigger, bStop, B.risk_usd) : null;
    const bOverNote = hasB && B.over_cap ? "4h-якір над лімітом — стоп з 1h/15m LB після повернення" : null;
    const aEntryWhen = hasA ? `1h-закриття назад у LB ${zoneTxt(useA.stop_anchor)} + 5m-run ${fmt(useA.stop_anchor?.[long ? 0 : 1])} із закриттям назад — ${lowWord} того 5m-бара = стоп` : null;
    const aStop = hasA ? stopPx(useA.stop) : null;
    const aRisk = hasA ? usd(useA.trigger, aStop, useA.risk_usd) : null;
    const aWhy = hasA
      ? `${tfLabel(useA.tf ?? A.tf)} LB ${zoneTxt(useA.stop_anchor)}${useA !== A ? ` усередині ${tfLabel(A.tf)} LB ${zoneTxt(A.stop_anchor)}` : ""}${/thin zone/.test(A.note ?? "") ? ", тонка зона — стоп з 5m LB" : ""}${A.unrefined ? ", агресивний вхід (E1)" : ""}`
      : null;
    const aDeeper = !hasA
      ? null
      : useA !== A
        ? `deeper run: глибший прокол у ${zoneTxt(A.stop_anchor)} (стоп 4h-зони ${fmt(stopPx(A.stop))} = $${Math.round(A.risk_usd)}, над лімітом) забирає цей стоп, не ідею — re-entry (V7)`
        : `deeper run: трейд за ${fmt(aStop)} = re-entry з повернення (V7), не ширший стоп`;
    const unrefinedLine = hasA && A.unrefined ? `refined (E1): ${lowWord} ${fmt(A.unrefined.floor)}${A.unrefined.touches > 1 ? ` x${A.unrefined.touches}` : ""} зліва цілий — уточнений вхід, коли його 1h/15m-run закриється назад, той самий стоп` : null;
    const breakdownLine =
      biasEdge?.edge == null
        ? "breakdown: краю біасу в полі зору нема"
        : `breakdown: 4h-трейд ${under} ${fmt(kill)} без повернення → край ${fmt(biasEdge.edge)} знято, ${redrawTo} · entry when: run того краю закривається назад`;
    const tapSkip = A && A.pocket ? `aggressive tap ${zoneTxt(A.stop_anchor)}${A.tf !== "240" ? ` (${tfLabel(A.tf)} LB)` : " (4h LB)"}: skip · inducement, під нею кишеня до ${fmt(A.pocket.floor)}` : null;
    const close =
      hasA &&
      hasB &&
      !useA.over_cap &&
      (Math.abs(useA.trigger - B.trigger) <= respect || (A.stop_anchor && B.trigger >= A.stop_anchor[0] - respect && B.trigger <= A.stop_anchor[1] + respect));

    if (close) {
      // one zone, two rungs: the tap first (nearer), the run of its extreme second
      const targets = targetsFrom(useA.trigger, useA.target ?? A.target ?? B.target);
      const rr = rrOf(useA.trigger, aStop, targets[0]);
      const near = reachable(useA.trigger);
      opp.push(
        mk({
          kind: "tap+run",
          setup_type: "lb-zone-tap",
          trigger: useA.trigger,
          key_levels: [useA.trigger, B.trigger],
          targets,
          stop: aStop,
          risk: aRisk,
          planned_r: rr,
          actionable: near,
          far: near ? null : farTxt(useA.trigger),
          lines: [
            `entry when: K1 — ${aEntryWhen}; K2 — ${bEntryWhen(B.trigger)} · ${win}`,
            row(`K1 tap ${fmt(useA.trigger)}`, `stop ${fmt(aStop)}`, usdTxt(aRisk), `RR ${fmtRr(rr)}`, aWhy),
            row(`K2 sweep+reclaim ${fmt(B.trigger)}`, bStopTxt, usdTxt(bRisk), `RR ${fmtRr(rrOf(B.trigger, bStop, targets[0]))}`, bWhy, bOverNote),
            beLine(targets[0]),
            aDeeper,
            breakdownLine,
            unrefinedLine,
            globalLine,
          ].filter(Boolean),
          short: row(`tap ${fmt(useA.trigger)} (${dist(useA.trigger)}) / run ${fmt(B.trigger)} → ${side}`, `stop ${fmt(aStop)}`, usdTxt(aRisk), `T1 ${fmt(targets[0])}`),
        }),
      );
      addAlert(useA.trigger);
      addAlert(B.trigger);
    } else {
      if (hasB) {
        const targets = targetsFrom(B.trigger, B.target);
        const rr = rrOf(B.trigger, bStop, targets[0]);
        const near = reachable(B.trigger);
        opp.push(
          mk({
            kind: bKind,
            setup_type: "sweep-trigger",
            trigger: B.trigger,
            key_levels: [B.trigger],
            targets,
            stop: bStop,
            risk: bRisk,
            planned_r: rr,
            actionable: near,
            far: near ? null : farTxt(B.trigger),
            lines: [
              `entry when: ${bEntryWhen(B.trigger)} · ${win}`,
              row(`K1 sweep+reclaim ${fmt(B.trigger)}`, bStopTxt, usdTxt(bRisk), `RR ${fmtRr(rr)}`, bWhy, bOverNote),
              beLine(targets[0]),
              breakdownLine,
              tapSkip,
              globalLine,
            ].filter(Boolean),
            short: row(`sweep+reclaim ${fmt(B.trigger)} (${dist(B.trigger)}) → ${side}`, bStop != null ? `stop ${fmt(bStop)}` : "stop з 1h/15m LB", usdTxt(bRisk), `T1 ${fmt(targets[0])}`),
          }),
        );
        addAlert(B.trigger);
      } else if (tapSkip) skip.push(tapSkip);
      if (hasA) {
        const targets = targetsFrom(useA.trigger, useA.target ?? A.target);
        const rr = rrOf(useA.trigger, aStop, targets[0]);
        const near = reachable(useA.trigger);
        const oc = !!useA.over_cap;
        opp.push(
          mk({
            kind: "tap",
            setup_type: "lb-zone-tap",
            trigger: useA.trigger,
            key_levels: [useA.trigger],
            targets,
            stop: aStop,
            risk: aRisk,
            planned_r: rr,
            actionable: near && !oc,
            over_cap: oc,
            far: near ? null : farTxt(useA.trigger),
            lines: [
              `entry when: ${aEntryWhen} · ${win}`,
              row(`K1 tap ${fmt(useA.trigger)}`, `stop ${fmt(aStop)}`, usdTxt(aRisk), `RR ${fmtRr(rr)}`, aWhy, oc ? "над лімітом: стоп з LB нижчого ТФ усередині зони або пропуск" : null),
              beLine(targets[0]),
              aDeeper,
              unrefinedLine,
              hasB ? null : breakdownLine,
              globalLine,
            ].filter(Boolean),
            short: row(`tap ${fmt(useA.trigger)} (${dist(useA.trigger)}) → ${side}`, `stop ${fmt(aStop)}`, usdTxt(aRisk), `T1 ${fmt(targets[0])}`),
          }),
        );
        addAlert(useA.trigger);
      }
    }
    addAlert(biasEdge?.edge);
  }

  // the next edge beyond the grid — the breakdown's own setup, a rung apart
  // from the rest (journal rule: rungs far apart are separate setups)
  if (nextLvl != null && nextEdgeItem) {
    const near = reachable(nextLvl);
    const isLb = nextEdgeItem.kind === "lb";
    const t1 = pend ? pend.level : biasEdge?.edge ?? null;
    const targets = targetsFrom(nextLvl, t1);
    const far = isLb ? nextEdgeItem.zone[long ? 0 : 1] : null;
    const stop = isLb ? stopPx(long ? far - buf : far + buf) : null;
    const risk = usd(nextLvl, stop, null);
    const rr = rrOf(nextLvl, stop, targets[0]);
    opp.push(
      mk({
        kind: "next_edge",
        setup_type: "sweep-trigger",
        trigger: nextLvl,
        key_levels: [nextLvl],
        targets,
        stop,
        risk,
        planned_r: rr,
        actionable: near && !overCap(risk),
        over_cap: overCap(risk),
        far: near ? null : farTxt(nextLvl),
        lines: [
          `entry when: run ${fmt(nextLvl)} (${nextEdge}) + 1h/15m-закриття назад ${over} ${isLb ? fmt(nextLvl) : "ним"} → тап LB, яку лишить закриття · ${win}`,
          row(`K1 sweep+reclaim ${fmt(nextLvl)}`, stop != null ? `stop ${fmt(stop)} (${under} ${fmt(far)} + буфер)` : stopRule, usdTxt(risk), `RR ${fmtRr(rr)}`, `наступний край за сіткою, ${dist(nextLvl)} від ціни`),
          beLine(targets[0]),
          invalLine,
          globalLine,
        ].filter(Boolean),
        short: row(`sweep+reclaim ${fmt(nextLvl)} (${dist(nextLvl)}) → ${side}`, stop != null ? `stop ${fmt(stop)}` : "stop з 1h/15m LB", usdTxt(risk), `T1 ${fmt(targets[0])}`),
      }),
    );
    addAlert(nextLvl);
  }

  // the counter edge: a partial always; a counter-trend setup on Mon–Tue only
  let top = null;
  if (counterEdge?.edge != null) {
    const pc = counterEdge.pending;
    const t1 = (sc.partials ?? []).at(-1)?.price ?? biasEdge?.edge ?? null;
    const beyond = sc.D?.beyond ? itemTxt(sc.D.beyond) : "наступного рівня";
    top = {
      edge: counterEdge.edge,
      pending: pc ?? null,
      lines: [
        pc ? `run ${barTxt(pc.bars_since_run)} до ${fmt(pc.ext)}, повернення ${byTxt(pc.bars_left)}` : null,
        `часткова фіксація на ${side} біля ${fmt(counterEdge.edge)}${ctOpen ? "" : " · контр-тренд закритий (лише пн–вт)"}`,
        `білдап, який лишить його хибна реакція, = наступний тригер на ${side}`,
        `continuation when: 1h-закриття ${long ? "над" : "під"} ${fmt(counterEdge.edge)} → шлях до ${beyond} відкритий, стоп у BE`,
      ].filter(Boolean),
    };
    if (ctOpen) {
      const targets = t1 != null ? [t1] : [];
      opp.push({
        instrument: name,
        direction: cSide,
        planned_size: 1,
        kind: "counter",
        setup_type: "early-week-counter-trend",
        trigger: counterEdge.edge,
        key_levels: [counterEdge.edge],
        targets,
        stop: null,
        risk: null,
        planned_r: null,
        actionable: reachable(counterEdge.edge),
        over_cap: false,
        far: reachable(counterEdge.edge) ? null : farTxt(counterEdge.edge),
        header: row(`контр-тренд (пн–вт) проти W ${side}`, header),
        lines: [
          `entry when: run ${fmt(counterEdge.edge)} + 1h-закриття назад ${long ? "під" : "над"} ним → ${cSide} на ретесті ${cLbWord} LB, яку лишить закриття · до ${gateFrom}, flat у тій самій сесії`,
          row(`K1 sweep+reclaim ${fmt(counterEdge.edge)}`, `stop ${long ? "над хаєм" : "під лоу"} run${capPts != null ? `, макс ${pts(capPts)} = $${cap}` : ""}`, "RR —", "pullback origin: лише до найближчої цілі, не тримати проти W-біасу, займає слот"),
          t1 != null ? `BE: ${fmt(t1)} · це і єдина ціль` : null,
          `breakdown: 1h-закриття ${long ? "над" : "під"} ${fmt(counterEdge.edge)} = continuation до ${beyond} — ${cSide} скасовано`,
        ].filter(Boolean),
        short: `CT ${cSide}: run ${fmt(counterEdge.edge)} + 1h-закриття назад · T1 ${fmt(t1)}`,
      });
    }
    addAlert(counterEdge.edge);
  }

  // reachable and inside the cap first, the original priority kept inside each group
  const ranked = [...opp.filter((o) => o.actionable), ...opp.filter((o) => !o.actionable)];
  const main = ranked.find((o) => o.actionable && o.kind !== "counter") ?? ranked.find((o) => o.actionable) ?? null;
  const setups = ranked.map((o, i) => {
    const { lines, header: h, ...rest } = o;
    return {
      n: i + 1,
      main: o === main,
      ...rest,
      title: row(`${o.instrument} · ${o.direction} · ${o.setup_type}`, `K ${o.key_levels.map(fmt).join(" / ")}`, o.targets.length ? `T ${o.targets.map(fmt).join(" / ")}` : "T —", `R ${fmtRr(o.planned_r)}`, `size ${o.planned_size}`),
      setup_description: [h, ...lines.map((l) => `- ${l}`)].join("\n"),
    };
  });
  return { state, setups, alerts, partials: sc.partials ?? [], top, skip, windows: win, dist };
}

export function renderDailyMarkdown(daily) {
  const tz = daily.local_tz ?? null;
  const exch = daily.exchange_tz ?? "America/New_York";
  const at = (h, zone, m = 0) => (tz ? hourIn(tz, daily.trading_day, h, zone, m) : null);
  const ctOpen = daily.counter_trend_open ?? !/^closed/i.test(daily.counter_trend_note ?? "");
  const cap = daily.risk_cap ?? null;

  const summary = [];
  const blocks = [];
  let clock0 = null;
  for (const r of daily.results) {
    if (r.skipped) {
      blocks.push(`## ${r.symbol} — пропущено: ${r.skipped}`, "");
      continue;
    }
    if (r.error) {
      blocks.push(`## ${r.symbol} — ПОМИЛКА: ${r.error}`, "");
      continue;
    }
    const out = [];
    const w = r.weekly ?? {};
    const long = w.bias === "long";
    const side = long ? "long" : "short";
    const over = long ? "над" : "під";
    const under = long ? "під" : "над";
    const lowWord = long ? "лоу" : "хай";
    const lbWord = long ? "bull" : "bear";
    const T = tickFns(r.contract?.tick ?? null);
    const stopPx = (n) => (n == null ? null : long ? T.down(n) : T.up(n));
    const name = r.contract?.journal ?? r.symbol;
    const g = r.grid;
    const sc = r.scenarios;
    const price = r.quote?.last ?? g?.price ?? null;
    const biasEdge = g ? (long ? g.lower : g.upper) : null;
    const counterEdge = g ? (long ? g.upper : g.lower) : null;
    const pend = biasEdge?.pending ?? null;
    const kill = biasEdge?.kill != null ? stopPx(biasEdge.kill) : null;
    const clock = briefClock(daily, r);
    clock0 ??= clock;
    const barTxt = (k) => (clock ? `у барі ${clock.bar(k)}` : k === 0 ? "у цьому барі" : `${k} бар(ів) тому`);
    const closesTxt = (n) => (clock && n > 0 ? `о ${clock.closes(n).join(" або ")}` : `протягом ${n} 4h-бар(ів)`);
    const S = dailySetups(r, daily);

    const inval = w.invalidation ? ` · inval ${invalShort(w.invalidation.rule)} ${fmt(w.invalidation.level)}` : "";
    out.push(`## ${name} · ${(w.bias ?? "none").toUpperCase()} · ${fmt(price)}${inval}${r.roll?.status === "rolled" ? " · CONTRACT ROLLED" : ""}`);
    if (r.roll?.status === "rolled") {
      out.push(`**Roll.** ${r.roll.note} Кожен рівень тижневого шару нижче зсунуто на ${r.roll.offset > 0 ? "+" : ""}${fmt(r.roll.offset)}; перемалюй лінії і план у журналі на ту саму величину.`);
    } else if (r.roll?.status === "inconsistent") {
      out.push(`**Дані.** ${r.roll.note}`);
    }
    out.push(
      `**Bias.** W ${w.mode ? (MODE_UA[w.mode] ?? w.mode) : (w.bias ?? "—")}/${w.regime ?? "—"}${w.daily_mode ? ` · D ${MODE_UA[w.daily_mode] ?? w.daily_mode}` : ""}${w.stale ? " (stale)" : ""} · глобальна ціль ${fmt(w.primary_target)}${w.primary_atr_weeks != null ? ` (≈${w.primary_atr_weeks}w)` : ""}.`,
    );

    // ---- Now: one state word, the event behind it (bar time), what changes it
    if (sc && g) {
      const wf = sc.wait_for;
      const now = [];
      if (pend) {
        now.push(`**Now: PENDING (4h).** ${lowWord} ${fmt(pend.level)}${pend.touches > 1 ? ` x${pend.touches}` : ""} run ${barTxt(pend.bars_since_run)} до ${fmt(pend.ext)} — вирішує повернення.`);
      } else if (wf.answer === "yes") {
        const tf = wf.timeframe ?? "240";
        const lb = r.timeframes?.[tf]?.story?.lb?.zone ?? null;
        const k = agoOf(wf.read);
        const when = k == null ? "" : tf === "240" ? ` ${barTxt(k)}` : ` ${k === 0 ? "у цьому барі" : `${k} бар(ів) тому`} (${tfLabel(tf)})`;
        now.push(`**Now: VALID (${tfLabel(tf)})${wf.fresh === false ? ", stale" : ""}.** trap: ${lowWord} run і повернення${when}${lb ? ` → ${lbWord} LB ${zoneTxt(lb)}` : ""}.`);
      } else {
        const st = r.timeframes?.["240"]?.story;
        const tail =
          st?.mode === "no_mans_land"
            ? ` · ${st.read.replace(/^build-up phase between (\S+) and (\S+).*/, "build-up між $1 і $2 — no-man's land").replace(/^no recent runs.*/, "run не було, мапа однобока")}`
            : st?.mode
              ? ` · 4h: ${MODE_UA[st.mode] ?? st.mode}`
              : "";
        now.push(`**Now: WAITING.** trap у бік біасу на 4h/1h нема${tail}.`);
      }
      if (wf.pointer) {
        const p = wf.pointer;
        now.push(`Trap pointer (${tfLabel(p.timeframe)}): ${p.induced.who === "buyers" ? "покупці" : "продавці"}, індуковані run ${fmt(p.induced.level)}, тримають стопи ${long ? "під" : "над"} **${fmt(p.price)}** — його run = trap.`);
      }
      if (g.since?.length) now.push(`З останньої перевірки: ${sinceLinesUa(g, barTxt).slice(-4).join(" · ")}.`);
      if (counterEdge?.pending) {
        const pc = counterEdge.pending;
        now.push(`Контр-край ${fmt(pc.level)} PENDING: run ${barTxt(pc.bars_since_run)} до ${fmt(pc.ext)} — 1h-закриття назад = pullback origin, пропуск = continuation.`);
      }
      const changes = pend
        ? `4h-закриття назад ${over} ${fmt(pend.level)} ${closesTxt(pend.bars_left)} → VALID (${lbWord} LB ${zoneTxt(pend.lb_if_reclaimed)}) · пропуск або 4h-трейд ${under} ${fmt(kill)} → BREAKDOWN`
        : wf.answer === "yes"
          ? `4h-трейд ${under} ${fmt(kill)} без повернення → BREAKDOWN · run ${fmt(counterEdge?.edge)} → TOP`
          : `run ${fmt(biasEdge?.edge)} з 1h/15m-закриттям назад → VALID · 4h-трейд ${under} ${fmt(kill)} без повернення → BREAKDOWN`;
      now.push(`Стан змінить: ${changes}.`);
      const fb = r.exec_bars?.forming ?? null;
      if (fb && clock) {
        const runOn = pend ? (long ? fb.low < pend.ext : fb.high > pend.ext) : biasEdge?.edge != null && (long ? fb.low < biasEdge.edge : fb.high > biasEdge.edge);
        const back = pend && (long ? fb.close > pend.level : fb.close < pend.level);
        now.push(
          `Бар ${clock.cur} ще відкритий: H ${fmt(fb.high)} / L ${fmt(fb.low)} / зараз ${fmt(fb.close)} — до закриття не рахується${runOn ? ` · ${pend ? `новий ${lowWord} за ${fmt(pend.ext)}` : `run краю ${fmt(biasEdge.edge)} триває`}` : ""}${back ? ` · ціна ${over} ${fmt(pend.level)}, повернення лише на закритті ${clock.closes(1)[0]}` : ""}.`,
        );
      }
      out.push(now.join("\n"));
    }

    // ---- Grid
    if (g) {
      out.push("", "**Grid 4h** (рівні — для алертів, не ордерів):");
      out.push(...gridLinesUa(g, long, barTxt));
      const beyond = (s) => (s.beyond.length ? s.beyond.map(itemTxt).join(" → ") : "нічого в полі зору");
      out.push(`  далі: ▲ ${beyond(g.upper)} · ▼ ${beyond(g.lower)}`);
    }

    // ---- Setups, in the journal's shape
    let mainShort = null;
    if (sc && g) {
      const main = S.setups.find((s) => s.main) ?? null;
      const first = S.setups[0] ?? null;
      mainShort = main ? `${main.n}. ${main.short}` : `нічого досяжного — чекаємо${first?.trigger != null ? ` на ${fmt(first.trigger)} (${S.dist(first.trigger)})` : ""}`;
      out.push("", `**Сетапи** (спочатку досяжні сьогодні; size 1, ліміт $${cap ?? "—"}).`);
      if (!S.setups.length) out.push("сетапів нема — краю біасу в полі зору немає.");
      for (const s of S.setups) {
        out.push(`### ${s.n}. ${s.title}${s.main ? " — головний" : s.over_cap ? " — над лімітом" : s.far ? ` — ${s.far}` : ""}`);
        out.push("```", s.setup_description, "```");
      }
      const partials = S.partials.length ? ` Часткова фіксація: ${S.partials.map((p) => `${fmt(p.price)}${p.kind === "lb" ? ` (LB ${zoneTxt(p.zone)})` : p.touches > 1 ? ` x${p.touches}` : ""}`).join(" → ")}.` : "";
      out.push(`Все інше = чекаємо.${partials}${S.skip.length ? ` ${S.skip.join(" · ")}.` : ""}`);
      if (S.top) out.push(`TOP ${fmt(S.top.edge)}${S.top.pending ? " (PENDING)" : ""}: ${S.top.lines.join(" · ")}.`);
      if (sc.h1) {
        const f = sc.h1.local_frame;
        const sideTxt = (x) => (x ? `${fmt(x.price)}${x.touches ? ` x${x.touches}` : ""}` : "—");
        const against = sc.h1.alignment === "noise" || sc.h1.alignment === "against";
        const st = sc.h1.story ?? "";
        const mode = sc.h1.mode ?? (/^highs were consumed/.test(st) ? "up_continuation" : /^lows were consumed/.test(st) ? "down_continuation" : /^lows were run and reclaimed/.test(st) ? "buy_story" : /^highs were run and reclaimed/.test(st) ? "sell_story" : null);
        out.push(`1h: ${sc.h1.alignment === "noise" ? "NOISE · " : ""}${MODE_UA[mode] ?? mode ?? "—"}${against ? " проти біасу — вхід лише з 15m-структури повернення" : ""}${f ? ` · рамка ${sideTxt(f.below)} ↔ ${sideTxt(f.above)}` : ""}.`);
      }
    } else if (!w.bias) {
      out.push("", "Без біасу на тиждень — сетапів нема.");
    }

    const gate = Object.values(r.timeframes ?? {}).map((t) => t?.h4_model).find((h) => h?.available);
    if (gate) out.push(`Гейт-свічка (${gate.h4_date}): H ${fmt(gate.h4_high)} / L ${fmt(gate.h4_low)} — ${PHASE_UA[gate.phase] ?? gate.phase}.`);
    if (S.alerts.length && price != null) {
      out.push(`**Alerts:** ${[...S.alerts].sort((a, b) => b - a).slice(0, 6).map((a) => `${fmt(a)} ${a >= price ? "↑" : "↓"}`).join(" · ")}.`);
    }
    out.push("");
    blocks.push(...out);
    summary.push(`| ${name} | ${(w.bias ?? "none").toUpperCase()} | ${S.state} | ${mainShort ?? "—"} |`);
  }

  const sessions = tz ? `London ${at(8, "Europe/London")}–${at(16, "Europe/London", 30)} · NY ${at(9, exch, 30)}–${at(16, exch)} ${tz}` : WINDOWS_FALLBACK;
  const gl = tz ? `${at(6, exch)}–${at(10, exch)}` : "06:00–10:00 ET";
  const gw = tz ? [at(10, exch), at(14, exch)] : ["10:00 ET", "14:00 ET"];
  const stampMs = Date.parse(daily.generated_at);
  const stamp = clock0 && Number.isFinite(stampMs) ? `Знято ${clock0.stamp(stampMs)}${tz ? ` ${tz}` : ""}` : `Знято ${daily.generated_at}`;
  return [
    `# Marco daily brief — ${daily.trading_day} (${daily.weekday}) · сетапи`,
    "",
    `${stamp}. Напрям із ${daily.direction_from}; структура на ${daily.timeframes?.map(tfLabel).join("/") ?? "4h/1h/15m/5m"}, лише закриті бари; ризик за size 1, ліміт $${cap ?? "—"}. Формат v3: кожен сценарій = сетап у граматиці журналу (header · entry when · K-рядки · BE · deeper run · breakdown · global), готовий до plan_add_setup; усе, що не назване, = чекаємо (docs/MARCO-CASES.md → Approved changes; пороги [CALIBRATION], docs/MARCO.md §6).`,
    "",
    "| | Bias | Now | Головний сетап |",
    "|---|---|---|---|",
    ...summary,
    "",
    `**Сьогодні.** Вікна ${sessions} — рівень, узятий поза ними, = алерт, який читаємо з сіткою, не вхід сам по собі. Гейт: 4h-свічка ${gl}; з ${gw[0]} до ${gw[1]} входи з біасом після трейду за її екстремум (V5).${clock0 ? ` Наступні 4h-закриття: ${clock0.closes(3).join(" · ")}${tz ? "" : " ET"}.` : ""} Контр-тренд: ${ctOpen ? "відкритий — лише до найближчої цілі, ніколи не тримати проти глобального біасу" : "закритий (лише пн–вт)"}.`,
    "",
    ...blocks,
  ].join("\n");
}
