/**
 * ChrisFX breaker-block core logic.
 * Rules reference: docs/CHRISFX.md. Every threshold that the source PDF leaves
 * qualitative is a config key here and is marked [CALIBRATION] in the docs.
 *
 * Pure detection functions are exported for unit testing; runChrisBrief()
 * scans the watchlist and returns structured data for Claude to render.
 */
import { loadRules, loadWatchlist } from "./config.js";
import * as chart from "./chart.js";
import * as data from "./data.js";

export const CHRIS_DEFAULTS = {
  timeframes: ["5", "15"],
  bars_to_fetch: 300,
  watchlist_section: "chris",

  liquidity: {
    fractal_strength: 1,
    lookback: 60,
    fresh_max_age_bars: 12,
  },
  grab: {
    atr_length: 14,
    impulse_body_atr_mult: 1.3,
    impulse_body_ratio: 0.6,
  },
  reversal: {
    instant_max_bars: 3,
    leg_lookback_bars: 10,
  },
  fvg: {
    require: true,
    min_overlap_ratio: 0.0,
    search_bars_after_grab: 5,
  },
  zone: {
    use_wicks: true,
    max_age_bars: 120,
    extend_bars: 40,
  },
  grading: {
    account_size: 50000,
    risk_per_grade: { "A++": 500, "A+": 300, A: 200, B: 100 },
  },
  poc: {
    indicator_name: "ChrisFX POC",
    lower_tf: "1",
    bins: 24,
    min_delta_ratio: 0.15,
  },
  targets: {
    rr_levels: [2, 3],
    use_opposing_liquidity: true,
  },
};

/** Grade ladder, strongest first. Downgrades walk one step to the right. */
export const GRADES = ["A++", "A+", "A", "B"];

function downgrade(grade, notches = 1) {
  const i = GRADES.indexOf(grade);
  if (i < 0) return grade;
  return GRADES[Math.min(i + notches, GRADES.length - 1)];
}

const isBull = (b) => b.close > b.open;
const isBear = (b) => b.close < b.open;
const bodyOf = (b) => Math.abs(b.close - b.open);
const rangeOf = (b) => b.high - b.low;

/**
 * Wilder-free simple ATR over the `length` bars ending at `idx` (inclusive).
 * Returns null when there is not enough history.
 */
export function atrAt(bars, idx, length = CHRIS_DEFAULTS.grab.atr_length) {
  const start = idx - length + 1;
  if (start < 1) return null;
  let sum = 0;
  for (let i = start; i <= idx; i++) {
    const prev = bars[i - 1];
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev.close),
      Math.abs(bars[i].low - prev.close),
    );
  }
  return sum / length;
}

/**
 * Liquidity points — docs/CHRISFX.md §2.1. A valid low has a low below the
 * `strength` candles on each side; a valid high is the mirror.
 */
export function findLiquidityPoints(bars, strength = 1) {
  const highs = [];
  const lows = [];
  for (let i = strength; i < bars.length - strength; i++) {
    let isLow = true;
    let isHigh = true;
    for (let k = 1; k <= strength; k++) {
      if (!(bars[i].low < bars[i - k].low && bars[i].low < bars[i + k].low)) isLow = false;
      if (!(bars[i].high > bars[i - k].high && bars[i].high > bars[i + k].high)) isHigh = false;
    }
    if (isLow) lows.push({ index: i, price: bars[i].low, time: bars[i].time });
    if (isHigh) highs.push({ index: i, price: bars[i].high, time: bars[i].time });
  }
  return { highs, lows };
}

/**
 * Standard 3-candle fair value gaps — docs/CHRISFX.md §2.5.
 * The gap is indexed by its middle candle.
 */
export function findFvgs(bars) {
  const out = [];
  for (let i = 1; i < bars.length - 1; i++) {
    if (bars[i + 1].low > bars[i - 1].high) {
      out.push({
        index: i,
        direction: "bull",
        low: bars[i - 1].high,
        high: bars[i + 1].low,
        time: bars[i].time,
      });
    }
    if (bars[i + 1].high < bars[i - 1].low) {
      out.push({
        index: i,
        direction: "bear",
        low: bars[i + 1].high,
        high: bars[i - 1].low,
        time: bars[i].time,
      });
    }
  }
  return out;
}

/** Overlap of two price ranges, and that overlap as a share of the FVG height. */
export function zoneFvgOverlap(zone, fvg) {
  const overlap = Math.min(zone.high, fvg.high) - Math.max(zone.low, fvg.low);
  if (overlap <= 0) return { overlap: 0, ratio: 0 };
  const height = fvg.high - fvg.low;
  return { overlap, ratio: height > 0 ? overlap / height : 0 };
}

/**
 * Classify a liquidity grab — docs/CHRISFX.md §2.2 / §3 characteristic 1.
 * `side` is "low" (sell-side liquidity taken → bullish setup) or "high".
 */
export function classifyGrab(bar, level, side, atr, cfg = CHRIS_DEFAULTS.grab) {
  const beyond = side === "low" ? bar.low < level : bar.high > level;
  if (!beyond) return null;

  const bodyClosedBeyond = side === "low" ? bar.close < level : bar.close > level;
  const body = bodyOf(bar);
  const range = rangeOf(bar);
  const bodyRatio = range > 0 ? body / range : 0;
  const atrMult = atr ? body / atr : null;
  const impulsive =
    bodyRatio >= cfg.impulse_body_ratio &&
    (atrMult === null || atrMult >= cfg.impulse_body_atr_mult);

  return {
    type: bodyClosedBeyond ? "body" : "wick",
    impulsive: bodyClosedBeyond ? impulsive : false,
    body_ratio: round(bodyRatio, 3),
    atr_mult: atrMult === null ? null : round(atrMult, 2),
  };
}

/**
 * The breaker candle — docs/CHRISFX.md §2.3. Walking back from the grab, the
 * most recent candle of the opposite colour to the grabbing move.
 * Bullish setup (side "low") → the most recent bullish candle before the
 * down-move. Returns the bar index or null.
 */
export function findBreakerIndex(bars, grabIdx, side, maxLookback = 20) {
  const wantBull = side === "low";
  const stop = Math.max(0, grabIdx - maxLookback);
  for (let i = grabIdx - 1; i >= stop; i--) {
    if (wantBull ? isBull(bars[i]) : isBear(bars[i])) return i;
  }
  return null;
}

/**
 * Characteristic 2 — docs/CHRISFX.md §3. Is the breaker candle the extreme of
 * the leg that ran into the grab? Bullish breaker → highest high before the
 * down-move; bearish breaker → lowest low before the up-move.
 */
export function isLegExtreme(bars, breakerIdx, grabIdx, side, legLookback = 10) {
  const start = Math.max(0, grabIdx - legLookback);
  if (breakerIdx < start) return false;
  for (let i = start; i < grabIdx; i++) {
    if (i === breakerIdx) continue;
    if (side === "low" && bars[i].high > bars[breakerIdx].high) return false;
    if (side === "high" && bars[i].low < bars[breakerIdx].low) return false;
  }
  return true;
}

/**
 * Grade a setup — docs/CHRISFX.md §3.
 * Body grab → A++/A+ split on characteristic 2, with a one-notch downgrade for
 * a non-impulsive grab or a reversal that was not immediate.
 * Wick grab → A/B split on how long the level had existed.
 */
export function gradeSetup({ grab, legExtreme, reversalBars, levelAge }, cfg = CHRIS_DEFAULTS) {
  const modifiers = [];
  let grade;

  if (grab.type === "body") {
    grade = legExtreme ? "A++" : "A+";
    if (!grab.impulsive) modifiers.push("non_impulsive_grab");
    if (reversalBars === null || reversalBars > cfg.reversal.instant_max_bars) {
      modifiers.push("delayed_reversal");
    }
    // A and B are wick-grab classes by definition, so a body grab is clamped at
    // A+ no matter how many modifiers fire (docs/CHRISFX.md §3.1).
    if (modifiers.length && grade === "A++") grade = downgrade(grade, 1);
  } else {
    grade = levelAge <= cfg.liquidity.fresh_max_age_bars ? "A" : "B";
  }

  return {
    grade,
    modifiers,
    characteristic_1: grab.type === "body" ? "body_close_beyond" : "wick_only",
    characteristic_2: grab.type === "body" ? legExtreme : null,
    risk_suggestion: cfg.grading.risk_per_grade?.[grade] ?? null,
  };
}

function round(n, dp = 5) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Nearest untaken liquidity on the far side of the trade — our structural
 * target (docs/CHRISFX.md §4.3, [CALIBRATION], not in the source).
 */
function opposingLiquidity(bars, points, fromIdx, direction) {
  const price = bars[bars.length - 1].close;
  const pool = direction === "long" ? points.highs : points.lows;
  const candidates = pool
    .filter((p) => p.index >= fromIdx)
    .filter((p) => (direction === "long" ? p.price > price : p.price < price))
    // still untaken: no later bar traded through it
    .filter((p) =>
      bars
        .slice(p.index + 1)
        .every((b) => (direction === "long" ? b.high <= p.price : b.low >= p.price)),
    );
  if (!candidates.length) return null;
  const best =
    direction === "long"
      ? candidates.reduce((a, b) => (b.price < a.price ? b : a))
      : candidates.reduce((a, b) => (b.price > a.price ? b : a));
  return { price: round(best.price), index: best.index, time: best.time };
}

/**
 * Full detection pass over one timeframe's bars, oldest → newest.
 * The last bar is treated as developing and is never used as a grab or breaker.
 */
export function detectBreakers(bars, cfg = CHRIS_DEFAULTS) {
  if (!Array.isArray(bars) || bars.length < 20) return [];

  const closed = bars.slice(0, -1);
  const last = bars[bars.length - 1];
  const points = findLiquidityPoints(closed, cfg.liquidity.fractal_strength);
  const fvgs = findFvgs(closed);
  const setups = [];
  const scanFrom = Math.max(0, closed.length - cfg.liquidity.lookback);

  for (const side of ["low", "high"]) {
    const pool = side === "low" ? points.lows : points.highs;
    for (const point of pool) {
      if (point.index < scanFrom) continue;

      // first bar that trades through the level = the grab
      let grabIdx = null;
      for (let i = point.index + 1; i < closed.length; i++) {
        const through = side === "low" ? closed[i].low < point.price : closed[i].high > point.price;
        if (through) {
          grabIdx = i;
          break;
        }
      }
      if (grabIdx === null) continue;

      const grab = classifyGrab(
        closed[grabIdx],
        point.price,
        side,
        atrAt(closed, grabIdx, cfg.grab.atr_length),
        cfg.grab,
      );
      if (!grab) continue;

      const breakerIdx = findBreakerIndex(closed, grabIdx, side, cfg.reversal.leg_lookback_bars * 2);
      if (breakerIdx === null) continue;

      const zoneAge = closed.length - 1 - breakerIdx;
      if (zoneAge > cfg.zone.max_age_bars) continue;

      const breaker = closed[breakerIdx];
      const zone = cfg.zone.use_wicks
        ? { high: breaker.high, low: breaker.low }
        : { high: Math.max(breaker.open, breaker.close), low: Math.min(breaker.open, breaker.close) };

      const direction = side === "low" ? "long" : "short";

      // reversal: first close back on the correct side of the swept level
      let reversalIdx = null;
      for (let i = grabIdx + 1; i < closed.length; i++) {
        const back = side === "low" ? closed[i].close > point.price : closed[i].close < point.price;
        if (back) {
          reversalIdx = i;
          break;
        }
      }
      const reversalBars = reversalIdx === null ? null : reversalIdx - grabIdx;

      // point of invalidation: the extreme reached during the grab
      const invEnd = reversalIdx === null ? closed.length - 1 : reversalIdx;
      let invalidation = closed[grabIdx][side === "low" ? "low" : "high"];
      for (let i = grabIdx; i <= invEnd; i++) {
        invalidation =
          side === "low"
            ? Math.min(invalidation, closed[i].low)
            : Math.max(invalidation, closed[i].high);
      }

      // FVG confluence gate
      const wantDir = side === "low" ? "bull" : "bear";
      let fvg = null;
      for (const g of fvgs) {
        if (g.direction !== wantDir) continue;
        if (g.index < grabIdx - 1 || g.index > grabIdx + cfg.fvg.search_bars_after_grab) continue;
        const ov = zoneFvgOverlap(zone, g);
        if (ov.overlap <= 0 || ov.ratio < cfg.fvg.min_overlap_ratio) continue;
        if (!fvg || ov.ratio > fvg.overlap_ratio) {
          fvg = { ...g, low: round(g.low), high: round(g.high), overlap_ratio: round(ov.ratio, 3) };
        }
      }
      if (cfg.fvg.require && !fvg) continue;

      const levelAge = grabIdx - point.index;
      const grading = gradeSetup({ grab, legExtreme: isLegExtreme(closed, breakerIdx, grabIdx, side, cfg.reversal.leg_lookback_bars), reversalBars, levelAge }, cfg);

      // status of the zone relative to price action after the reversal
      const after = closed.slice(invEnd + 1);
      const tested = after.some((b) => b.low <= zone.high && b.high >= zone.low);
      const blown =
        after.some((b) => (direction === "long" ? b.close < invalidation : b.close > invalidation)) ||
        (direction === "long" ? last.close < invalidation : last.close > invalidation);
      const inZoneNow = last.low <= zone.high && last.high >= zone.low;

      let status = "PENDING";
      if (blown) status = "INVALIDATED";
      else if (inZoneNow) status = "ACTIVE";
      else if (tested) status = "TESTED";

      const stops = {
        beyond_zone: round(direction === "long" ? zone.low : zone.high),
        beyond_invalidation: round(invalidation),
        beyond_poc: null, // filled from the Pine POC pass when available
      };
      const entryRef = direction === "long" ? zone.high : zone.low;
      const risk = Math.abs(entryRef - stops.beyond_zone);
      const rr = {};
      for (const r of cfg.targets.rr_levels) {
        rr[`${r}R`] = round(direction === "long" ? entryRef + risk * r : entryRef - risk * r);
      }

      setups.push({
        direction,
        grade: grading.grade,
        grade_modifiers: grading.modifiers,
        characteristic_1: grading.characteristic_1,
        characteristic_2: grading.characteristic_2,
        risk_suggestion_usd: grading.risk_suggestion,
        status,
        liquidity: {
          level: round(point.price),
          formed_at: point.time,
          age_bars_before_grab: levelAge,
          freshness: levelAge <= cfg.liquidity.fresh_max_age_bars ? "fresh" : "aged",
        },
        grab: {
          ...grab,
          time: closed[grabIdx].time,
          bars_ago: closed.length - 1 - grabIdx,
        },
        reversal_bars: reversalBars,
        breaker: {
          time: breaker.time,
          bars_ago: zoneAge,
          zone_high: round(zone.high),
          zone_low: round(zone.low),
          zone_mid: round((zone.high + zone.low) / 2),
        },
        fvg,
        invalidation: round(invalidation),
        entries: {
          zone_edge: round(entryRef),
          zone_mid: round((zone.high + zone.low) / 2),
          zone_far: round(direction === "long" ? zone.low : zone.high),
          poc: null, // filled from the Pine POC pass when available
        },
        stops,
        targets: {
          rr,
          opposing_liquidity: cfg.targets.use_opposing_liquidity
            ? opposingLiquidity(closed, points, breakerIdx, direction)
            : null,
        },
        _sort: { grade: GRADES.indexOf(grading.grade), recency: zoneAge },
      });
    }
  }

  // Deduplicate: one setup per breaker candle + direction, keeping the best grade.
  const byKey = new Map();
  for (const s of setups) {
    const key = `${s.direction}:${s.breaker.time}`;
    const prev = byKey.get(key);
    if (!prev || s._sort.grade < prev._sort.grade) byKey.set(key, s);
  }

  return [...byKey.values()]
    .sort((a, b) => a._sort.grade - b._sort.grade || a._sort.recency - b._sort.recency)
    .map(({ _sort, ...s }) => s);
}

/** One timeframe's read: setups plus the liquidity map around current price. */
export function analyzeTimeframe(bars, cfg = CHRIS_DEFAULTS) {
  if (!Array.isArray(bars) || bars.length < 20) {
    return { error: "not enough bars", bars: bars?.length ?? 0 };
  }
  const closed = bars.slice(0, -1);
  const price = bars[bars.length - 1].close;
  const points = findLiquidityPoints(closed, cfg.liquidity.fractal_strength);

  const untaken = (pool, side) =>
    pool
      .filter((p) =>
        closed
          .slice(p.index + 1)
          .every((b) => (side === "high" ? b.high <= p.price : b.low >= p.price)),
      )
      .map((p) => ({ price: round(p.price), time: p.time, bars_ago: closed.length - 1 - p.index }));

  const setups = detectBreakers(bars, cfg);

  return {
    bars_analyzed: closed.length,
    last_price: round(price),
    setups,
    active_setups: setups.filter((s) => s.status === "ACTIVE" || s.status === "PENDING").length,
    liquidity: {
      untaken_highs: untaken(points.highs, "high").slice(-4),
      untaken_lows: untaken(points.lows, "low").slice(-4),
    },
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeConfig(rules) {
  const c = rules.chris || {};
  const out = { ...CHRIS_DEFAULTS, ...c };
  for (const key of ["liquidity", "grab", "reversal", "fvg", "zone", "grading", "poc", "targets"]) {
    out[key] = { ...CHRIS_DEFAULTS[key], ...(c[key] || {}) };
  }
  return out;
}

/**
 * Read the POC boxes published by scripts/chrisfx_poc.pine, if the indicator
 * is on the chart, and attach the ones that fall inside each breaker zone.
 * Silently no-ops when the indicator is absent — POC is a refinement, never a
 * requirement (docs/CHRISFX.md §4.1).
 */
export async function attachPocLevels(setups, cfg = CHRIS_DEFAULTS) {
  if (!setups.length) return { attached: 0, source: null };
  let boxes = [];
  try {
    const res = await data.getPineBoxes({ study_filter: cfg.poc.indicator_name });
    boxes = res?.boxes || res || [];
  } catch {
    return { attached: 0, source: null, note: "POC indicator not on chart — zone-edge entries only" };
  }
  if (!Array.isArray(boxes) || !boxes.length) {
    return { attached: 0, source: null, note: "POC indicator not on chart — zone-edge entries only" };
  }

  let attached = 0;
  for (const s of setups) {
    const inside = boxes
      .map((b) => ({ high: Number(b.high ?? b.top), low: Number(b.low ?? b.bottom) }))
      .filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low))
      .filter((b) => b.low >= s.breaker.zone_low && b.high <= s.breaker.zone_high);
    if (!inside.length) continue;

    const highest = inside.reduce((a, b) => (b.high > a.high ? b : a));
    const lowest = inside.reduce((a, b) => (b.low < a.low ? b : a));
    // Long: enter from the highest POC. Short: from the lowest. (slides 22, 41)
    s.entries.poc = round(s.direction === "long" ? highest.high : lowest.low);
    s.stops.beyond_poc = round(s.direction === "long" ? lowest.low : highest.high);
    s.poc_zones = inside.map((b) => ({ high: round(b.high), low: round(b.low) }));
    attached++;
  }
  return { attached, source: cfg.poc.indicator_name, approximation: true };
}

export async function runChrisBrief({ rules_path, symbols, timeframes } = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const cfg = mergeConfig(rules);
  const tfs = timeframes?.length ? timeframes : cfg.timeframes;
  const watchlist = symbols?.length
    ? symbols
    : loadWatchlist(cfg.watchlist_section).watchlist;

  if (!watchlist.length) {
    throw new Error(`watchlists.json "${cfg.watchlist_section}" is empty. Add at least one symbol.`);
  }

  let originalSymbol, originalTimeframe;
  try {
    const state = await chart.getState();
    originalSymbol = state.symbol;
    originalTimeframe = state.resolution;
  } catch (_) {}

  const results = [];
  for (const symbol of watchlist) {
    try {
      await chart.setSymbol({ symbol });
      await sleep(900);

      const perTf = {};
      let poc = null;
      for (const tf of tfs) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);
        const { bars } = await data.getOhlcv({ count: cfg.bars_to_fetch });
        const read = analyzeTimeframe(bars, cfg);
        const attached = await attachPocLevels(read.setups || [], cfg);
        if (attached.attached || !poc) poc = attached;
        perTf[tf] = read;
      }

      const quote = await data.getQuote({});
      results.push({ symbol, quote, timeframes: perTf, poc });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe) await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  return {
    success: true,
    generated_at: new Date().toISOString(),
    rules_loaded_from: loadedFrom,
    methodology: "ChrisFX breaker blocks — docs/CHRISFX.md",
    config_used: cfg,
    notes: rules.notes || null,
    symbols_scanned: results,
    instruction: [
      "Render a ChrisFX-only breaker-block report — do NOT mix in CLS, EMAs, RSI or any other methodology.",
      "Grade drives everything: A++ (body grab + breaker is the leg extreme) > A+ (body grab, breaker not the extreme, or downgraded for a non-impulsive grab / delayed reversal) > A (wick grab of a fresh level) > B (wick grab of an aged level). Report the grade first, then why it earned it (characteristic_1 / characteristic_2 / grade_modifiers).",
      "For each symbol output a compact block: line 1 **SYMBOL @ price** + best grade and direction across timeframes, or 'no valid breaker'; line 2 per timeframe: grade · direction · zone low–high · status (PENDING/ACTIVE/TESTED/INVALIDATED) · FVG overlap; line 3 execution: entry (POC when present, else zone edge), all three stop variants (POC / zone / invalidation), targets; line 4 liquidity: nearest untaken highs and lows.",
      "State the suggested risk from risk_suggestion_usd as the author's own scale on a 50k prop account (A++ $500 / A+ $300 / A $200 / B $100), not as advice.",
      "When entries.poc is null, say the footprint step was not applied and the entry is the zone edge. When it is present, say the POC is a lower-timeframe volume approximation, NOT exchange bid/ask footprint.",
      "Targets are OUR addition — the source defines no exits. Label them as such every time.",
      "Skip INVALIDATED setups unless nothing else is present. Lead with the highest grade.",
      "Be direct. No preamble.",
    ].join(" "),
  };
}

/** Report-ready payload: drops config echo and per-bar detail. */
export function compactChrisBrief(brief) {
  return {
    generated_at: brief.generated_at,
    methodology: brief.methodology,
    symbols: (brief.symbols_scanned || []).map((s) => {
      if (s.error) return { symbol: s.symbol, error: s.error };
      const tfs = {};
      for (const [tf, read] of Object.entries(s.timeframes || {})) {
        tfs[tf] = {
          last_price: read.last_price,
          setups: (read.setups || []).slice(0, 3).map((x) => ({
            grade: x.grade,
            direction: x.direction,
            status: x.status,
            modifiers: x.grade_modifiers,
            zone: [x.breaker.zone_low, x.breaker.zone_high],
            fvg_overlap: x.fvg?.overlap_ratio ?? null,
            entry: x.entries.poc ?? x.entries.zone_edge,
            entry_source: x.entries.poc ? "poc" : "zone_edge",
            stops: x.stops,
            targets: x.targets,
            risk_usd: x.risk_suggestion_usd,
          })),
          liquidity: read.liquidity,
        };
      }
      return { symbol: s.symbol, price: s.quote?.last ?? s.quote?.close ?? null, timeframes: tfs, poc: s.poc };
    }),
    instruction: brief.instruction,
  };
}
