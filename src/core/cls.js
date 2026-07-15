/**
 * CLS (Candle Liquidity Sweep) core logic — David Perk's HTF methodology.
 * Rules reference: docs/CLS.md. Pure detection functions are exported for
 * unit testing; runClsBrief() scans the watchlist and returns structured
 * data for Claude to render as a CLS-only morning brief.
 */
import { loadRules, loadWatchlist } from "./config.js";
import * as chart from "./chart.js";
import * as data from "./data.js";

export const CLS_DEFAULTS = {
  timeframes: ["W", "D"],
  m1_target_ratio: 0.5,
  m2_zone: [0.618, 0.8],
  liquidity_lookback: 40,
  eq_tolerance_ratio: 0.0005,
  consecutive_filter: 3,
  bars_to_fetch: 60,
  max_merge_candles: 2, // CLS range merges at most this many closed HTF candles
  amd: {
    execution_timeframe: "15",
    bars_to_fetch: 192,
    proximity_ratio: 0.15,
    acc_min_bars: 6,
    acc_max_range_ratio: 0.4,
    max_penetration_ratio: 0.35,
    ciod_body_mult: 1.5,
    ciod_structure_bars: 3,
    target_ratio: 0.5,
    m2_zone: [0.618, 0.8],
  },
  outlook: {
    reach_ratio: 0.6,
    session_open_local: "10:00",
    timebox_min: 90,
  },
};

/**
 * Classify a signal candle against its CLS candle (the previous closed
 * candle). See the classification table in docs/CLS.md §2.
 */
export function classifySignal(clsCandle, signalCandle) {
  const tookHigh = signalCandle.high > clsCandle.high;
  const tookLow = signalCandle.low < clsCandle.low;
  const closedAbove = signalCandle.close > clsCandle.high;
  const closedBelow = signalCandle.close < clsCandle.low;
  const closeLocation = closedAbove ? "above" : closedBelow ? "below" : "inside";

  let signal = "INSIDE";
  if (tookHigh && tookLow) {
    signal = closedAbove
      ? "ACCEPTANCE_UP"
      : closedBelow
        ? "ACCEPTANCE_DOWN"
        : "DOUBLE_SWEEP";
  } else if (tookHigh) {
    signal = closedAbove ? "ACCEPTANCE_UP" : "M1_SHORT";
  } else if (tookLow) {
    signal = closedBelow ? "ACCEPTANCE_DOWN" : "M1_LONG";
  }

  return { took_high: tookHigh, took_low: tookLow, close_location: closeLocation, signal };
}

/**
 * Model 1 levels: reversal after a confirmed sweep.
 * Target = m1_target_ratio of the CLS range, invalidation = sweep extreme.
 */
export function model1Levels(clsCandle, signalCandle, signal, targetRatio = CLS_DEFAULTS.m1_target_ratio) {
  if (signal !== "M1_SHORT" && signal !== "M1_LONG") return null;
  const range = { high: clsCandle.high, low: clsCandle.low };
  const target = range.low + (range.high - range.low) * targetRatio;
  return {
    direction: signal === "M1_SHORT" ? "short" : "long",
    range,
    target,
    invalidation: signal === "M1_SHORT" ? signalCandle.high : signalCandle.low,
  };
}

/**
 * Model 2 plan — the continuation entry after a completed Model 1.
 * Docs: docs/CLS.md §3 "Model 2". Computed entirely in the long-normalized
 * space of detectAMD; real prices are recovered with F.
 *
 * nStop   — manipulation extreme (M1 invalidation, and M2's too).
 * legEnd  — furthest price the M1 impulse printed (normalized high).
 * nM2Target — the opposite CLS extreme (full-range target).
 * lastClose — last closed bar (to locate price against the reload zone).
 * zone    — [near, far] retracement ratios (61.8–80%).
 */
export function model2Plan(nStop, legEnd, nM2Target, lastClose, zone, F) {
  const size = legEnd - nStop;
  if (!(size > 0)) return null;
  const [near, far] = zone;
  const zNear = legEnd - size * near; // first touched on the pullback
  const zFar = legEnd - size * far;

  let status;
  if (legEnd >= nM2Target) status = "COMPLETE"; // impulse already ran the full range
  else if (lastClose >= zNear) status = "AWAIT_PULLBACK";
  else if (lastClose <= nStop) status = "INVALIDATED";
  else status = "ARMED"; // price in (or through) the discount zone

  const a = F(zNear);
  const b = F(zFar);
  const rr = zNear - nStop !== 0 ? (nM2Target - zNear) / (zNear - nStop) : null;
  return {
    status,
    leg: { from: F(nStop), to: F(legEnd) },
    zone: { high: Math.max(a, b), low: Math.min(a, b) },
    entry: F(zNear), // conservative: first-touch edge (61.8%)
    target: F(nM2Target),
    stop: F(nStop),
    rr,
    deep: status === "ARMED" && lastClose < zFar, // past 80% — near invalidation
    confluence: [], // filled by amdLevelReads from the other key levels
  };
}

/**
 * AMD (Accumulation → Manipulation → Distribution) detector at a key level.
 * Docs: docs/CLS.md §3 "Model 1 execution — AMD at the key level".
 *
 * bars — closed execution-TF bars of the current session, oldest first
 * (the caller must drop the developing bar). level — the key-level price;
 * side — which CLS-range extreme it is ("low" → long setup, "high" →
 * short). clsRange — {high, low} of the CLS candle the level belongs to
 * (sets the 50% target and normalizes all ratios).
 *
 * Statuses: NO_SETUP → ACCUMULATING → SWEEPING (beyond the level, close
 * not back inside yet) → MANIPULATED (sweep reclaimed, wait for CIOD) →
 * CONFIRMED (CIOD candle closed — entry). INVALIDATED = penetration too
 * deep (acceptance risk). Once CONFIRMED and the 50% target is reached
 * (m1_target_hit), a Model 2 plan is attached (see model2Plan).
 */
export function detectAMD(bars, level, side, clsRange, opts = {}) {
  const cfg = { ...CLS_DEFAULTS.amd, ...opts };
  const flip = side === "high";
  const F = (p) => (flip ? -p : p);
  const rangeSize = clsRange.high - clsRange.low;

  const base = {
    side,
    direction: flip ? "short" : "long",
    level,
    range_size: rangeSize,
    accumulation: null,
    penetration_ratio: null,
    sweep_extreme: null,
    entry: null,
    stop: null,
    target: null,
    rr: null,
    ciod_time: null,
    m1_target_hit: false,
    model2: null,
  };
  if (!bars?.length || !(rangeSize > 0)) return { status: "NO_SETUP", ...base };

  // Normalize so the level is always a low being swept (long logic only).
  const nBars = bars.map((b) => ({
    time: b.time,
    open: F(b.open),
    close: F(b.close),
    high: F(flip ? b.low : b.high),
    low: F(flip ? b.high : b.low),
  }));
  const nLevel = F(level);
  const nRangeLow = F(flip ? clsRange.high : clsRange.low);
  const nTarget = nRangeLow + cfg.target_ratio * rangeSize; // M1: 50% of range
  const nM2Target = nRangeLow + rangeSize; // M2: opposite extreme (full range)
  const band = nLevel + cfg.proximity_ratio * rangeSize;
  base.target = F(nTarget);

  const sweepIdxs = nBars.reduce((acc, b, i) => {
    if (b.low < nLevel) acc.push(i);
    return acc;
  }, []);

  // Accumulation quality over the pre-distribution window (filled in once
  // the CIOD index — if any — is known).
  const accumulationIn = (endIdx) => {
    const near = nBars.slice(0, endIdx).filter((b) => b.low <= band);
    if (!near.length) return null;
    const rangeRatio =
      (Math.max(...near.map((b) => b.high)) - Math.min(...near.map((b) => b.low))) / rangeSize;
    return {
      ok: near.length >= cfg.acc_min_bars && rangeRatio <= cfg.acc_max_range_ratio,
      bars: near.length,
      range_ratio: rangeRatio,
    };
  };

  if (!sweepIdxs.length) {
    base.accumulation = accumulationIn(nBars.length);
    return { status: base.accumulation ? "ACCUMULATING" : "NO_SETUP", ...base };
  }

  const penetration = nLevel - Math.min(...nBars.map((b) => b.low));
  base.penetration_ratio = penetration / rangeSize;
  if (base.penetration_ratio > cfg.max_penetration_ratio) {
    base.accumulation = accumulationIn(nBars.length);
    base.sweep_extreme = F(nLevel - penetration);
    return { status: "INVALIDATED", ...base };
  }

  if (nBars[nBars.length - 1].close < nLevel) {
    base.accumulation = accumulationIn(nBars.length);
    base.sweep_extreme = F(nLevel - penetration);
    return { status: "SWEEPING", ...base };
  }

  // Sweep reclaimed — look for the CIOD candle from the last touch of the
  // level onward: a displacement bar in the reversal direction that closes
  // back inside AND above the recent structure.
  const lastTouch = sweepIdxs[sweepIdxs.length - 1];
  let ciod = null;
  for (let i = Math.max(lastTouch, 1); i < nBars.length; i++) {
    const b = nBars[i];
    const body = b.close - b.open;
    if (body <= 0 || b.close <= nLevel) continue;
    const prior = nBars.slice(0, i);
    const avgBody =
      prior.reduce((s, p) => s + Math.abs(p.close - p.open), 0) / prior.length;
    const structHigh = Math.max(
      ...prior.slice(-cfg.ciod_structure_bars).map((p) => p.high),
    );
    if (avgBody > 0 && body >= cfg.ciod_body_mult * avgBody && b.close > structHigh) {
      ciod = { index: i, close: b.close, time: b.time };
      break;
    }
  }

  const extentIdx = ciod ? ciod.index : nBars.length - 1;
  const nStop = Math.min(...nBars.slice(0, extentIdx + 1).map((b) => b.low));
  base.accumulation = accumulationIn(ciod ? ciod.index : nBars.length);
  base.sweep_extreme = F(nStop);
  base.stop = F(nStop);
  if (ciod) {
    base.entry = F(ciod.close);
    base.ciod_time = ciod.time;
    base.rr = (nTarget - ciod.close) / (ciod.close - nStop);
    // Model 1 completes once price reaches the 50% target; the impulse leg
    // (manipulation extreme → furthest high since CIOD) then defines the
    // Model 2 reload zone. See docs/CLS.md §3 "Model 2".
    const legEnd = Math.max(...nBars.slice(ciod.index).map((b) => b.high));
    base.m1_target_hit = legEnd >= nTarget;
    if (base.m1_target_hit) {
      base.model2 = model2Plan(
        nStop,
        legEnd,
        nM2Target,
        nBars[nBars.length - 1].close,
        cfg.m2_zone,
        F,
      );
    }
    return { status: "CONFIRMED", ...base };
  }
  base.rr = (nTarget - nLevel) / (nLevel - nStop); // indicative, from the level
  return { status: "MANIPULATED", ...base };
}

/**
 * Run the AMD detector on the levels each HTF analysis exposes: the active
 * setup's anchor (the extreme being manipulated) and any deeper pending
 * levels, each against its own merged CLS range. Weekly = strong, daily =
 * weak. sessionBars = closed execution-TF bars of the current session.
 */
export function amdLevelReads(timeframes, sessionBars, cfg = CLS_DEFAULTS, context = {}) {
  const strength = { W: "strong", D: "weak" };
  const amdCfg = { ...CLS_DEFAULTS.amd, ...(cfg.amd || {}) };
  const reads = [];
  for (const [tf, analysis] of Object.entries(timeframes)) {
    if (!analysis || analysis.error) continue;
    const targets = [];
    if (analysis.setup) {
      targets.push({
        kind: "active",
        side: analysis.setup.side,
        level: analysis.setup.anchor,
        range: analysis.cls_range,
      });
    }
    for (const d of analysis.deeper_levels || []) {
      targets.push({ kind: "deeper", side: d.side, level: d.level, range: d.cls_range });
    }
    for (const t of targets) {
      reads.push({
        tf,
        strength: strength[tf] ?? "unknown",
        kind: t.kind,
        level_type: `${tf}-${t.kind}-${t.side === "low" ? "L" : "H"}`,
        ...detectAMD(sessionBars, t.level, t.side, t.range, amdCfg),
      });
    }
  }

  // Confluence: a Model 2 reload zone that overlaps another resting key
  // level (or an externally supplied one, e.g. NWOG) is a higher-quality
  // second entry — see docs/CLS.md §3.
  const extra = context.extra_levels || []; // [{ type, price }]
  for (const r of reads) {
    if (!r.model2) continue;
    const { high, low } = r.model2.zone;
    const others = [
      ...reads
        .filter((o) => o !== r)
        .map((o) => ({ type: o.level_type, price: o.level })),
      ...extra,
    ];
    r.model2.confluence = others.filter((l) => l.price >= low && l.price <= high);
  }
  return reads;
}

/**
 * Morning prospect layer. Given the AMD level reads and the current price,
 * decide whether a CLS setup is worth waiting for in the next session —
 * without live monitoring. Returns one of:
 *   WAIT  — a setup is armed/forming; stay and wait for the trigger.
 *   WATCH — nothing armed yet, but a key level is within reach of the
 *           London impulse; watch the open.
 *   SKIP  — levels out of reach, invalidated, or nothing actionable.
 * Docs: docs/CLS.md §"Morning routine".
 */
export function clsOutlook(reads, opts = {}) {
  const cfg = { ...CLS_DEFAULTS.outlook, ...opts };
  const price = opts.currentPrice;

  const scored = reads
    .map((r) => {
      const distance_ratio =
        price != null && r.range_size ? Math.abs(price - r.level) / r.range_size : null;
      let score = 0;
      let note = "";
      switch (r.status) {
        case "CONFIRMED":
          score = 100;
          note = "M1 confirmed — CIOD closed";
          break;
        case "MANIPULATED":
          score = 90;
          note = "swept & reclaimed — await CIOD";
          break;
        case "SWEEPING":
          score = 60;
          note = "sweep in progress — may reclaim";
          break;
        case "ACCUMULATING":
          score = r.accumulation?.ok ? 70 : 30;
          note = r.accumulation?.ok
            ? "tight accumulation at level"
            : "loose accumulation near level";
          break;
        case "INVALIDATED":
          score = 5;
          note = "acceptance — level broken";
          break;
        default: // NO_SETUP
          if (distance_ratio != null && distance_ratio <= cfg.reach_ratio) {
            score = 40;
            note = "level within London-impulse reach";
          } else {
            note = "level out of reach";
          }
      }
      if (r.strength === "strong" && score > 0) score += 10; // weekly > daily
      return { ...r, distance_ratio, score, outlook_note: note };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0] || null;
  let state = "SKIP";
  if (top) {
    if (top.score >= 60) state = "WAIT";
    else if (top.score >= 35) state = "WATCH";
  }

  return {
    state,
    driver: top && top.score > 0 ? top : null,
    deadline: deadlineNote(cfg.session_open_local, cfg.timebox_min),
    ranked: scored,
  };
}

/** Session-open + timebox → a plain decision deadline for the brief. */
function deadlineNote(open, mins) {
  const [h, m] = String(open).split(":").map(Number);
  const t = h * 60 + m + mins;
  const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return { london_open_local: open, decide_by_local: `${hh}:${mm}`, timebox_min: mins };
}

/** Count consecutive same-direction closed candles ending at the last bar. */
export function consecutiveRun(bars) {
  let direction = null;
  let count = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    const dir = b.close > b.open ? "bull" : b.close < b.open ? "bear" : null;
    if (!dir) break;
    if (!direction) direction = dir;
    if (dir !== direction) break;
    count++;
  }
  return { direction: count ? direction : null, count };
}

/** Williams-style fractal swings (strength bars on each side). */
export function findSwings(bars, strength = 2) {
  const highs = [];
  const lows = [];
  for (let i = strength; i < bars.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (bars[i].high <= bars[i - j].high || bars[i].high < bars[i + j].high) isHigh = false;
      if (bars[i].low >= bars[i - j].low || bars[i].low > bars[i + j].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: bars[i].high, time: bars[i].time });
    if (isLow) lows.push({ index: i, price: bars[i].low, time: bars[i].time });
  }
  return { highs, lows };
}

/**
 * Resting liquidity: untaken swing highs/lows within lookback, split around
 * the current price, nearest first. Equal highs/lows (two untaken swings
 * within tolerance) are the strongest draws.
 */
export function liquidityMap(bars, currentPrice, opts = {}) {
  const lookback = opts.lookback ?? CLS_DEFAULTS.liquidity_lookback;
  const eqTol = (opts.eq_tolerance_ratio ?? CLS_DEFAULTS.eq_tolerance_ratio) * currentPrice;
  const scan = bars.slice(-lookback);
  const { highs, lows } = findSwings(scan);

  const untakenHighs = highs.filter(
    (s) => !scan.slice(s.index + 1).some((b) => b.high > s.price),
  );
  const untakenLows = lows.filter(
    (s) => !scan.slice(s.index + 1).some((b) => b.low < s.price),
  );

  const markEqual = (swings) => {
    const groups = [];
    for (const s of swings) {
      const g = groups.find((grp) => Math.abs(grp[0].price - s.price) <= eqTol);
      if (g) g.push(s);
      else groups.push([s]);
    }
    return groups.filter((g) => g.length >= 2).map((g) => g[0].price);
  };

  const above = untakenHighs
    .map((s) => s.price)
    .filter((p) => p > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 3);
  const below = untakenLows
    .map((s) => s.price)
    .filter((p) => p < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 3);

  return {
    above,
    below,
    equal_highs: markEqual(untakenHighs),
    equal_lows: markEqual(untakenLows),
  };
}

/**
 * Uncovered extremes — the staircase of closed-candle lows/highs that no
 * later closed candle has traded through: resting HTF liquidity. Returned
 * nearest (most recent) first. side "low" → descending lows, "high" →
 * ascending highs. See docs/CLS.md §"CLS range".
 */
export function uncoveredExtremes(closed, side) {
  const out = [];
  if (side === "low") {
    let run = Infinity;
    for (let i = closed.length - 1; i >= 0; i--) {
      if (closed[i].low < run) {
        out.push({ price: closed[i].low, index: i });
        run = closed[i].low;
      }
    }
  } else {
    let run = -Infinity;
    for (let i = closed.length - 1; i >= 0; i--) {
      if (closed[i].high > run) {
        out.push({ price: closed[i].high, index: i });
        run = closed[i].high;
      }
    }
  }
  return out;
}

/**
 * Merged CLS range anchored at `anchorIndex`: spans that closed candle
 * through the last closed one. For a long the low is the anchor's low and
 * the high is the highest high across the span (mirror for a short).
 */
function mergedRange(closed, anchorIndex, side) {
  const seg = closed.slice(anchorIndex);
  return side === "low"
    ? { low: closed[anchorIndex].low, high: Math.max(...seg.map((c) => c.high)) }
    : { high: closed[anchorIndex].high, low: Math.min(...seg.map((c) => c.low)) };
}

function pendingLevel(closed, u, side) {
  const r = mergedRange(closed, u.index, side);
  return {
    side,
    direction: side === "low" ? "long" : "short",
    level: u.price,
    cls_range: r,
    m1_target: (r.high + r.low) / 2,
  };
}

/**
 * Build the active CLS setup from closed HTF candles + the developing one.
 * The developing candle is the manipulator: whichever extreme of the last
 * closed candle it sweeps sets the direction (sweep low → long toward the
 * middle; sweep high → short). The CLS range is *merged* across closed
 * candles down to the deepest uncovered extreme the developing bar has
 * actually swept; the opposite bound is the extreme high/low of the merge.
 * Deeper uncovered extremes not yet swept are returned as pending setups
 * (activate only once price reaches them). The merge is capped at
 * `maxMerge` closed candles (2 weeks by default) — deeper than that gets
 * complex and less predictable. Docs: docs/CLS.md §"CLS range".
 */
export function buildActiveSetup(closed, developing, maxMerge = CLS_DEFAULTS.max_merge_candles) {
  closed = closed.slice(-maxMerge);
  const last = closed[closed.length - 1];
  const sweptLow = developing.low < last.low;
  const sweptHigh = developing.high > last.high;

  let side = null;
  if (sweptLow && sweptHigh) {
    const mid = (last.high + last.low) / 2; // outside bar — take the reclaimed side
    side = developing.close >= mid ? "low" : "high";
  } else if (sweptLow) side = "low";
  else if (sweptHigh) side = "high";

  const uncovLow = uncoveredExtremes(closed, "low");
  const uncovHigh = uncoveredExtremes(closed, "high");

  if (!side) {
    // Developing still inside the last closed range — no manipulation yet.
    // Surface the nearest resting extreme on each side as pending setups.
    const deeper = [];
    if (uncovLow[0]) deeper.push(pendingLevel(closed, uncovLow[0], "low"));
    if (uncovHigh[0]) deeper.push(pendingLevel(closed, uncovHigh[0], "high"));
    return { setup: null, cls_range: { high: last.high, low: last.low }, m1_target: null, deeper };
  }

  const long = side === "low";
  const uncovered = long ? uncovLow : uncovHigh;
  // Anchor = deepest uncovered extreme the developing bar has actually swept.
  let anchor = uncovered[0];
  for (const u of uncovered) {
    const swept = long ? developing.low < u.price : developing.high > u.price;
    if (swept) anchor = u;
    else break;
  }
  const cls_range = mergedRange(closed, anchor.index, side);
  const deeper = uncovered
    .filter((u) => (long ? u.price < anchor.price : u.price > anchor.price))
    .map((u) => pendingLevel(closed, u, side));

  return {
    setup: {
      side,
      direction: long ? "long" : "short",
      anchor: anchor.price,
      sweep_extreme: long ? developing.low : developing.high,
    },
    cls_range,
    m1_target: (cls_range.high + cls_range.low) / 2,
    deeper,
  };
}

/**
 * Full CLS read of one timeframe. The last bar is the developing (unclosed)
 * candle; the rest are closed. The developing candle sweeping a closed
 * extreme is the manipulation — Model 1 targets the middle of the (merged)
 * CLS range (mean reversion), Model 2 the opposite extreme.
 */
export function analyzeTimeframe(bars, cfg = CLS_DEFAULTS) {
  if (!bars || bars.length < 2) {
    return { error: `Not enough bars for CLS analysis (need 2+, got ${bars?.length ?? 0})` };
  }
  const developing = bars[bars.length - 1];
  const closed = bars.slice(0, -1);

  const active = buildActiveSetup(closed, developing, cfg.max_merge_candles);
  const long = active.setup?.direction === "long";

  let model1 = null;
  let m1TargetHit = false;
  let model2 = null;
  if (active.setup) {
    model1 = {
      direction: active.setup.direction,
      range: active.cls_range,
      target: active.m1_target, // middle of the CLS range
      invalidation: active.setup.sweep_extreme,
    };
    m1TargetHit = long
      ? developing.high >= active.m1_target
      : developing.low <= active.m1_target;
    if (m1TargetHit) {
      const F = (p) => (long ? p : -p);
      model2 = model2Plan(
        F(active.setup.sweep_extreme), // manipulation extreme
        F(long ? developing.high : developing.low), // reaction extreme
        F(long ? active.cls_range.high : active.cls_range.low), // opposite extreme (full range)
        F(developing.close),
        cfg.m2_zone,
        F,
      );
      if (model2) model2.direction = active.setup.direction;
    }
  }

  return {
    cls_range: active.cls_range,
    developing: {
      high: developing.high,
      low: developing.low,
      close: developing.close,
      time: developing.time,
    },
    setup: active.setup,
    model1,
    m1_target_hit: m1TargetHit,
    model2,
    deeper_levels: active.deeper,
    consecutive: consecutiveRun(closed),
    liquidity: liquidityMap(bars, developing.close, {
      lookback: cfg.liquidity_lookback,
      eq_tolerance_ratio: cfg.eq_tolerance_ratio,
    }),
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function compactClsBrief(brief) {
  return {
    success: brief.success,
    generated_at: brief.generated_at,
    rules_loaded_from: brief.rules_loaded_from,
    methodology: brief.methodology,
    compact: true,
    notes: brief.notes,
    symbols_scanned: (brief.symbols_scanned || []).map((scan) => {
      if (scan.error) return scan;
      return {
        symbol: scan.symbol,
        methodology_scope: scan.methodology_scope,
        quote: scan.quote,
        timeframes: scan.timeframes,
        amd: scan.amd?.error
          ? scan.amd
          : {
              execution_timeframe: scan.amd?.execution_timeframe,
              session_bars: scan.amd?.session_bars,
              levels: (scan.amd?.levels || []).filter(
                (level) => level.status !== "NO_SETUP",
              ),
            },
        outlook: scan.outlook
          ? {
              state: scan.outlook.state,
              driver: scan.outlook.driver,
              deadline: scan.outlook.deadline,
            }
          : null,
      };
    }),
    instruction: brief.instruction,
  };
}

export async function runClsBrief({ rules_path, symbols } = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const cfg = { ...CLS_DEFAULTS, ...(rules.cls || {}) };
  const watchlist = symbols?.length
    ? symbols
    : loadWatchlist("cls").watchlist;

  if (!watchlist.length) {
    throw new Error(
      'watchlists.json "cls" is empty. Add at least one symbol.',
    );
  }

  let originalSymbol, originalTimeframe;
  try {
    const currentState = await chart.getState();
    originalSymbol = currentState.symbol;
    originalTimeframe = currentState.resolution;
  } catch (_) {}

  const results = [];

  for (const symbol of watchlist) {
    try {
      await chart.setSymbol({ symbol });
      await sleep(900);

      const timeframes = {};
      for (const tf of cfg.timeframes) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);
        const { bars } = await data.getOhlcv({ count: cfg.bars_to_fetch });
        timeframes[tf] = analyzeTimeframe(bars, cfg);
      }

      // AMD pass: execution-TF bars of the current session (since the
      // developing daily candle opened), developing bar dropped — the
      // detector only reads closed candles.
      let amd = null;
      const amdCfg = { ...CLS_DEFAULTS.amd, ...(cfg.amd || {}) };
      try {
        await chart.setTimeframe({ timeframe: amdCfg.execution_timeframe });
        await sleep(900);
        const { bars: intraday } = await data.getOhlcv({ count: amdCfg.bars_to_fetch });
        const dayStart = timeframes.D?.developing?.time;
        const session = (intraday || [])
          .filter((b) => !dayStart || b.time >= dayStart)
          .slice(0, -1);
        amd = {
          execution_timeframe: amdCfg.execution_timeframe,
          session_bars: session.length,
          levels: amdLevelReads(timeframes, session, { ...cfg, amd: amdCfg }),
        };
      } catch (err) {
        amd = { error: err.message };
      }

      const quote = await data.getQuote({});
      // Morning prospect: is this symbol worth waiting on today?
      const outlook =
        amd && !amd.error
          ? clsOutlook(amd.levels, {
              ...CLS_DEFAULTS.outlook,
              ...(cfg.outlook || {}),
              currentPrice: quote?.last ?? quote?.close,
            })
          : null;
      results.push({
        symbol,
        methodology_scope: /(?:^|:)MGC1!$/i.test(symbol) ? "adapted" : "native",
        quote,
        timeframes,
        amd,
        outlook,
      });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe)
        await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  return {
    success: true,
    generated_at: new Date().toISOString(),
    rules_loaded_from: loadedFrom,
    methodology: "CLS (Candle Liquidity Sweep) — docs/CLS.md",
    config_used: cfg,
    notes: rules.notes || null,
    symbols_scanned: results,
    instruction: [
      "Render a CLS-only morning brief — do NOT mix in FVG/fractal/EMA or any other methodology.",
      "Model: the developing HTF candle sweeps an extreme of the previous candle (the CLS range) = the manipulation. Sweep of the low → LONG toward the middle (mean reversion); sweep of the high → SHORT. The CLS range may merge up to 2 closed candles when a deeper uncovered extreme is swept. M1 target = middle of the CLS range; M2 target = the opposite extreme.",
      "For each symbol output a compact block:",
      "line 1: **SYMBOL @ price** + the OUTLOOK verdict — WAIT (setup armed/forming, stay for the trigger), WATCH (nothing armed but a level is within reach, watch the London open) or SKIP (nothing actionable), with the driver + the decide-by clock (outlook.deadline.decide_by_local, user is Europe/Athens);",
      "line 2: W read — if setup: direction + CLS range (low–high, note if merged across 2 weeks) + M1 target (middle) + invalidation (sweep extreme); if m1_target_hit, add M2 — reload zone (61.8–80%), target = opposite extreme, stop = manipulation extreme, status. If no setup: say the developing week is inside the previous range (no manipulation yet) and name the nearest untaken high/low it would need to sweep;",
      "line 3: D read — same structure;",
      "line 4: deeper levels — any pending untaken extreme (max 2-week lookback) that would ARM a setup only once price reaches it (level + its projected CLS range + M1 target);",
      "line 5: AMD — for each level with status other than NO_SETUP: level_type + kind (active/deeper) @ price (strong=weekly/weak=daily), status, accumulation quality, penetration; for MANIPULATED/CONFIRMED give the M1 plan — entry (CIOD close, or 'await CIOD'), stop = sweep extreme, target = middle, RR; when model2 present, add M2 on a sub-line (zone, opposite-extreme target, stop, RR, confluence). An A-setup = accumulation ok + MANIPULATED/CONFIRMED at a strong (weekly) active level;",
      "line 6: Liquidity — nearest untaken highs/lows and any equal highs/lows per TF;",
      "line 7: Filter — consecutive-candle warnings (3+ same-direction dailies) and W-vs-D conflicts;",
      "line 8: CLS bias — direction + the concrete plan (which level, target = middle, invalidation).",
      "The HTF read is prospective (the candle is still developing) — execution confirmation comes from the AMD line, not from waiting for the HTF close.",
      "M2 is the second, risk-free continuation entry — only once M1 completed (m1_target_hit); never present an M2 plan when m1_target_hit is false.",
      "Order the watchlist by outlook (WAIT first, then WATCH, then SKIP). Lead with the symbols worth waiting on; group all SKIPs into one short line at the end.",
      "End with a one-sentence CLS market read across the watchlist.",
      "Be direct. No preamble.",
    ].join(" "),
  };
}
