/**
 * CLS (Candle Liquidity Sweep) core logic — David Perk's HTF methodology.
 * Rules reference: docs/CLS.md. Pure detection functions are exported for
 * unit testing; runClsBrief() scans the watchlist and returns structured
 * data for Claude to render as a CLS-only morning brief.
 */
import { loadRules } from "./config.js";
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
 * Model 2 reload zone: pullback entry on a continuation leg.
 * Leg runs from legStart to legEnd; the zone sits at 61.8–80% retracement
 * of the leg measured back from legEnd. Direction is inferred from the leg.
 */
export function model2Zone(legStart, legEnd, zone = CLS_DEFAULTS.m2_zone) {
  const size = legEnd - legStart;
  if (size === 0) return null;
  const [near, far] = zone;
  const a = legEnd - size * near;
  const b = legEnd - size * far;
  return {
    direction: size > 0 ? "long" : "short",
    zone_from: size > 0 ? Math.max(a, b) : Math.min(a, b), // edge price touches first
    zone_to: size > 0 ? Math.min(a, b) : Math.max(a, b),
    target: legEnd,
    invalidation: legStart,
  };
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
 * Full CLS read of one timeframe. Assumes the last bar is the developing
 * (unclosed) candle: the signal pair is bars[n-3] (CLS candle) and
 * bars[n-2] (last closed candle); the developing bar is reported as a
 * live read against the last closed candle's range.
 */
export function analyzeTimeframe(bars, cfg = CLS_DEFAULTS) {
  if (!bars || bars.length < 4) {
    return { error: `Not enough bars for CLS analysis (need 4+, got ${bars?.length ?? 0})` };
  }
  const developing = bars[bars.length - 1];
  const signalCandle = bars[bars.length - 2];
  const clsCandle = bars[bars.length - 3];
  const closed = bars.slice(0, -1);

  const cls = classifySignal(clsCandle, signalCandle);
  const m1 = model1Levels(clsCandle, signalCandle, cls.signal, cfg.m1_target_ratio);

  // Model 2 on acceptance: leg from the signal candle's origin extreme to
  // the furthest price printed since (developing bar included).
  let m2 = null;
  if (cls.signal === "ACCEPTANCE_UP") {
    const legEnd = Math.max(signalCandle.high, developing.high);
    m2 = model2Zone(signalCandle.low, legEnd, cfg.m2_zone);
  } else if (cls.signal === "ACCEPTANCE_DOWN") {
    const legEnd = Math.min(signalCandle.low, developing.low);
    m2 = model2Zone(signalCandle.high, legEnd, cfg.m2_zone);
  }

  const live = classifySignal(signalCandle, developing);

  return {
    cls_candle: { high: clsCandle.high, low: clsCandle.low, time: clsCandle.time },
    signal_candle: {
      high: signalCandle.high,
      low: signalCandle.low,
      close: signalCandle.close,
      time: signalCandle.time,
    },
    classification: cls,
    model1: m1,
    model2: m2,
    live: {
      note: "developing candle vs last closed candle range — not confirmed until close",
      ...live,
    },
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

export async function runClsBrief({ rules_path, symbols } = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const cfg = { ...CLS_DEFAULTS, ...(rules.cls || {}) };
  const watchlist = symbols?.length ? symbols : rules.watchlist || [];

  if (!watchlist.length) {
    throw new Error(
      "rules.json watchlist is empty. Add at least one symbol to your watchlist array.",
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

      const quote = await data.getQuote({});
      results.push({ symbol, quote, timeframes });
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
      "For each symbol output a compact block:",
      "line 1: **SYMBOL @ price**;",
      "line 2: W read — classification (sweep/acceptance/inside), armed model with levels (M1: target + invalidation, M2: reload zone + target + invalidation);",
      "line 3: D read — same structure;",
      "line 4: Liquidity — nearest untaken highs/lows and any equal highs/lows per TF;",
      "line 5: Filter — consecutive-candle warnings (3+ same-direction dailies) and W-vs-D conflicts;",
      "line 6: CLS bias — direction + the concrete plan (which model, which zone, invalidation).",
      "Signals marked 'live' come from the developing candle and are NOT confirmed until it closes — label them as developing.",
      "DOUBLE_SWEEP and INSIDE mean no signal: say so plainly rather than inventing a setup.",
      "End with a one-sentence CLS market read across the watchlist.",
      "Be direct. No preamble.",
    ].join(" "),
  };
}
