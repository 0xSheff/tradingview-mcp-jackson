/**
 * Marco Accettone (Inter Equity Trading) — liquidity-block engine.
 *
 * Methodology source of truth: docs/MARCO.md. The bar-replay state machine
 * below mirrors scripts/marco_liquidity_blocks.pine — when tuning a default,
 * change both files. Pure functions first (testable without TradingView),
 * chart-driving brief at the bottom (same shape the chris/CLS branches use).
 */
import * as chart from "./chart.js";
import * as data from "./data.js";
import { loadRules, loadWatchlist } from "./config.js";

export const MARCO_DEFAULTS = {
  timeframes: ["15", "60"],
  bars_to_fetch: 400,
  watchlist_section: "marco",

  // detection — every number is a [CALIBRATION] (docs/MARCO.md §6)
  pivot_len: 3, // swing = strictly lowest/highest of N bars each side
  confirm_bars: 3, // sweep must reclaim the swept level within N bars
  atr_length: 14,
  eq_tolerance_atr: 0.25, // "equal" levels merge within this ATR fraction
  min_touches: 2, // touches that make a level "build-up"
  min_level_age: 50, // ...or age that qualifies a swept level anyway
  max_levels: 20, // intact levels tracked per side
  zone_max_age: 300, // LB zone lifetime in bars
  story_lookback: 60, // how far back the narrative looks for the last run

  // findings of the 09:55 experiment (docs/MARCO.md §7.1) — all [CALIBRATION]
  min_zone_atr: 0.25, // thinner zones are flagged `thin`: not entry-grade
  stop_buffer_atr: 0.1, // reported stop sits this far past the extreme
  story_fresh_bars: 16, // a trap older than this reads as stale

  // the 10 a.m. reversal model, docs/MARCO.md §4.3 [SOURCE V5]
  h4: {
    exchange_tz: "America/New_York",
    candle_open_hour: 6, // the 06:00–10:00 ET H4 candle
    candle_close_hour: 10,
    active_until_hour: 14, // entry window after 10:00 [CALIBRATION]
  },

  // second pass on a higher timeframe: long-lived zones the LTF window
  // cannot see (docs/MARCO.md §7.1 — the V3 lesson). Set to null to disable.
  htf: {
    timeframe: "240",
    bars_to_fetch: 400,
    proximity_atr: 1.5, // "near" = within this many HTF ATRs of a zone edge
  },
};

function round(n) {
  // significant digits, not fixed decimals — 6J trades at 0.0063x while MNQ
  // trades at 30000+, and both must survive the trip through a report
  if (!Number.isFinite(n)) return n;
  return Number(n.toPrecision(7));
}

/** Wilder RMA of true range, null until warm. Matches Pine ta.atr. */
export function atrSeries(bars, length = MARCO_DEFAULTS.atr_length) {
  const atr = new Array(bars.length).fill(null);
  let sum = 0;
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const pc = i > 0 ? bars[i - 1].close : null;
    const tr =
      pc === null
        ? b.high - b.low
        : Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    if (i < length) {
      sum += tr;
      if (i === length - 1) {
        prev = sum / length;
        atr[i] = prev;
      }
    } else {
      prev = (prev * (length - 1) + tr) / length;
      atr[i] = prev;
    }
  }
  return atr;
}

function insideZone(blocks, side, price) {
  return blocks.some(
    (blk) => !blk.dead && blk.side === side && price <= blk.top && price >= blk.bot,
  );
}

function registerLevel(lvls, side, born, price, atrNow, cfg, events, bar) {
  const tol = (atrNow ?? 0) * cfg.eq_tolerance_atr;
  for (const lv of lvls) {
    if (Math.abs(lv.price - price) <= tol) {
      lv.touches += 1;
      // liquidity rests beyond the furthest of the "equal" extremes
      lv.price = side === "low" ? Math.min(lv.price, price) : Math.max(lv.price, price);
      lv.lastTouch = born;
      if (lv.touches === cfg.min_touches) {
        events.push({ bar, type: `${side}_buildup`, level: lv.price, touches: lv.touches });
      }
      return;
    }
  }
  lvls.push({ price, born, touches: 1, lastTouch: born });
  if (lvls.length > cfg.max_levels) lvls.shift();
}

/**
 * Replay the bars through the same state machine the Pine indicator runs:
 * intact levels → sweeps → pending reclaim → LB zones with qualification.
 * Returns { levels: {lows, highs}, blocks, events } — events are the
 * chronological narrative (sweeps, build-ups, LB creation, taps, breakdowns).
 */
export function buildLiquidityMap(bars, cfg = MARCO_DEFAULTS) {
  const p = cfg.pivot_len;
  const atr = atrSeries(bars, cfg.atr_length);
  const lowLvls = [];
  const highLvls = [];
  const blocks = [];
  const events = [];
  let pendBull = null;
  let pendBear = null;

  const isPivot = (j, side) => {
    for (let k = j - p; k <= j + p; k++) {
      if (k === j) continue;
      if (k < 0 || k >= bars.length) return false;
      if (side === "low" ? bars[k].low <= bars[j].low : bars[k].high >= bars[j].high)
        return false;
    }
    return true;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];

    // 1. maintain LB zones: invalidation, expiry, first tap
    for (const blk of blocks) {
      if (blk.dead) continue;
      const invalid = blk.side === "bull" ? b.close < blk.bot : b.close > blk.top;
      const expired = i - blk.born > cfg.zone_max_age;
      if (invalid || expired) {
        blk.dead = true;
        blk.died = i;
        blk.death = invalid ? "invalidated" : "expired";
        if (invalid) {
          events.push({ bar: i, type: `${blk.side}_lb_invalidated`, zone: [blk.bot, blk.top] });
        }
        continue;
      }
      if (i > blk.born && !blk.tapped) {
        const hit = blk.side === "bull" ? b.low <= blk.top : b.high >= blk.bot;
        if (hit) {
          blk.tapped = true;
          blk.tappedAt = i;
          events.push({
            bar: i,
            type: `${blk.side}_lb_tap`,
            zone: [blk.bot, blk.top],
            qualified: blk.qualified,
          });
        }
      }
    }

    // 2. sweep scan — a trade beyond an intact level consumes it
    for (let k = lowLvls.length - 1; k >= 0; k--) {
      const lv = lowLvls[k];
      if (b.low < lv.price) {
        if (!pendBull) {
          pendBull = { lvl: lv.price, touches: lv.touches, age: i - lv.born, ext: b.low, extBar: i, miss: 0 };
        } else {
          pendBull.lvl = Math.min(pendBull.lvl, lv.price);
          pendBull.touches = Math.max(pendBull.touches, lv.touches);
          pendBull.age = Math.max(pendBull.age, i - lv.born);
        }
        events.push({ bar: i, type: "low_swept", level: lv.price, touches: lv.touches });
        lowLvls.splice(k, 1);
      }
    }
    for (let k = highLvls.length - 1; k >= 0; k--) {
      const lv = highLvls[k];
      if (b.high > lv.price) {
        if (!pendBear) {
          pendBear = { lvl: lv.price, touches: lv.touches, age: i - lv.born, ext: b.high, extBar: i, miss: 0 };
        } else {
          pendBear.lvl = Math.max(pendBear.lvl, lv.price);
          pendBear.touches = Math.max(pendBear.touches, lv.touches);
          pendBear.age = Math.max(pendBear.age, i - lv.born);
        }
        events.push({ bar: i, type: "high_swept", level: lv.price, touches: lv.touches });
        highLvls.splice(k, 1);
      }
    }

    // 3. pending sweeps: reclaim → LB; no reclaim in time → breakdown
    if (pendBull) {
      if (b.low < pendBull.ext) {
        pendBull.ext = b.low;
        pendBull.extBar = i;
      }
      if (b.close > pendBull.lvl) {
        const qualified =
          pendBull.touches >= cfg.min_touches || pendBull.age >= cfg.min_level_age;
        const thin = atr[i] ? pendBull.lvl - pendBull.ext < cfg.min_zone_atr * atr[i] : false;
        blocks.push({
          side: "bull",
          top: pendBull.lvl,
          bot: pendBull.ext,
          born: i,
          extBar: pendBull.extBar,
          sweptTouches: pendBull.touches,
          sweptAge: pendBull.age,
          qualified,
          thin,
          tapped: false,
          dead: false,
        });
        events.push({ bar: i, type: "bull_lb_created", zone: [pendBull.ext, pendBull.lvl], qualified });
        pendBull = null;
      } else if (++pendBull.miss > cfg.confirm_bars) {
        events.push({ bar: i, type: "low_breakdown", level: pendBull.lvl });
        pendBull = null;
      }
    }
    if (pendBear) {
      if (b.high > pendBear.ext) {
        pendBear.ext = b.high;
        pendBear.extBar = i;
      }
      if (b.close < pendBear.lvl) {
        const qualified =
          pendBear.touches >= cfg.min_touches || pendBear.age >= cfg.min_level_age;
        const thin = atr[i] ? pendBear.ext - pendBear.lvl < cfg.min_zone_atr * atr[i] : false;
        blocks.push({
          side: "bear",
          top: pendBear.ext,
          bot: pendBear.lvl,
          born: i,
          extBar: pendBear.extBar,
          sweptTouches: pendBear.touches,
          sweptAge: pendBear.age,
          qualified,
          thin,
          tapped: false,
          dead: false,
        });
        events.push({ bar: i, type: "bear_lb_created", zone: [pendBear.lvl, pendBear.ext], qualified });
        pendBear = null;
      } else if (++pendBear.miss > cfg.confirm_bars) {
        events.push({ bar: i, type: "high_breakdown", level: pendBear.lvl });
        pendBear = null;
      }
    }

    // 4. register the pivot confirmed at this bar (if any) as a new level.
    // The sweep extreme itself holds no liquidity (docs/MARCO.md §2.3):
    // skip pivots born during an unresolved sweep or inside a live zone.
    const j = i - p;
    if (j >= p) {
      if (!pendBull && isPivot(j, "low") && !insideZone(blocks, "bull", bars[j].low)) {
        registerLevel(lowLvls, "low", j, bars[j].low, atr[i], cfg, events, i);
      }
      if (!pendBear && isPivot(j, "high") && !insideZone(blocks, "bear", bars[j].high)) {
        registerLevel(highLvls, "high", j, bars[j].high, atr[i], cfg, events, i);
      }
    }
  }

  return { levels: { lows: lowLvls, highs: highLvls }, blocks, events };
}

/**
 * The narrative read (docs/MARCO.md §3): where the liquidity sits, which side
 * was run last, and what that means. This is the "liquidity first, LB second"
 * priority rule — the LB zones only matter inside this story.
 */
export function storyRead(map, bars, cfg = MARCO_DEFAULTS) {
  const n = bars.length;
  const price = bars[n - 1].close;
  const lvl = (l) => ({
    price: round(l.price),
    touches: l.touches,
    buildup: l.touches >= cfg.min_touches,
    bars_ago: n - 1 - l.born,
  });
  const above = map.levels.highs
    .filter((l) => l.price > price)
    .sort((a, b) => a.price - b.price)
    .map(lvl);
  const below = map.levels.lows
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price)
    .map(lvl);

  const recent = map.events.filter((e) => n - 1 - e.bar <= cfg.story_lookback);
  const lastOf = (...types) => [...recent].reverse().find((e) => types.includes(e.type)) ?? null;
  const lastLb = lastOf("bull_lb_created", "bear_lb_created");
  const lastBreak = lastOf("low_breakdown", "high_breakdown");
  const ago = (bar) => {
    const b = n - 1 - bar;
    return b === 1 ? "1 bar ago" : `${b} bars ago`;
  };

  let mode;
  let read;
  const lbBlock = lastLb
    ? map.blocks.find((b) => b.born === lastLb.bar && lastLb.type.startsWith(b.side))
    : null;
  if (lastLb && lbBlock?.dead && lbBlock.death === "invalidated" && (!lastBreak || lastBreak.bar < lastLb.bar)) {
    const bull = lastLb.type === "bull_lb_created";
    mode = bull ? "down_continuation" : "up_continuation";
    read =
      `${bull ? "lows" : "highs"} were run and briefly reclaimed, but the ` +
      `${bull ? "bullish" : "bearish"} LB ${round(lastLb.zone[0])}–${round(lastLb.zone[1])} ` +
      `was invalidated ${ago(lbBlock.died)} — the trap failed; treat as continuation ` +
      `and wait for the next story to build`;
  } else if (lastLb && (!lastBreak || lastBreak.bar < lastLb.bar)) {
    if (lastLb.type === "bear_lb_created") {
      mode = "sell_story";
      read =
        `highs were run and reclaimed ${ago(lastLb.bar)} (trap) — ` +
        `look for shorts at the bearish LB ${round(lastLb.zone[0])}–${round(lastLb.zone[1])}` +
        (below.length
          ? `; targets: intact lows ${below.slice(0, 3).map((l) => l.price).join(", ")}`
          : "; warning: no intact lows left to target");
    } else {
      mode = "buy_story";
      read =
        `lows were run and reclaimed ${ago(lastLb.bar)} (trap) — ` +
        `look for longs at the bullish LB ${round(lastLb.zone[0])}–${round(lastLb.zone[1])}` +
        (above.length
          ? `; targets: intact highs ${above.slice(0, 3).map((l) => l.price).join(", ")}`
          : "; warning: no intact highs left to target");
    }
  } else if (lastBreak) {
    mode = lastBreak.type === "low_breakdown" ? "down_continuation" : "up_continuation";
    read =
      `${lastBreak.type === "low_breakdown" ? "lows" : "highs"} were consumed ` +
      `${ago(lastBreak.bar)} without a reclaim — continuation, no trap; ` +
      `wait for the next story to build`;
  } else {
    mode = "no_mans_land";
    const lo = below[0]?.price ?? null;
    const hi = above[0]?.price ?? null;
    read =
      lo !== null && hi !== null
        ? `build-up phase between ${lo} and ${hi} — no-man's land, wait for one side to be run`
        : "no recent runs and a one-sided map — wait for levels to build";
  }

  // experiment findings (docs/MARCO.md §7.1): stale traps, thin zones and
  // already-spent taps all downgrade an otherwise clean story line
  let fresh = null;
  if (mode === "sell_story" || mode === "buy_story") {
    const age = n - 1 - lastLb.bar;
    fresh = age <= cfg.story_fresh_bars;
    const notes = [];
    if (!fresh) notes.push(`stale — the trap is ${age} bars old`);
    if (lbBlock?.thin) notes.push("zone too thin to hold a stop — refine the entry on a lower TF");
    if (lbBlock?.tapped) notes.push("LB already tapped once");
    if (notes.length) read += ` [${notes.join("; ")}]`;
  }

  return {
    price: round(price),
    mode,
    fresh,
    read,
    nearest: { high: above[0] ?? null, low: below[0] ?? null },
    intact_above: above.slice(0, 6),
    intact_below: below.slice(0, 6),
  };
}

function tzParts(unixSec, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(unixSec * 1000)).map((x) => [x.type, x.value]),
  );
  return {
    key: `${parts.year}-${parts.month}-${parts.day}`,
    h: Number(parts.hour),
    mi: Number(parts.minute),
  };
}

/**
 * The 10 a.m. reversal gate (docs/MARCO.md §4.3, [SOURCE V5]): previous
 * 06:00–10:00 ET H4 candle high/low; after 10:00, a trade beyond one of them
 * activates entries back the other way. Needs intraday bars (≤ 60m).
 */
export function h4Model(bars, cfg = MARCO_DEFAULTS) {
  const c = cfg.h4;
  if (!Array.isArray(bars) || bars.length < 3) return { available: false, note: "no bars" };

  let step = Infinity;
  for (let i = 1; i < Math.min(bars.length, 30); i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0) step = Math.min(step, d);
  }
  if (!Number.isFinite(step) || step > 3600) {
    return { available: false, note: "needs intraday bars (<= 60m)" };
  }

  const windows = [];
  let win = null;
  for (let i = 0; i < bars.length; i++) {
    const t = tzParts(bars[i].time, c.exchange_tz);
    if (t.h >= c.candle_open_hour && t.h < c.candle_close_hour) {
      if (!win || win.key !== t.key) {
        win = { key: t.key, high: -Infinity, low: Infinity, lastIdx: i };
        windows.push(win);
      }
      win.high = Math.max(win.high, bars[i].high);
      win.low = Math.min(win.low, bars[i].low);
      win.lastIdx = i;
    }
  }
  if (!windows.length) {
    return { available: false, note: "no 06:00–10:00 ET bars in the fetched range" };
  }

  const w = windows[windows.length - 1];
  const base = { available: true, h4_date: w.key, h4_high: round(w.high), h4_low: round(w.low) };

  if (w.lastIdx === bars.length - 1) {
    return { ...base, phase: "forming", note: "06:00–10:00 ET candle still forming — wait for 10:00" };
  }

  let sweptLowAt = null;
  let sweptHighAt = null;
  for (let i = w.lastIdx + 1; i < bars.length; i++) {
    const t = tzParts(bars[i].time, c.exchange_tz);
    if (t.key !== w.key || t.h >= c.active_until_hour) break;
    if (sweptLowAt === null && bars[i].low < w.low) sweptLowAt = i;
    if (sweptHighAt === null && bars[i].high > w.high) sweptHighAt = i;
  }

  const lastT = tzParts(bars[bars.length - 1].time, c.exchange_tz);
  const inWindow =
    lastT.key === w.key && lastT.h >= c.candle_close_hour && lastT.h < c.active_until_hour;

  return {
    ...base,
    phase: inWindow ? "active" : "closed",
    longs:
      sweptLowAt !== null
        ? "ACTIVE — prev H4 low taken; look for a bullish LB entry, systematic target = prev H4 high"
        : "waiting — need a trade below prev H4 low first",
    shorts:
      sweptHighAt !== null
        ? "ACTIVE — prev H4 high taken; look for a bearish LB entry, systematic target = prev H4 low"
        : "waiting — need a trade above prev H4 high first",
    note: inWindow
      ? "inside the 10:00–14:00 ET entry window"
      : "outside the 10:00–14:00 ET entry window — informational only",
  };
}

/**
 * Higher-timeframe context for an LTF read: alive HTF zones with distance to
 * price, the nearest intact HTF levels, and an alert when price is inside or
 * near an HTF zone — the situation where an LTF continuation read is walking
 * into higher-timeframe supply/demand (docs/MARCO.md §7.1).
 */
export function htfContext(htfBars, price, cfg = MARCO_DEFAULTS) {
  if (!Array.isArray(htfBars) || htfBars.length < cfg.pivot_len * 2 + 10) {
    return { available: false, note: "not enough HTF bars" };
  }
  const map = buildLiquidityMap(htfBars, cfg);
  const atr = atrSeries(htfBars, cfg.atr_length);
  const atrNow = atr[atr.length - 1] ?? 0;
  const prox = (cfg.htf?.proximity_atr ?? 1.5) * atrNow;

  const zones = map.blocks
    .filter((b) => !b.dead)
    .map((b) => {
      const dist = price > b.top ? price - b.top : price < b.bot ? b.bot - price : 0;
      return {
        side: b.side,
        zone: [round(b.bot), round(b.top)],
        qualified: b.qualified,
        thin: b.thin === true,
        tapped: b.tapped,
        distance: round(dist),
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);

  const near = zones.filter((z) => z.distance <= prox);
  const alert = near.length
    ? near
        .map(
          (z) =>
            `price ${z.distance === 0 ? "is inside" : "is near"} the HTF ` +
            `${z.side === "bull" ? "bullish" : "bearish"} LB ${z.zone[0]}–${z.zone[1]}` +
            (z.qualified ? " (qualified)" : ""),
        )
        .join("; ")
    : null;

  const lvl = (l) => ({ price: round(l.price), touches: l.touches });
  const above = map.levels.highs
    .filter((l) => l.price > price)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map(lvl);
  const below = map.levels.lows
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3)
    .map(lvl);

  return {
    available: true,
    timeframe: cfg.htf?.timeframe ?? null,
    zones,
    alert,
    intact_above: above,
    intact_below: below,
  };
}

/** One timeframe's full read: story + zones + levels + the 10 a.m. gate. */
export function analyzeMarco(bars, cfg = MARCO_DEFAULTS) {
  if (!Array.isArray(bars) || bars.length < cfg.pivot_len * 2 + 10) {
    return { error: "not enough bars", bars: bars?.length ?? 0 };
  }
  const n = bars.length;
  const map = buildLiquidityMap(bars, cfg);
  const story = storyRead(map, bars, cfg);
  const atr = atrSeries(bars, cfg.atr_length);
  const buf = cfg.stop_buffer_atr * (atr[n - 1] ?? 0);

  const blocks = map.blocks
    .filter((b) => !b.dead)
    .map((b) => ({
      side: b.side,
      zone: [round(b.bot), round(b.top)],
      qualified: b.qualified,
      thin: b.thin === true,
      tapped: b.tapped,
      age_bars: n - 1 - b.born,
      stop_beyond: b.side === "bull" ? round(b.bot - buf) : round(b.top + buf),
    }))
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        Number(a.thin) - Number(b.thin) ||
        a.age_bars - b.age_bars,
    )
    .slice(0, 6);

  return {
    bars_analyzed: n,
    last_price: story.price,
    story: { mode: story.mode, read: story.read },
    blocks,
    liquidity: {
      intact_above: story.intact_above,
      intact_below: story.intact_below,
    },
    h4_model: h4Model(bars, cfg),
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeConfig(rules) {
  const c = rules.marco || {};
  const out = { ...MARCO_DEFAULTS, ...c };
  out.h4 = { ...MARCO_DEFAULTS.h4, ...(c.h4 || {}) };
  out.htf = c.htf === null ? null : { ...MARCO_DEFAULTS.htf, ...(c.htf || {}) };
  return out;
}

export async function runMarcoBrief({ rules_path, symbols, timeframes } = {}) {
  let rules = {};
  let loadedFrom = null;
  try {
    const r = loadRules(rules_path);
    rules = r.rules;
    loadedFrom = r.path;
  } catch {
    // rules.json is optional on this branch — defaults are fine
  }
  const cfg = mergeConfig(rules);
  const tfs = timeframes?.length ? timeframes : cfg.timeframes;
  const watchlist = symbols?.length
    ? symbols
    : loadWatchlist(cfg.watchlist_section).watchlist;

  if (!watchlist.length) {
    throw new Error(`watchlists.json "${cfg.watchlist_section}" is empty. Add at least one symbol.`);
  }

  let originalSymbol;
  let originalTimeframe;
  try {
    const state = await chart.getState();
    originalSymbol = state.symbol;
    originalTimeframe = state.resolution;
  } catch {
    /* chart state is a nicety, not a requirement */
  }

  const results = [];
  for (const symbol of watchlist) {
    try {
      await chart.setSymbol({ symbol });
      await sleep(900);

      let htfBars = null;
      if (cfg.htf && !tfs.includes(cfg.htf.timeframe)) {
        try {
          await chart.setTimeframe({ timeframe: cfg.htf.timeframe });
          await sleep(900);
          htfBars = (await data.getOhlcv({ count: cfg.htf.bars_to_fetch })).bars;
        } catch {
          htfBars = null; // HTF context is an enrichment, never a requirement
        }
      }

      const perTf = {};
      for (const tf of tfs) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);
        const { bars } = await data.getOhlcv({ count: cfg.bars_to_fetch });
        const read = analyzeMarco(bars, cfg);
        if (!read.error && htfBars) read.htf = htfContext(htfBars, read.last_price, cfg);
        perTf[tf] = read;
      }
      const quote = await data.getQuote({});
      results.push({ symbol, quote, timeframes: perTf });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  try {
    if (originalSymbol) {
      await chart.setSymbol({ symbol: originalSymbol });
      await sleep(600);
    }
    if (originalTimeframe) await chart.setTimeframe({ timeframe: originalTimeframe });
  } catch {
    /* best-effort restore */
  }

  return {
    generated_at: new Date().toISOString(),
    methodology: "docs/MARCO.md — Accettone liquidity blocks",
    rules_path: loadedFrom,
    config: cfg,
    results,
  };
}

export function compactMarcoBrief(brief) {
  return {
    instruction:
      "Render one compact block per symbol/timeframe: the story line first " +
      "(mode + read — liquidity is the priority), then LB rows (side, zone, " +
      "qualified, tapped, stop_beyond), then intact liquidity with touch " +
      "counts, then the 10 a.m. H4 line when available. All thresholds are " +
      "[CALIBRATION] (docs/MARCO.md §6) — never present them as Accettone's.",
    generated_at: brief.generated_at,
    symbols: brief.results.map((r) =>
      r.error
        ? { symbol: r.symbol, error: r.error }
        : {
            symbol: r.symbol,
            price: r.quote?.last ?? null,
            timeframes: Object.fromEntries(
              Object.entries(r.timeframes).map(([tf, t]) => [
                tf,
                t.error
                  ? { error: t.error }
                  : {
                      story: `${t.story.mode}: ${t.story.read}`,
                      blocks: t.blocks,
                      intact_above: t.liquidity.intact_above.slice(0, 4),
                      intact_below: t.liquidity.intact_below.slice(0, 4),
                      h4: t.h4_model.available
                        ? {
                            phase: t.h4_model.phase,
                            h4_high: t.h4_model.h4_high,
                            h4_low: t.h4_model.h4_low,
                            longs: t.h4_model.longs,
                            shorts: t.h4_model.shorts,
                            note: t.h4_model.note,
                          }
                        : null,
                      htf: t.htf?.available
                        ? {
                            timeframe: t.htf.timeframe,
                            alert: t.htf.alert,
                            zones: t.htf.zones.slice(0, 3),
                            intact_above: t.htf.intact_above,
                            intact_below: t.htf.intact_below,
                          }
                        : null,
                    },
              ]),
            ),
          },
    ),
  };
}
