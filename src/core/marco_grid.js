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
    const flags = [it.qualified ? "Q" : null, it.thin ? "thin" : null, it.tapped ? "tapped" : null, it.inducement ? "ind" : null].filter(Boolean);
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

/**
 * Pocket flag on entries [CALIBRATION, user-raised, 2026-09-10]. Two tiers on
 * existing parameters: within eq_tolerance the map already refuses to print
 * an LB (poke, §2.3). Within respect_tolerance the LB exists but is INSIDE
 * THE POCKET of a deeper LEVEL of liquidity: its tap is inducement — the
 * buyers parked there are the fuel for the run of the floor — so the tap is
 * downgraded and the sweep trigger at the floor becomes the preferred entry.
 * A deeper same-side LB extreme is NOT a pocket floor: that is the V6 stop
 * refinement (the nested LB inside the daily LB), not a trap. Mutates
 * `triggers` (adds `pocket`, `preferred`, extends `note`) and returns the
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
  for (const t of triggers) {
    if (t.kind !== "sweep") continue;
    for (const p of floors.values()) if (Math.abs(t.trigger - p.floor) <= 1e-9) t.preferred = true;
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
    if (t.kind === "tap" && t.stop_anchor && !t.pocket && biasSide.edge !== null && biasSide.floor_kind === "level") {
      const ext = long ? t.stop_anchor[0] : t.stop_anchor[1];
      const gap = long ? ext - biasSide.edge : biasSide.edge - ext;
      if (gap >= 0 && gap <= grid.respect) {
        const floorItem = biasSide.cluster[biasSide.cluster.length - 1];
        markPocket(t, { kind: "level", price: biasSide.edge, touches: floorItem.touches, side: long ? "below" : "above" }, ext);
        t.pocket.from = "h4 grid";
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

  // A — the nearest bias-side LB tap (240 first at equal distance). Over the
  // cap, the V6 refinement is a nested same-side LB inside the zone with a
  // stop the cap allows — name it instead of just saying "refine".
  const taps = all("tap");
  const A = taps[0] ?? null;
  if (A?.over_cap && A.stop_anchor) {
    const inside = taps.find(
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
  const sweeps = all("sweep");
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
  let B = atEdge ?? insideGrid ?? null;
  let Bkind = atEdge ? "edge" : insideGrid ? "inside" : null;
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
  ].filter(Boolean);

  const biasExt = (t) => (t?.stop_anchor ? fmt(t.stop_anchor[long ? 0 : 1]) : "—");
  const inH4Lb = A && A.tf !== "240" && reads["240"]?.blocks?.some((b) => b.role === "entry" && grid.price >= b.zone[0] && grid.price <= b.zone[1]);
  return {
    wait_for: waitFor,
    A: pendA ?? (A
      ? {
          ...A,
          label: A.pocket ? "A — inducement, not an entry" : `A — tap of the bias-side LB${A.tf !== "240" ? ` (${tfLabel(A.tf)})` : ""}`,
          text: A.pocket
            ? `LB ${zoneTxt(A.stop_anchor)}${A.tf !== "240" ? ` (${tfLabel(A.tf)})` : ""} holds; a sweep of ${biasExt(A)} that closes back is another respect of ${fmt(A.pocket.floor)} — its ${long ? "buyers" : "sellers"} are the fuel for the run of the floor. Wait for B.`
            : `tap ${fmt(A.trigger)} (LB ${zoneTxt(A.stop_anchor)}${inH4Lb ? ", the LTF structure inside the 4h LB price sits in" : ""}) → stop ${fmt(A.stop)} → T1 ${fmt(A.target)} (RR ${fmtRr(A.rr)})${money(A)}${/thin zone/.test(A.note ?? "") ? " — thin zone, take the stop from the 5m LB" : ""}${
                A.over_cap
                  ? A.refined
                    ? ` — over the cap; refined inside the zone: tap ${fmt(A.refined.trigger)} (LB ${zoneTxt(A.refined.stop_anchor)}, ${tfLabel(A.refined.tf)}) → stop ${fmt(A.refined.stop)} → RR ${fmtRr(A.refined.rr)}${money(A.refined)}; a deeper stab into ${zoneTxt(A.stop_anchor)} takes that stop, not the idea — re-enter (V7)`
                    : " — over the cap: refine the stop on a lower-TF LB inside the zone or pass"
                  : ""
              }. Killed by a trade past ${fmt(A.stop)}.`,
        }
      : { label: "A — no bias-side LB to tap", text: "no alive LB on the bias side below price" }),
    B: pendB ?? (B
      ? {
          ...B,
          label: Bkind === "edge" ? "B — run of the bias-side edge (main)" : "B — the next LTF trap inside the grid",
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
            : `run + reclaim → a new ${long ? "bear" : "bull"} LB, a pullback origin: partial, then wait for the next ${long ? "low" : "high"}. Run without reclaim → the path to ${counterEdge.beyond[0] ? itemTxt(counterEdge.beyond[0]) : "the next level beyond"} is open, stop to BE.`,
      beyond: counterEdge.beyond[0] ?? null,
      ...(pendCounter ? { pending: pendCounter } : {}),
    },
    partials,
    not_done: notDone,
    h1:
      reads["60"] && !reads["60"].error
        ? {
            story: reads["60"].story.read,
            alignment: reads["60"].alignment,
            noise_note: reads["60"].noise_note ?? null,
            lb: reads["60"].story.lb,
            local_frame: reads["60"].local_frame ?? null,
            conditions: [
              pendBias
                ? `A: a 1h/15m close back ${long ? "above" : "below"} ${fmt(pendBias.level)} within ${pendBias.bars_left} 4h bar(s), then the tap of ${zoneTxt(pendBias.lb_if_reclaimed)} — stop ${long ? "under" : "over"} ${fmt(pendBias.ext)}; no such close = breakdown, the grid redraws`
                : null,
              !pendBias && A && !A.pocket
                ? `A: a 1h close back into LB ${zoneTxt(A.stop_anchor)} plus a 5m sweep of ${biasExt(A)} that closes back — that 5m ${long ? "low" : "high"} is the stop`
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

function gridLines(grid, long) {
  const lines = [];
  const rung = (it) => `    ${itemTxt(it)}`;
  const edgeLine = (side) => {
    const s = side === "upper" ? grid.upper : grid.lower;
    if (s.edge === null) return `  ${side === "upper" ? "▲" : "▼"} no ${side} edge in view`;
    const isBias = side === "upper" ? !long : long;
    if (s.pending) {
      const p = s.pending;
      const ago = p.bars_since_run === 0 ? "this bar" : p.bars_since_run === 1 ? "1 bar ago" : `${p.bars_since_run} bars ago`;
      return `  ${side === "upper" ? "▲" : "▼"} ${fmt(s.edge)} ${isBias ? "bias edge" : "counter edge"} — PENDING: run to ${fmt(p.ext)} ${ago}, reclaim not confirmed (${p.bars_left} of ${p.confirm_bars} bars left)`;
    }
    const members = s.cluster.length > 1 ? ` — ${isBias && s.floor_kind === "level" ? "pocket" : "cluster"}: ${s.cluster.map(itemTxt).join(" + ")}` : ` — ${itemTxt(s.anchor)}`;
    return `  ${side === "upper" ? "▲" : "▼"} ${fmt(s.edge)} ${isBias ? "bias edge" : "counter edge"}${s.weak ? " (weak: single-touch)" : ""}${members}`;
  };
  lines.push(edgeLine("upper"));
  for (const r of [...grid.upper.rungs].sort((a, b) => b.price - a.price)) lines.push(rung(r));
  const state = grid.state ?? (grid.inside ? "inside" : "outside");
  lines.push(
    `  ● ${fmt(grid.price)} price${state === "inside" ? "" : state.startsWith("pending") ? " — the run is unresolved (PENDING)" : " — OUTSIDE the grid, redraw pending"}`,
  );
  for (const r of [...grid.lower.rungs].sort((a, b) => b.price - a.price)) lines.push(rung(r));
  lines.push(edgeLine("lower"));
  return lines;
}

function sinceLines(grid) {
  if (!grid.since.length) return ["  nothing — no run, no reclaim on the H4"];
  return grid.since.slice(-8).map((e) => {
    const ago = e.bars_ago === 0 ? "this bar" : e.bars_ago === 1 ? "1 bar ago" : `${e.bars_ago} bars ago`;
    switch (e.type) {
      case "low_swept":
      case "high_swept":
        return `  ${e.type === "low_swept" ? "low" : "high"} ${fmt(e.level)}${e.touches > 1 ? ` x${e.touches}` : ""} run ${ago}`;
      case "bull_lb_created":
      case "bear_lb_created":
        return `  reclaim → ${e.type.startsWith("bull") ? "bull" : "bear"} LB ${zoneTxt(e.zone)}${e.qualified ? " Q" : ""} ${ago}`;
      case "bull_lb_invalidated":
      case "bear_lb_invalidated":
        return `  ${e.type.startsWith("bull") ? "bull" : "bear"} LB ${zoneTxt(e.zone)} killed ${ago} (trade beyond the extreme)`;
      case "low_poke":
      case "high_poke":
        return `  poke of ${fmt(e.level)} to ${fmt(e.ext)} ${ago} — floor ${fmt(e.floor)} intact (inducement into the pocket)`;
      case "bull_lb_tap":
      case "bear_lb_tap":
        return `  tap of ${e.type.startsWith("bull") ? "bull" : "bear"} LB ${zoneTxt(e.zone)} ${ago}`;
      case "low_breakdown":
      case "high_breakdown":
        return `  ${e.type === "low_breakdown" ? "low" : "high"} ${fmt(e.level)} consumed without a reclaim ${ago} — continuation`;
      default:
        return `  ${e.type} ${ago}`;
    }
  });
}

function hourIn(tz, day, hourEt, exchangeTz) {
  // the wall-clock hour `hourEt` of `day` in the exchange zone, rendered in `tz`
  try {
    const probe = new Date(`${day}T12:00:00Z`);
    const partsIn = (d, zone) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
      return { hour: Number(p.hour === "24" ? 0 : p.hour), day: Number(p.day) };
    };
    const exch = partsIn(probe, exchangeTz);
    const target = new Date(probe.getTime() + (hourEt - exch.hour) * 3600000);
    const loc = partsIn(target, tz);
    return `${String(loc.hour).padStart(2, "0")}:00`;
  } catch {
    return null;
  }
}

/** The approved intraday brief (docs/MARCO-CASES.md → Approved changes). */
export function renderDailyMarkdown(daily) {
  const out = [
    `# Marco daily brief — ${daily.trading_day} (${daily.weekday})`,
    "",
    `Generated ${daily.generated_at}. Direction from ${daily.direction_from}; structure live on ${daily.timeframes?.map(tfLabel).join("/") ?? "4h/1h/15m/5m"}; risk at size 1, cap $${daily.risk_cap}. Format: docs/MARCO-CASES.md → Approved changes; thresholds [CALIBRATION] (docs/MARCO.md §6).`,
    `Counter-trend: ${daily.counter_trend_note}.`,
    "",
  ];
  const tz = daily.local_tz ?? null;
  const exch = daily.exchange_tz ?? "America/New_York";
  for (const r of daily.results) {
    if (r.skipped) {
      out.push(`## ${r.symbol} — skipped: ${r.skipped}`, "");
      continue;
    }
    if (r.error) {
      out.push(`## ${r.symbol} — ERROR: ${r.error}`, "");
      continue;
    }
    const long = r.weekly.bias === "long";
    const w = r.weekly;
    out.push(`## ${r.contract?.journal ?? r.symbol} · ${(w.bias ?? "none").toUpperCase()} · ${fmt(r.quote?.last)}${r.roll?.status === "rolled" ? " · CONTRACT ROLLED" : ""}`);
    if (r.roll?.status === "rolled") {
      out.push(
        `**Roll.** ${r.roll.note} Every level of the weekly layer below is shifted by ${r.roll.offset > 0 ? "+" : ""}${fmt(r.roll.offset)}; redraw your lines and the journal plan by the same amount.`,
      );
    } else if (r.roll?.status === "inconsistent") {
      out.push(`**Data warning.** ${r.roll.note}`);
    }
    out.push(
      `**Global.** W ${w.bias}/${w.regime}${w.stale ? " (stale)" : ""} · target ${fmt(w.primary_target)}${w.primary_atr_weeks != null ? ` (≈${w.primary_atr_weeks}w)` : ""} · invalidation ${w.invalidation ? `${w.invalidation.rule} ${fmt(w.invalidation.level)}` : "—"}.`,
    );
    const g = r.grid;
    if (g) {
      out.push("", "**H4 grid** (levels are for alerts, not orders):");
      out.push(...gridLines(g, long));
      out.push("", "**Since the last check (H4):**", ...sinceLines(g));
      const beyond = (s) => (s.beyond.length ? s.beyond.map(itemTxt).join(" → ") : "nothing in view");
      out.push("", `**Beyond the grid.** ▲ ${beyond(g.upper)} · ▼ ${beyond(g.lower)}.`);
    }
    const sc = r.scenarios;
    if (sc) {
      out.push(
        "",
        `**What we wait for.** Bias-side run + reclaim: **${sc.wait_for.answer.toUpperCase()}**${sc.wait_for.timeframe ? ` (${tfLabel(sc.wait_for.timeframe)})` : ""}${sc.wait_for.fresh === false ? " — stale" : ""}. ${sc.wait_for.read ?? ""}`,
      );
      out.push("", "**Scenarios.**");
      for (const key of ["A", "B", "C", "D"]) out.push(`- **${sc[key].label}.** ${sc[key].text}`);
      if (sc.partials.length) out.push(`- Partials on the way: ${sc.partials.map((p) => `${fmt(p.price)}${p.kind === "lb" ? ` (LB ${zoneTxt(p.zone)})` : p.touches > 1 ? ` x${p.touches}` : ""}`).join(" → ")}.`);
      out.push(`- Not done: ${sc.not_done.join("; ")}.`);
      if (sc.h1) {
        out.push("", `**1h.** ${sc.h1.alignment === "noise" ? "NOISE — " : ""}${sc.h1.story}${sc.h1.noise_note ? ` (${sc.h1.noise_note})` : ""}`);
        if (sc.h1.local_frame) {
          const f = sc.h1.local_frame;
          const side = (x) => (x ? `${fmt(x.price)}${x.touches ? ` x${x.touches}` : ""} (${x.source})` : "—");
          out.push(`  Local frame inside the grid: ${side(f.below)} ↔ ${side(f.above)}`);
        }
        for (const c of sc.h1.conditions) out.push(`  ${c}`);
      }
    }
    const gate = Object.values(r.timeframes ?? {}).map((t) => t?.h4_model).find((h) => h?.available);
    const local = tz ? ` (${hourIn(tz, daily.trading_day, 6, exch)}–${hourIn(tz, daily.trading_day, 10, exch)} ${tz}, gate open until ${hourIn(tz, daily.trading_day, 14, exch)})` : "";
    out.push(
      "",
      `**Timing.** NY session only; the 06:00–10:00 ET H4 candle${local} sets the gate (V5): after 10:00 ET, ${long ? "longs" : "shorts"} only once price trades ${long ? "below" : "above"} that candle's ${long ? "low" : "high"}; window to 14:00 ET.${gate ? ` Last candle (${gate.h4_date}): H ${fmt(gate.h4_high)} / L ${fmt(gate.h4_low)} — ${gate.phase}.` : ""}`,
    );
    out.push("");
  }
  return out.join("\n");
}
