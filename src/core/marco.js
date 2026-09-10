/**
 * Marco Accettone (Inter Equity Trading) — liquidity-block engine.
 *
 * Methodology source of truth: docs/MARCO.md. The bar-replay state machine
 * below mirrors scripts/marco_liquidity_blocks.pine — when tuning a default,
 * change both files. Pure functions first (testable without TradingView),
 * chart-driving brief at the bottom (same shape the chris/CLS branches use).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as chart from "./chart.js";
import * as data from "./data.js";
import { loadRules, loadWatchlist, loadContracts, contractSpec } from "./config.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");
const WEEKLY_DIR = join(PROJECT_ROOT, "briefs", "weekly");

export const MARCO_DEFAULTS = {
  timeframes: ["15", "60"],
  // Ask for more than any chart holds: the data layer returns
  // min(requested, loaded), so this means "take the whole loaded series"
  // rather than truncating it. Measured 2026-09-09: MNQ 60m held 937 bars
  // while the old 400 threw away 537 of them, and 5m held only 300-425 no
  // matter what was asked. Depth is therefore set by what TradingView has
  // loaded per resolution, never by this number. [CALIBRATION]
  bars_to_fetch: 5000,
  watchlist_section: "marco",

  // --- daily morning run (docs/MARCO.md, 2026-09-09 calibration) ---
  // Marco's own cascade: H4 context -> H1 the main intraday read -> M15
  // refinement -> M5 the entry.
  daily_timeframes: ["240", "60", "15", "5"],
  // The read is worthless below these, so a key timeframe that comes up
  // short fails rather than producing a thin analysis with a footnote: the
  // value is in analysis done on sufficient data [user, 2026-09-09]. The
  // floor is set by zone_max_age (300) + story_lookback (60): with less
  // than that, the oldest zones are an artifact of the window edge.
  key_timeframes: ["240", "60"],
  min_bars: { 240: 360, 60: 360, 15: 300, 5: 200 },
  // A key timeframe that is short is usually still loading — wait and
  // refetch before giving up.
  history_retries: 2,
  history_retry_ms: 1500,
  // Mirrors the journal strategy's max_risk_per_trade; the journal is the
  // authority, this is the copy the engine sizes against. Override in
  // rules.json -> marco.max_risk_per_trade.
  max_risk_per_trade: 250,

  // detection — every number is a [CALIBRATION] (docs/MARCO.md §6)
  pivot_len: 3, // swing = strictly lowest/highest of N bars each side
  confirm_bars: 3, // sweep must reclaim the swept level within N bars
  atr_length: 14,
  eq_tolerance_atr: 0.25, // "equal" levels merge within this ATR fraction
  min_touches: 2, // touches that make a level "build-up"
  min_level_age: 50, // ...or age that qualifies a swept level anyway
  max_levels: 20, // intact levels tracked per side
  seed_levels: 10, // HTF levels fed into a lower-TF map, nearest per side
  target_min_rr: 1.5, // a trigger's target steps to the next cluster below this RR (mirrors the journal's min_rr)
  zone_max_age: 300, // LB zone lifetime in bars
  story_lookback: 60, // how far back the narrative looks for the last run
  // docs/MARCO.md §3: where the LTF story's direction comes from — "trap"
  // (the last qualified LB: the last confirmed side that was run and
  // reclaimed), "draw" (the side holding more intact build-up fuel — Marco's
  // lean before the trap) or "off" (no automatic bias; roles only from an
  // explicit/weekly bias). An explicit bias always overrides the source.
  bias_source: "trap",

  // findings of the 09:55 experiment (docs/MARCO.md §7.1) — all [CALIBRATION]
  min_zone_atr: 0.25, // thinner zones are flagged `thin`: not entry-grade
  stop_buffer_atr: 0.1, // reported stop sits this far past the extreme
  story_fresh_bars: 16, // a trap older than this reads as stale

  // V6 (docs/MARCO.md §4.4): "low respecting low" — a later low that holds
  // this far above a level counts as a confirming touch, not a new level
  respect_tolerance_atr: 0.75,

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

function registerLevel(lvls, side, born, price, atrNow, cfg, events, bar, buildups, opts = {}) {
  const tol = (atrNow ?? 0) * cfg.eq_tolerance_atr;
  // opts.touches: taps the new level already carries (an expired LB's
  // extreme brings its respects; a seeded HTF level brings its HTF taps);
  // opts.seeded: an HTF level — never pruned by the per-side cap
  const add = opts.touches ?? 1;
  // docs/MARCO.md §2.1: once a level has min_touches taps it is a liquidity
  // build-up — the local target. The record outlives the level: the sweep
  // marks it swept and links the LB the run creates.
  const track = (lv, respect) => {
    if (lv.buildup == null && lv.touches >= cfg.min_touches) {
      events.push({ bar, type: `${side}_buildup`, level: lv.price, touches: lv.touches, ...(respect ? { respect: true } : {}) });
      lv.buildup = buildups.length;
      buildups.push({ side, price: lv.price, near: lv.near, touches: lv.touches, born: lv.born, lastTouch: born, swept: null, sweptExt: null, lb: null });
    } else if (lv.buildup != null) {
      const bu = buildups[lv.buildup];
      bu.touches = lv.touches;
      bu.price = lv.price;
      bu.near = lv.near;
      bu.lastTouch = born;
    }
  };
  for (const lv of lvls) {
    if (Math.abs(lv.price - price) <= tol) {
      lv.touches += add;
      // liquidity rests beyond the furthest of the "equal" extremes; the
      // nearest one is the inner edge of the build-up box
      lv.price = side === "low" ? Math.min(lv.price, price) : Math.max(lv.price, price);
      lv.near = side === "low" ? Math.max(lv.near, price) : Math.min(lv.near, price);
      lv.lastTouch = born;
      track(lv, false);
      return;
    }
  }
  // "low respecting low": a later low that holds above an existing level (by
  // less than respect_tolerance_atr) confirms the liquidity below it —
  // docs/MARCO.md §4.4. The level keeps the original (further) price.
  const respectTol = (atrNow ?? 0) * cfg.respect_tolerance_atr;
  let best = null;
  for (const lv of lvls) {
    const gap = side === "low" ? price - lv.price : lv.price - price;
    if (gap > 0 && gap <= respectTol && (!best || gap < best.gap)) best = { lv, gap };
  }
  if (best) {
    best.lv.touches += 1;
    best.lv.lastTouch = born;
    track(best.lv, true);
    return;
  }
  const fresh = { price, near: price, born, touches: add, lastTouch: born, buildup: null, ...(opts.seeded ? { seeded: true } : {}) };
  lvls.push(fresh);
  if (add >= cfg.min_touches) track(fresh, false);
  if (lvls.length > cfg.max_levels) {
    const idx = lvls.findIndex((lv) => !lv.seeded);
    if (idx >= 0) lvls.splice(idx, 1);
  }
}

/**
 * Replay the bars through the same state machine the Pine indicator runs:
 * intact levels → sweeps → pending reclaim → LB zones with qualification.
 * Returns { levels: {lows, highs}, blocks, events } — events are the
 * chronological narrative (sweeps, build-ups, LB creation, taps, breakdowns).
 */
export function buildLiquidityMap(bars, cfg = MARCO_DEFAULTS, { seed = null } = {}) {
  const p = cfg.pivot_len;
  const atr = atrSeries(bars, cfg.atr_length);
  const lowLvls = [];
  const highLvls = [];
  const blocks = [];
  const events = [];
  const buildups = [];
  let pendBull = null;
  let pendBear = null;

  // HTF feed (docs/MARCO.md §2.1, V7: "this 4-hour high is just another high
  // on the lower time frames — I just grab that high"): intact levels of a
  // higher timeframe enter the map before bar 0 as aged levels, so the
  // window of this timeframe is not the limit of its memory.
  const atr0 = atr.find((v) => v != null) ?? 0;
  for (const side of ["low", "high"]) {
    const lvls = side === "low" ? lowLvls : highLvls;
    for (const sd of seed?.[side === "low" ? "lows" : "highs"] ?? []) {
      registerLevel(lvls, side, -cfg.min_level_age, sd.price, atr0, cfg, events, 0, buildups, {
        touches: sd.touches ?? 1,
        seeded: true,
      });
    }
  }

  // a swing = strictly beyond the p bars on its left, beyond-or-equal on its
  // right: a run of equal extremes registers once, on its first bar
  // [CALIBRATION — equal lows 06:00/09:00 used to cancel each other out]
  const isPivot = (j, side) => {
    for (let k = j - p; k <= j + p; k++) {
      if (k === j) continue;
      if (k < 0 || k >= bars.length) return false;
      const strict = k < j;
      if (side === "low") {
        if (strict ? bars[k].low <= bars[j].low : bars[k].low < bars[j].low) return false;
      } else if (strict ? bars[k].high >= bars[j].high : bars[k].high > bars[j].high) return false;
    }
    return true;
  };
  const tolAt = (i) => (atr[i] ?? 0) * cfg.eq_tolerance_atr;

  // LB vs build-up [user, 2026-09-06]: an LB is a low behind which there is
  // no liquidity — until the crowd builds some. A pivot that holds within
  // eq_tolerance of a live zone's extreme is a respect of that extreme; once
  // the extreme carries min_touches taps it is a target, not a block: the
  // zone retires and its extreme joins the map as a build-up level.
  const respectZone = (blks, side, price, i, j, tol) => {
    for (const blk of blks) {
      if (blk.dead || blk.side !== side || j <= blk.extBar) continue;
      const ext = side === "bull" ? blk.bot : blk.top;
      const gap = side === "bull" ? price - ext : ext - price;
      if (gap < 0 || gap > tol) continue;
      blk.respects = (blk.respects ?? 0) + 1;
      events.push({ bar: i, type: `${side}_lb_respect`, zone: [blk.bot, blk.top], respects: blk.respects });
      if (1 + blk.respects >= cfg.min_touches) {
        blk.dead = true;
        blk.died = i;
        blk.death = "buildup";
        const lvls = side === "bull" ? lowLvls : highLvls;
        registerLevel(lvls, side === "bull" ? "low" : "high", blk.extBar, ext, atr[i], cfg, events, i, buildups, {
          touches: 1 + blk.respects,
        });
        events.push({ bar: i, type: `${side}_lb_retired`, zone: [blk.bot, blk.top], reason: "buildup", level: ext, touches: 1 + blk.respects });
      }
      return;
    }
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];

    // 1. maintain LB zones: invalidation, expiry, first tap
    for (const blk of blocks) {
      if (blk.dead) continue;
      // a trade beyond the extreme takes the liquidity behind it — the zone's
      // stop is hit and "no reason to trade below it" no longer holds
      // (docs/MARCO.md §2.3, §5) [user, 2026-09-06: by trade, not by close]
      const invalid = blk.side === "bull" ? b.low < blk.bot : b.high > blk.top;
      const expired = i - blk.born > cfg.zone_max_age;
      if (invalid || expired) {
        blk.dead = true;
        blk.died = i;
        blk.death = invalid ? "invalidated" : "expired";
        if (expired) {
          // the zone ages out, the extreme does not: a low that was made and
          // never taken is still liquidity — it goes back on the map as a
          // level carrying the respects it collected while the zone lived
          const lvls = blk.side === "bull" ? lowLvls : highLvls;
          const ext = blk.side === "bull" ? blk.bot : blk.top;
          registerLevel(lvls, blk.side === "bull" ? "low" : "high", blk.extBar, ext, atr[i], cfg, events, i, buildups, {
            touches: 1 + (blk.respects ?? 0),
          });
          events.push({ bar: i, type: `${blk.side}_lb_retired`, zone: [blk.bot, blk.top], reason: "expired", level: ext });
        }
        if (invalid) {
          events.push({ bar: i, type: `${blk.side}_lb_invalidated`, zone: [blk.bot, blk.top] });
          // the buyers/sellers who leaned on this zone are now trapped: its
          // extreme is swept liquidity, and a reclaim makes the new extreme an
          // LB (docs/MARCO.md §7.1 — the Oct-2023 NQ bottom)
          if (blk.side === "bull") {
            if (!pendBull) {
              pendBull = { lvl: blk.bot, touches: 1, age: i - blk.extBar, ext: b.low, extBar: i, miss: 0 };
            } else {
              pendBull.lvl = Math.min(pendBull.lvl, blk.bot);
              pendBull.age = Math.max(pendBull.age, i - blk.extBar);
            }
            events.push({ bar: i, type: "low_swept", level: blk.bot, touches: 1, from_lb: true });
          } else {
            if (!pendBear) {
              pendBear = { lvl: blk.top, touches: 1, age: i - blk.extBar, ext: b.high, extBar: i, miss: 0 };
            } else {
              pendBear.lvl = Math.max(pendBear.lvl, blk.top);
              pendBear.age = Math.max(pendBear.age, i - blk.extBar);
            }
            events.push({ bar: i, type: "high_swept", level: blk.top, touches: 1, from_lb: true });
          }
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

    // 2. sweep scan — a trade beyond an intact level consumes it.
    // Pocket floor [user, 2026-09-06]: a run that stops within eq_tolerance
    // short of a deeper intact level is a stab INTO the pocket, not a trap —
    // the poked level is consumed, no pending opens, the floor keeps the
    // liquidity (the 6E 1.15765 / 6B 1.3474 cases).
    const tol = tolAt(i);
    const floorBelow = lowLvls.some((o) => o.price < b.low && b.low - o.price <= tol);
    const floorAbove = highLvls.some((o) => o.price > b.high && o.price - b.high <= tol);
    for (let k = lowLvls.length - 1; k >= 0; k--) {
      const lv = lowLvls[k];
      if (b.low < lv.price) {
        if (floorBelow) {
          const floor = lowLvls.filter((o) => o.price < b.low).sort((x, y) => y.price - x.price)[0];
          if (lv.buildup != null) {
            buildups[lv.buildup].swept = i;
            buildups[lv.buildup].sweptExt = b.low;
          }
          events.push({ bar: i, type: "low_poke", level: lv.price, touches: lv.touches, floor: floor.price, ext: b.low });
          lowLvls.splice(k, 1);
          continue;
        }
        if (!pendBull) {
          pendBull = { lvl: lv.price, touches: lv.touches, age: i - lv.born, ext: b.low, extBar: i, miss: 0, buildup: lv.buildup ?? null };
        } else {
          if (lv.buildup != null && lv.touches >= pendBull.touches) pendBull.buildup = lv.buildup;
          pendBull.lvl = Math.min(pendBull.lvl, lv.price);
          pendBull.touches = Math.max(pendBull.touches, lv.touches);
          pendBull.age = Math.max(pendBull.age, i - lv.born);
        }
        if (lv.buildup != null) {
          buildups[lv.buildup].swept = i;
          buildups[lv.buildup].sweptExt = b.low;
        }
        events.push({ bar: i, type: "low_swept", level: lv.price, touches: lv.touches, buildup: lv.buildup ?? null });
        lowLvls.splice(k, 1);
      }
    }
    for (let k = highLvls.length - 1; k >= 0; k--) {
      const lv = highLvls[k];
      if (b.high > lv.price) {
        if (floorAbove) {
          const floor = highLvls.filter((o) => o.price > b.high).sort((x, y) => x.price - y.price)[0];
          if (lv.buildup != null) {
            buildups[lv.buildup].swept = i;
            buildups[lv.buildup].sweptExt = b.high;
          }
          events.push({ bar: i, type: "high_poke", level: lv.price, touches: lv.touches, floor: floor.price, ext: b.high });
          highLvls.splice(k, 1);
          continue;
        }
        if (!pendBear) {
          pendBear = { lvl: lv.price, touches: lv.touches, age: i - lv.born, ext: b.high, extBar: i, miss: 0, buildup: lv.buildup ?? null };
        } else {
          if (lv.buildup != null && lv.touches >= pendBear.touches) pendBear.buildup = lv.buildup;
          pendBear.lvl = Math.max(pendBear.lvl, lv.price);
          pendBear.touches = Math.max(pendBear.touches, lv.touches);
          pendBear.age = Math.max(pendBear.age, i - lv.born);
        }
        if (lv.buildup != null) {
          buildups[lv.buildup].swept = i;
          buildups[lv.buildup].sweptExt = b.high;
        }
        events.push({ bar: i, type: "high_swept", level: lv.price, touches: lv.touches, buildup: lv.buildup ?? null });
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
        // docs/MARCO.md §3 (V1 diagram): an unqualified LB born against a
        // live qualified one is inducement — the crowd read the break of an
        // internal point as a BOS. A by-the-book LB (pullback origin), but it
        // never flips the story.
        const inducement = !qualified && blocks.some((o) => !o.dead && o.qualified && o.side === "bear");
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
          inducement,
          buildup: pendBull.buildup ?? null,
          tapped: false,
          dead: false,
        });
        if (pendBull.buildup != null) buildups[pendBull.buildup].lb = blocks.length - 1;
        events.push({ bar: i, type: "bull_lb_created", zone: [pendBull.ext, pendBull.lvl], qualified, inducement });
        pendBull = null;
      } else if (++pendBull.miss > cfg.confirm_bars) {
        const qualified = pendBull.touches >= cfg.min_touches || pendBull.age >= cfg.min_level_age;
        events.push({ bar: i, type: "low_breakdown", level: pendBull.lvl, qualified });
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
        const inducement = !qualified && blocks.some((o) => !o.dead && o.qualified && o.side === "bull");
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
          inducement,
          buildup: pendBear.buildup ?? null,
          tapped: false,
          dead: false,
        });
        if (pendBear.buildup != null) buildups[pendBear.buildup].lb = blocks.length - 1;
        events.push({ bar: i, type: "bear_lb_created", zone: [pendBear.lvl, pendBear.ext], qualified, inducement });
        pendBear = null;
      } else if (++pendBear.miss > cfg.confirm_bars) {
        const qualified = pendBear.touches >= cfg.min_touches || pendBear.age >= cfg.min_level_age;
        events.push({ bar: i, type: "high_breakdown", level: pendBear.lvl, qualified });
        pendBear = null;
      }
    }

    // 4. register the pivot confirmed at this bar (if any) as a new level.
    // The sweep extreme itself holds no liquidity (docs/MARCO.md §2.3):
    // skip pivots born during an unresolved sweep or inside a live zone.
    // A pending sweep only hides pivots inside its own excursion (beyond the
    // swept level); liquidity forming elsewhere while it resolves still counts.
    const j = i - p;
    if (j >= p) {
      const lo = bars[j].low;
      const hi = bars[j].high;
      if (!(pendBull && lo <= pendBull.lvl) && isPivot(j, "low")) {
        if (!insideZone(blocks, "bull", lo)) {
          registerLevel(lowLvls, "low", j, lo, atr[i], cfg, events, i, buildups);
        } else {
          respectZone(blocks, "bull", lo, i, j, tolAt(i));
        }
      }
      if (!(pendBear && hi >= pendBear.lvl) && isPivot(j, "high")) {
        if (!insideZone(blocks, "bear", hi)) {
          registerLevel(highLvls, "high", j, hi, atr[i], cfg, events, i, buildups);
        } else {
          respectZone(blocks, "bear", hi, i, j, tolAt(i));
        }
      }
    }
  }

  return { levels: { lows: lowLvls, highs: highLvls }, blocks, events, buildups };
}

/**
 * HTF feed for a lower-timeframe map (docs/MARCO.md §2.1, V7 — "this 4-hour
 * high is just another high on the lower time frames"): the intact levels of
 * a higher timeframe, born before the lower window opens, nearest
 * `seed_levels` per side to `price`. Seeded levels chain (W → D → 240/60).
 */
export function seedFromMap(htfMap, htfBars, { before = null, price = null, cfg = MARCO_DEFAULTS } = {}) {
  if (!htfMap?.levels) return null;
  const pick = (lvls) =>
    lvls
      .filter((lv) => before == null || lv.seeded || (htfBars?.[lv.born]?.time ?? 0) < before)
      .map((lv) => ({ price: lv.price, touches: lv.touches }))
      .sort((a, b) => (price == null ? 0 : Math.abs(a.price - price) - Math.abs(b.price - price)))
      .slice(0, cfg.seed_levels ?? 10);
  return { lows: pick(htfMap.levels.lows), highs: pick(htfMap.levels.highs) };
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

  // targets = intact levels plus alive opposite-side LB zones beyond price —
  // "all the way back at the highs" (V6) is a tap into the top's bearish LB
  const zoneTargets = (side, dir) =>
    map.blocks
      .filter((b) => !b.dead && b.side === side && (dir > 0 ? b.bot > price : b.top < price))
      .map((b) => ({
        price: round(dir > 0 ? b.bot : b.top),
        touches: b.sweptTouches ?? 1,
        buildup: b.qualified,
        bars_ago: n - 1 - b.born,
        kind: "lb",
        zone: [round(b.bot), round(b.top)],
      }));
  const targetsAbove = [...above.map((l) => ({ ...l, kind: "level" })), ...zoneTargets("bear", 1)].sort(
    (a, b) => a.price - b.price,
  );
  const targetsBelow = [...below.map((l) => ({ ...l, kind: "level" })), ...zoneTargets("bull", -1)].sort(
    (a, b) => b.price - a.price,
  );
  const tgtTxt = (arr) => arr.slice(0, 3).map((t) => (t.kind === "lb" ? `${t.price} (LB)` : `${t.price}`)).join(", ");

  const recent = map.events.filter((e) => n - 1 - e.bar <= cfg.story_lookback);
  const lastOf = (...types) => [...recent].reverse().find((e) => types.includes(e.type)) ?? null;
  let lastLb = lastOf("bull_lb_created", "bear_lb_created");
  let lastBreak = lastOf("low_breakdown", "high_breakdown");
  const ago = (bar) => {
    const b = n - 1 - bar;
    return b === 1 ? "1 bar ago" : `${b} bars ago`;
  };

  // The story anchor (docs/MARCO.md §3): the most recent alive LB that ran a
  // confirmed side of the range (build-up / age qualified). An LB never sets
  // the story by itself — liquidity does — so unqualified events after the
  // anchor on the other side (an internal point run and reclaimed, or
  // consumed) are inducement: marked, expected to give a false reaction,
  // never a flip. The anchor holds until it is invalidated or expires, even
  // when it is older than story_lookback (the V1 blue LB was 68 bars old at
  // its counterpart's tap).
  const anchor = map.blocks.filter((b) => !b.dead && b.qualified).sort((a, b) => b.born - a.born)[0] ?? null;
  const dirOf = (e) => (e.type === "bull_lb_created" || e.type === "high_breakdown" ? 1 : -1);
  let inducedLb = null;
  let inducedBreak = null;
  if (anchor) {
    const anchorDir = anchor.side === "bull" ? 1 : -1;
    if (lastLb && lastLb.bar > anchor.born && !lastLb.qualified && dirOf(lastLb) !== anchorDir) {
      inducedLb = lastLb;
      lastLb = null;
    }
    if (lastBreak && lastBreak.bar > anchor.born && !lastBreak.qualified && dirOf(lastBreak) !== anchorDir) {
      inducedBreak = lastBreak;
      lastBreak = null;
    }
    if (!lastLb || lastLb.bar < anchor.born) {
      lastLb = map.events.find((e) => e.bar === anchor.born && e.type === `${anchor.side}_lb_created`) ?? lastLb;
    }
  }

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
        (targetsBelow.length
          ? `; targets: ${tgtTxt(targetsBelow)}`
          : "; warning: no liquidity left below to target");
    } else {
      mode = "buy_story";
      read =
        `lows were run and reclaimed ${ago(lastLb.bar)} (trap) — ` +
        `look for longs at the bullish LB ${round(lastLb.zone[0])}–${round(lastLb.zone[1])}` +
        (targetsAbove.length
          ? `; targets: ${tgtTxt(targetsAbove)}`
          : "; warning: no liquidity left above to target");
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
    // the run that made the story took a build-up: that was the local target
    if (lbBlock && (lbBlock.sweptTouches ?? 1) >= cfg.min_touches) {
      const lvl = lbBlock.side === "bull" ? lbBlock.top : lbBlock.bot;
      read += ` — the x${lbBlock.sweptTouches} build-up at ${round(lvl)} was the local target, now taken`;
    }
  }
  const inducedBlock = inducedLb
    ? map.blocks.find((b) => b.born === inducedLb.bar && inducedLb.type.startsWith(b.side)) ?? null
    : null;
  const inducedAlive = !!(inducedBlock && !inducedBlock.dead);
  if (inducedLb) {
    const bear = inducedLb.type === "bear_lb_created";
    read +=
      ` — the ${bear ? "bearish" : "bullish"} LB ${round(inducedLb.zone[0])}–${round(inducedLb.zone[1])} ` +
      `created ${ago(inducedLb.bar)} ${inducedAlive ? "is" : "was"} inducement (an internal ${bear ? "high" : "low"} run inside the leg): ` +
      (inducedAlive ? "a pullback origin, not a flip" : "already run through, the story never flipped");
  }
  if (inducedBreak) {
    read +=
      ` — the ${inducedBreak.type === "low_breakdown" ? "low" : "high"} ${round(inducedBreak.level)} consumed ` +
      `${ago(inducedBreak.bar)} was an internal point: inducement while the LB holds, not a flip`;
  }
  // pocket floor [user, 2026-09-06]: a run that stopped within eq_tolerance of
  // a deeper intact level took an inner level only — the trap completes
  // beyond the pocket's furthest extreme, so this is inducement into the pocket
  const lastPoke = lastOf("low_poke", "high_poke");
  if (lastPoke) {
    const low = lastPoke.type === "low_poke";
    read +=
      ` — the ${low ? "stab under" : "spike over"} ${round(lastPoke.level)} ${ago(lastPoke.bar)} stopped at ${round(lastPoke.ext)}, ` +
      `${low ? "above" : "below"} the pocket floor ${round(lastPoke.floor)}: inducement into the pocket, not a trap`;
  }

  const direction =
    mode === "buy_story" || mode === "up_continuation"
      ? 1
      : mode === "sell_story" || mode === "down_continuation"
        ? -1
        : 0;
  const lb =
    lastLb && (mode === "buy_story" || mode === "sell_story")
      ? {
          zone: [round(lastLb.zone[0]), round(lastLb.zone[1])],
          alive: !!(lbBlock && !lbBlock.dead),
          thin: lbBlock?.thin === true,
        }
      : null;

  // docs/MARCO.md §3 (bias source "draw"): Marco's lean before the trap —
  // the side holding more intact build-up is the draw; the trap on the other
  // side activates it. Fuel = taps of intact build-up levels on each side.
  const fuelOf = (lvls, isAbove) =>
    lvls
      .filter((l) => l.touches >= cfg.min_touches && (isAbove ? l.price > price : l.price < price))
      .reduce((sum, l) => sum + l.touches, 0);
  const fuelAbove = fuelOf(map.levels.highs, true);
  const fuelBelow = fuelOf(map.levels.lows, false);
  const drawDir = fuelAbove > fuelBelow ? 1 : fuelBelow > fuelAbove ? -1 : 0;
  const anchorDir = anchor ? (anchor.side === "bull" ? 1 : -1) : 0;
  const draw = {
    direction: drawDir,
    fuel_above: fuelAbove,
    fuel_below: fuelBelow,
    activated: drawDir !== 0 && anchorDir === drawDir,
    read:
      drawDir === 0
        ? `no draw — build-up fuel is balanced (above x${fuelAbove}, below x${fuelBelow})`
        : `draw ${drawDir > 0 ? "up" : "down"} — intact build-up above x${fuelAbove} vs below x${fuelBelow}` +
          (anchorDir === drawDir
            ? `; the trap on the ${drawDir > 0 ? "low" : "high"} side is in — activated`
            : anchorDir === 0
              ? "; no trap yet — a lean, not a story"
              : "; the last trap sits on the draw side itself — a lean against the running story"),
  };

  return {
    price: round(price),
    mode,
    direction,
    fresh,
    lb,
    draw,
    inducement: inducedLb
      ? {
          side: inducedLb.type === "bear_lb_created" ? "bear" : "bull",
          zone: [round(inducedLb.zone[0]), round(inducedLb.zone[1])],
          alive: inducedAlive,
        }
      : null,
    read,
    nearest: { high: above[0] ?? null, low: below[0] ?? null },
    intact_above: above.slice(0, 6),
    intact_below: below.slice(0, 6),
    targets_above: targetsAbove.slice(0, 6),
    targets_below: targetsBelow.slice(0, 6),
  };
}

/**
 * Sweep-trigger setups (docs/MARCO.md §4.4): in the bias direction, each
 * confirmed level of liquidity that price would have to run, paired with the
 * nearest alive LB beyond it (the stop anchor) and the target. Nearest
 * trigger first — that is the next one the market can hand us.
 */
export function triggerSetups(map, bars, cfg = MARCO_DEFAULTS, { direction = 0, target = null, targets = null, max = 3 } = {}) {
  if (!direction || !bars?.length) return [];
  const n = bars.length;
  const price = bars[n - 1].close;
  const atr = atrSeries(bars, cfg.atr_length);
  const buf = cfg.stop_buffer_atr * (atr[n - 1] ?? 0);
  const long = direction > 0;
  const levels = (long ? map.levels.lows : map.levels.highs)
    .filter((l) => (long ? l.price < price : l.price > price))
    .sort((a, b) => (long ? b.price - a.price : a.price - b.price));
  const anchors = map.blocks.filter((b) => !b.dead && b.side === (long ? "bull" : "bear"));
  const candidates = [
    ...(long ? map.levels.highs : map.levels.lows)
      .filter((l) => (long ? l.price > price : l.price < price))
      .map((l) => l.price),
    ...map.blocks
      .filter((b) => !b.dead && b.side === (long ? "bear" : "bull") && (long ? b.bot > price : b.top < price))
      .map((b) => (long ? b.bot : b.top)),
  ];
  const tgt = target ?? (candidates.length ? (long ? Math.min(...candidates) : Math.max(...candidates)) : null);

  // the target belongs to the trigger, not to the current price: the nearest
  // opposing liquidity beyond the ENTRY, stepping up the ladder while the RR
  // is below target_min_rr (docs/MARCO.md §5 — nearest to furthest, partials)
  const minRr = cfg.target_min_rr ?? 0;
  const pickTarget = (entry, risk) => {
    if (!targets?.length) return { target: tgt, rr: tgt !== null && risk ? Math.abs(tgt - entry) / risk : null, ladder: null };
    const beyond = targets.filter((t) => (long ? t.price > entry : t.price < entry));
    if (!beyond.length) return { target: null, rr: null, ladder: [], tnote: "no target beyond the entry" };
    const ladder = [];
    for (const t of beyond) {
      const rr = risk ? Math.abs(t.price - entry) / risk : null;
      ladder.push({ price: round(t.price), rr: rr === null ? null : round(rr), ...(t.atr_weeks != null ? { atr_weeks: t.atr_weeks } : {}) });
      if (rr === null || rr >= minRr) {
        const farOut = t.atr_weeks != null && t.atr_weeks > 1 && ladder.length > 1;
        return {
          target: t.price,
          rr,
          ladder,
          ...(farOut ? { tnote: `≈${t.atr_weeks}w away — beyond a weekly range; refine the stop on a lower-TF LB to bring T1 ${ladder[0].price} into RR instead` } : {}),
        };
      }
    }
    const last = beyond[beyond.length - 1];
    return {
      target: last.price,
      rr: risk ? Math.abs(last.price - entry) / risk : null,
      ladder,
      tnote: `no target on the ladder reaches RR ${minRr} from this entry`,
    };
  };

  const setup = (kind, entry, anchor, extra) => {
    const stop = anchor ? (long ? anchor.bot - buf : anchor.top + buf) : null;
    const risk = stop === null ? null : Math.abs(entry - stop);
    const picked = pickTarget(entry, risk);
    const stepped = picked.ladder && picked.ladder.length > 1;
    const notes = [
      extra?.note ?? null,
      picked.tnote ?? null,
      stepped ? `T1 ${picked.ladder[0].price} gives RR ${picked.ladder[0].rr} (< ${minRr}) — target moved to ${round(picked.target)}` : null,
    ].filter(Boolean);
    return {
      kind,
      side: long ? "long" : "short",
      trigger: round(entry),
      distance: round(Math.abs(price - entry)),
      stop_anchor: anchor ? [round(anchor.bot), round(anchor.top)] : null,
      stop: stop === null ? null : round(stop),
      target: picked.target === null || picked.target === undefined ? null : round(picked.target),
      rr: picked.rr === null || picked.rr === undefined ? null : round(picked.rr),
      ...(picked.ladder ? { targets: picked.ladder } : {}),
      ...extra,
      note: notes.length ? notes.join("; ") : null,
    };
  };

  // sweep triggers: a level to be run, stop under/over the nearest LB beyond it
  const sweeps = levels.map((l) => {
    const anchor = anchors
      .filter((b) => (long ? b.top < l.price : b.bot > l.price))
      .sort((a, b) => (long ? b.top - a.top : a.bot - b.bot))[0] ?? null;
    return setup("sweep", l.price, anchor, {
      confirmed: l.touches >= cfg.min_touches,
      touches: l.touches,
      note: anchor ? null : "no LB beyond the trigger — no stop anchor; wait for one or refine on a lower TF",
    });
  });
  // zone taps: an alive LB in the bias direction, entry at its inner edge,
  // stop past its extreme (the V1 entry; V6 entries 1, 4 and 5)
  const taps = anchors
    .filter((b) => (long ? b.top < price : b.bot > price))
    .map((b) =>
      setup("tap", long ? b.top : b.bot, b, {
        confirmed: b.qualified,
        touches: b.sweptTouches ?? 1,
        tapped: b.tapped,
        note: b.thin ? "thin zone — refine the entry on a lower TF" : null,
      }),
    );

  return [...sweeps, ...taps].sort((a, b) => a.distance - b.distance).slice(0, max);
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

/**
 * Zones against the bias are pullback origins, never entries (V1 5:27–6:02:
 * "still by-the-book liquidity blocks, but not ones we would use for entry
 * — you can anticipate this false reaction, this pullback"). Nearest first.
 */
export function falseReactions(map, price, direction, { max = 3 } = {}) {
  if (!direction) return [];
  const long = direction > 0;
  return map.blocks
    .filter((b) => !b.dead && b.side === (long ? "bear" : "bull") && (long ? b.bot > price : b.top < price))
    .map((b) => ({
      side: b.side,
      zone: [round(b.bot), round(b.top)],
      qualified: b.qualified,
      inducement: b.inducement === true,
      tapped: b.tapped,
      distance: round(long ? b.bot - price : price - b.top),
      note:
        `expect a false ${long ? "bearish" : "bullish"} reaction here — a pullback toward the next ${long ? "long" : "short"} setup, not an entry` +
        (b.inducement ? " (inducement: an internal point run inside the leg)" : ""),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

/** One timeframe's full read: story + zones + levels + the 10 a.m. gate. */
export function analyzeMarco(bars, cfg = MARCO_DEFAULTS, { bias = null, seed = null, counter = false } = {}) {
  if (!Array.isArray(bars) || bars.length < cfg.pivot_len * 2 + 10) {
    return { error: "not enough bars", bars: bars?.length ?? 0 };
  }
  const n = bars.length;
  const map = buildLiquidityMap(bars, cfg, { seed });
  const story = storyRead(map, bars, cfg);
  const atr = atrSeries(bars, cfg.atr_length);
  const buf = cfg.stop_buffer_atr * (atr[n - 1] ?? 0);
  // docs/MARCO.md §3: an explicit bias (weekly brief or manual, 0 = off)
  // leads; otherwise this TF's own story by cfg.bias_source — trap (the last
  // qualified LB), draw (build-up fuel) or off (no automatic bias)
  const src = cfg.bias_source ?? "trap";
  const explicit = bias !== null && bias !== undefined;
  const dir = explicit ? bias : src === "draw" ? story.draw.direction : src === "off" ? 0 : story.direction;
  const biasSource = explicit ? "explicit" : src;
  const roleOf = (b) => (!dir ? null : b.side === (dir > 0 ? "bull" : "bear") ? "entry" : "pullback_origin");

  const blocks = map.blocks
    .filter((b) => !b.dead)
    .map((b) => ({
      side: b.side,
      role: roleOf(b),
      zone: [round(b.bot), round(b.top)],
      qualified: b.qualified,
      thin: b.thin === true,
      inducement: b.inducement === true,
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

  // docs/MARCO.md §2.1: intact build-ups are the local targets; swept ones
  // stay listed (with the LB they produced) as long as a zone would
  const buildups = map.buildups
    .filter((u) => u.swept === null || n - 1 - u.swept <= cfg.zone_max_age)
    .map((u) => ({
      side: u.side,
      zone: [round(Math.min(u.price, u.near)), round(Math.max(u.price, u.near))],
      touches: u.touches,
      status: u.swept === null ? "intact" : "swept",
      age_bars: n - 1 - u.born,
      swept_bars_ago: u.swept === null ? null : n - 1 - u.swept,
      lb: u.lb === null || u.lb === undefined ? null : [round(map.blocks[u.lb].bot), round(map.blocks[u.lb].top)],
    }))
    .sort((a, b) => (a.status === b.status ? a.age_bars - b.age_bars : a.status === "intact" ? -1 : 1))
    .slice(0, 8);

  return {
    bars_analyzed: n,
    last_price: story.price,
    story: { mode: story.mode, direction: story.direction, read: story.read, lb: story.lb, draw: story.draw },
    bias_used: dir,
    bias_source: biasSource,
    blocks,
    triggers: triggerSetups(map, bars, cfg, { direction: dir }),
    // Counter-bias entries. On any other day these zones are inducement and
    // must NOT be rendered as tradeable, so this is opt-in: only the daily
    // run asks for it, and only Mon-Tue, when the strategy's early-week
    // counter-trend allowance is live (docs/MARCO.md §3).
    counter_triggers: counter && dir ? triggerSetups(map, bars, cfg, { direction: -dir, max: 2 }) : null,
    false_reactions: falseReactions(map, story.price, dir),
    liquidity: {
      intact_above: story.intact_above,
      intact_below: story.intact_below,
      buildups,
    },
    h4_model: h4Model(bars, cfg),
  };
}

// ------------------------------------------------------------ weekly bias --

/**
 * Weekly vs daily story → one bias for the week. The divergence rule is the
 * user's [CALIBRATION]: when the daily disagrees with the weekly, trade the
 * daily consciously as counter-trend with targets at the nearest levels
 * only; when they agree, target the higher-timeframe liquidity (V6 §3.1).
 */
export function resolveBias(w, d, names = { senior: "weekly", junior: "daily" }) {
  const S = names.senior;
  const J = names.junior;
  // a "story" is a confirmed trap (buy/sell_story); a "lean" also counts the
  // continuation states — continuation alone never makes a counter-trend case
  const story = (s) => (s?.mode === "buy_story" ? 1 : s?.mode === "sell_story" ? -1 : 0);
  const lean = (s) => s?.direction ?? 0;
  const sW = story(w);
  const sD = story(d);
  const lW = lean(w);
  const lD = lean(d);
  const far = (s, dir) =>
    (dir > 0 ? (s?.targets_above ?? s?.intact_above) : (s?.targets_below ?? s?.intact_below)) ?? [];
  const preferBuildup = (levels) => levels.find((l) => l.buildup) ?? levels[0] ?? null;
  const leanWord = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");

  // a weekly story is "live" while its trap is fresh and it still has a
  // target; a daily trap against a live weekly story is inducement (V6), and
  // only a stale weekly story yields to the daily as counter-trend [user]
  const weeklyLive = !!sW && w?.fresh !== false && far(w, sW).length > 0;
  // "aligned" needs a live story on at least one side: a stale trap plus a
  // mere continuation on the other timeframe is a lean, not agreement
  // [CALIBRATION, 2026-09-06 — 6J read "aligned" off an 87-bar-old daily trap]
  const liveSide = (sW && w?.fresh !== false) || (sD && d?.fresh !== false);
  let stale = false;

  let bias = 0;
  let regime = "no_bias";
  let targets = [];
  let primary = null;
  let note = `no trap on either timeframe (${S} leans ${leanWord(lW)}, ${J} leans ${leanWord(lD)}) — no bias, wait for a run`;
  if (lW && lD === lW && (sW || sD) && liveSide) {
    bias = lW;
    regime = "aligned";
    targets = far(w, lW).slice(0, 3);
    primary = preferBuildup(targets);
    note = `${S} and ${J} agree — every move against the bias is false; target the ${S} liquidity`;
  } else if (lW && lD === lW && (sW || sD)) {
    // same lean, but the only story is stale
    stale = true;
    if (sW) {
      bias = sW;
      regime = "weekly_only";
      targets = far(w, sW).slice(0, 3);
      primary = preferBuildup(targets);
      note = `${S} trap is stale and the ${J} only leans the same way — a lean, not a live story; wait for a fresh run before trusting the side`;
    } else {
      bias = sD;
      regime = "daily_only";
      targets = far(d, sD).slice(0, 2);
      primary = targets[0] ?? null;
      note = `${J} trap is stale and the ${S} only leans the same way — a lean, not a live story; nearest targets only, wait for a fresh run`;
    }
  } else if (sW && sD && weeklyLive) {
    bias = sW;
    regime = "pullback";
    targets = far(w, sW).slice(0, 3);
    primary = preferBuildup(targets);
    note =
      `${J} ${sD > 0 ? "bullish" : "bearish"} trap against a live ${S} ${sW > 0 ? "buy" : "sell"} story — inducement, ` +
      `not a new story; the move against the bias is false, use it to enter with the ${S} (trigger below/above the ${J} trap's run)`;
  } else if (sW && sD) {
    bias = sD;
    regime = "counter_trend";
    targets = far(d, sD).slice(0, 2);
    primary = targets[0] ?? null;
    note = `${J} trap against a stale ${S} story — trade the ${J} consciously as counter-trend, targets at the nearest levels only`;
  } else if (sW && lD === -sW) {
    bias = sW;
    regime = "pullback";
    targets = far(w, sW).slice(0, 3);
    primary = preferBuildup(targets);
    note = `${J} is running against the ${S} without a trap — a pullback; wait for the ${J} to print its own trap in the bias direction before triggering`;
  } else if (sD) {
    bias = sD;
    regime = "daily_only";
    targets = far(d, sD).slice(0, 2);
    primary = targets[0] ?? null;
    note =
      lW === -sD
        ? `${S} leans the other way without a trap — treat as counter-trend, nearest targets only`
        : `${S} has no story — the ${J} leads, nearest targets`;
  } else if (sW) {
    bias = sW;
    regime = "weekly_only";
    targets = far(w, sW).slice(0, 3);
    primary = preferBuildup(targets);
    note = `${J} has no story — the ${S} leads`;
  }

  const weeklyLeads = regime === "aligned" || regime === "weekly_only" || regime === "pullback";
  const lead = weeklyLeads ? w : d;
  const leadLb = lead?.lb?.alive ? lead.lb : (regime === "aligned" && d?.lb?.alive ? d.lb : null);
  const invalidation =
    bias && leadLb
      ? { level: bias > 0 ? leadLb.zone[0] : leadLb.zone[1], rule: `${weeklyLeads ? S : J} close ${bias > 0 ? "below" : "above"}` }
      : null;

  return {
    bias,
    bias_word: bias > 0 ? "long" : bias < 0 ? "short" : "none",
    regime,
    stale,
    // key names are historical: `weekly` = the senior story, `daily` = junior
    weekly: { mode: w?.mode ?? null, read: w?.read ?? null },
    daily: { mode: d?.mode ?? null, read: d?.read ?? null },
    targets,
    primary_target: primary?.price ?? null,
    invalidation,
    note,
  };
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // a brief written on the weekend is for the week ahead
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Latest weekly brief on disk (by file name), or null. */
export function loadLatestWeekly(dir = WEEKLY_DIR) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[files.length - 1]), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Group a target ladder into liquidity clusters (docs/MARCO.md §2.1): levels
 * and zone edges within `tol` of each other are one draw — the crowd's stops
 * rest across the whole stack, and three target slots should show three
 * distinct draws, not one cluster three times. Nearest-first from the
 * trader's side; `price` = the near edge (the fill), `far` = the furthest
 * member, `touches` = the sum over distinct members.
 */
export function clusterTargets(list, tol, dir) {
  const sorted = [...(list ?? [])]
    .filter((t) => t && Number.isFinite(t.price))
    .sort((a, b) => (dir > 0 ? a.price - b.price : b.price - a.price));
  const out = [];
  for (const t of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(t.price - last.far) <= tol) {
      if (last.members.some((m) => m.price === t.price)) continue; // the same level seen on both timeframes
      last.far = t.price;
      last.touches += t.touches ?? 1;
      last.members.push(t);
      if (t.kind === "lb") last.kind = "lb";
      if (t.zone) last.zone = last.zone ? [Math.min(last.zone[0], t.zone[0]), Math.max(last.zone[1], t.zone[1])] : t.zone;
      continue;
    }
    out.push({ price: t.price, near: t.price, far: t.price, touches: t.touches ?? 1, kind: t.kind ?? "level", zone: t.zone ?? null, members: [t] });
  }
  return out.map((c) => ({ ...c, price: round(c.price), far: round(c.far), members: c.members.length }));
}

// the intraweek phase note is phrased against the WEEK's bias, not the daily
// (the D-vs-4h regime note said "treat as counter-trend" for a 4h trap that
// was with the week's side — 6B, 2026-09-06)
function intraweekNote(phase, local, dir) {
  const side = dir > 0 ? "long" : "short";
  const r = local.regime;
  if (phase === "aligned") {
    if (r === "aligned") return `daily and 4h agree with the week's ${side} bias — every move against it is false; target the daily liquidity`;
    if (r === "daily_only")
      return `the 4h has printed its trap with the week's ${side} bias while the daily is still continuation the other way — the trigger timeframe agrees, the daily has not turned yet`;
    if (r === "weekly_only") return `the daily trap is in with the week's ${side} bias, the 4h has no story yet — wait for the 4h trigger`;
    if (r === "pullback") return `the 4h trap against the daily is inducement — enter with the daily once the 4h's run is in`;
    if (r === "counter_trend") return `the daily story is stale, the 4h trap sets the local side — with the week's ${side} bias, nearest targets first`;
    return local.note;
  }
  if (phase === "pullback") {
    const how =
      r === "aligned"
        ? "daily and 4h both run against"
        : r === "daily_only"
          ? "the 4h has trapped against"
          : r === "weekly_only"
            ? "the daily has trapped against"
            : "daily/4h lean against";
    return `${how} the week's ${side} bias — a pullback; wait for its run and the reclaim in the bias direction before triggering`;
  }
  if (phase === "no_local_story") return "no trap on the daily or the 4h — the week starts in no-man's land; wait for a run";
  return local.note;
}

/**
 * The intraweek layer of the weekly brief (docs/MARCO.md §3.1), pure: where
 * the week starts inside the global story (D vs 4h), the clustered ladder of
 * reachable targets (nearest D/4h liquidity, ≈Nw in weekly ATRs), triggers on
 * 240/60 with per-trigger targets, and the early-week counter-trend list.
 * `reads` = { W, D, [execTf], "60" } of { bars, map, story }.
 */
export function intraweekLayer(reads, bias, cfg = MARCO_DEFAULTS, { execTf = "240" } = {}) {
  const dir = bias.bias;
  const local = resolveBias(reads.D.story, reads[execTf].story, { senior: "daily", junior: "4h" });
  const watr = atrSeries(reads.W.bars, cfg.atr_length).at(-1) ?? null;
  const price0 = reads.D.story.price;
  const weeks = (level) => (watr ? Math.round((Math.abs(level - price0) / watr) * 10) / 10 : null);
  const nearest = (story, d) => (d > 0 ? story.targets_above : story.targets_below) ?? [];
  const dAtr = atrSeries(reads.D.bars, cfg.atr_length).at(-1) ?? 0;
  const tol = dAtr * cfg.eq_tolerance_atr;
  const ladder = dir
    ? clusterTargets([...nearest(reads.D.story, dir), ...nearest(reads[execTf].story, dir)], tol, dir).map((c) => ({ ...c, atr_weeks: weeks(c.price) }))
    : [];
  const weekTargets = ladder.slice(0, 3);
  const phase = !dir ? "none" : local.bias === dir ? "aligned" : local.bias === 0 ? "no_local_story" : "pullback";
  const intraweek = {
    phase,
    local_regime: local.regime,
    local_read: `D ${local.weekly.mode} / 4h ${local.daily.mode} — ${intraweekNote(phase, local, dir)}`,
    targets: weekTargets,
    ladder,
    primary_target: weekTargets[0]?.price ?? null,
    counter_trend: dir ? triggerSetups(reads["60"].map, reads["60"].bars, cfg, { direction: -dir, max: 2 }) : [],
    counter_trend_note: "Mon–Tue intraday only, nearest target only — the first two sessions usually pull back [user]",
  };
  const triggers = {};
  const false_reactions = {};
  for (const tf of [execTf, "60"]) {
    triggers[tf] = triggerSetups(reads[tf].map, reads[tf].bars, cfg, { direction: dir, targets: ladder });
    false_reactions[tf] = falseReactions(reads[tf].map, reads[tf].story.price, dir);
  }
  return { intraweek, triggers, false_reactions };
}

function fmtLevel(l) {
  if (!l) return "—";
  const kind = l.kind === "lb" ? ` (LB ${l.zone[0]}–${l.zone[1]})` : "";
  const w = l.atr_weeks !== undefined && l.atr_weeks !== null ? ` (≈${l.atr_weeks}w)` : "";
  const span = l.far !== undefined && l.far !== null && l.far !== l.price ? `–${l.far}` : "";
  return `${l.price}${span}${kind}${l.touches > 1 ? ` (x${l.touches})` : ""}${w}`;
}

function fmtTrigger(t) {
  const base =
    t.kind === "tap"
      ? `${t.side} tap LB ${t.stop_anchor[0]}–${t.stop_anchor[1]} at ${t.trigger}${t.confirmed ? " (qualified)" : ""}${t.tapped ? " (tapped before)" : ""}`
      : `${t.side} sweep ${t.side === "long" ? "below" : "above"} ${t.trigger}${t.confirmed ? ` (confirmed x${t.touches})` : " (unconfirmed)"}`;
  if (!t.stop_anchor) return `${base} — ${t.note}`;
  return `${base} → stop ${t.stop}${t.kind === "sweep" ? ` (LB ${t.stop_anchor[0]}–${t.stop_anchor[1]})` : ""} → target ${t.target ?? "—"}${t.rr !== null ? ` → RR ${t.rr}` : ""}${t.note ? ` — ${t.note}` : ""}`;
}

export function renderWeeklyMarkdown(result) {
  const lines = [
    `# Marco weekly brief — ${result.week}`,
    "",
    `Generated ${result.generated_at}. Methodology: docs/MARCO.md §3.1 (global bias: weekly → daily), §4.4 (sweep triggers); two layers per symbol.`,
    "Global layer: the author's weekly→daily story — bias, invalidation and the big targets that will NOT be hit this week (re-evaluated every weekend).",
    "Intraweek layer: where the week starts inside that story (D vs 4h), reachable targets (nearest D/4h liquidity; ≈Nw = distance in weekly ATRs), triggers on 240/60,",
    "and the early-week counter-trend allowance (Mon–Tue intraday, nearest target only) [user calibration]. All thresholds are [CALIBRATION].",
    "",
  ];
  for (const r of result.symbols) {
    if (r.error) {
      lines.push(`## ${r.symbol}`, "", `error: ${r.error}`, "");
      continue;
    }
    const b = r.bias;
    lines.push(`## ${r.symbol} — ${b.bias_word.toUpperCase()} (${b.regime}${b.stale ? ", stale" : ""})`, "");
    lines.push(`- Price: ${r.price}`);
    lines.push(`- Weekly: ${b.weekly.mode} — ${b.weekly.read}`);
    lines.push(`- Daily: ${b.daily.mode} — ${b.daily.read}`);
    lines.push(`- Verdict: ${b.note}`);
    lines.push(`- Global targets (beyond this week — re-evaluate next weekend): ${b.targets.length ? b.targets.map(fmtLevel).join(", ") : "—"}${b.primary_target !== null ? ` — primary ${b.primary_target}` : ""}`);
    lines.push(`- Invalidation: ${b.invalidation ? `${b.invalidation.rule} ${b.invalidation.level}` : "—"}`);
    const iw = r.intraweek;
    if (iw) {
      lines.push(`- Intraweek phase: ${iw.phase} — ${iw.local_read}`);
      lines.push(`- Week targets (reachable): ${iw.targets.length ? iw.targets.map(fmtLevel).join(", ") : "—"}${iw.primary_target !== null ? ` — primary ${iw.primary_target}` : ""}`);
    }
    for (const [tf, trig] of Object.entries(r.triggers)) {
      lines.push(`- Triggers (${tf}), with the bias: ${trig.length ? "" : "none"}`);
      for (const t of trig) lines.push(`  - ${fmtTrigger(t)}`);
    }
    if (iw?.counter_trend?.length) {
      lines.push(`- Early-week counter-trend (${iw.counter_trend_note}):`);
      for (const t of iw.counter_trend) lines.push(`  - ${fmtTrigger(t)}`);
    }
    for (const [tf, fr] of Object.entries(r.false_reactions ?? {})) {
      if (!fr.length) continue;
      lines.push(
        `- False reactions (${tf}), not entries: ${fr.map((z) => `${z.side} LB ${z.zone[0]}–${z.zone[1]}${z.qualified ? " Q" : ""}`).join("; ")} — expect the pullback to start there and look for the ${r.bias.bias_word} setup after it`,
      );
    }
    if (r.htf_zones.length) {
      lines.push(`- HTF zones: ${r.htf_zones.map((z) => `${z.tf} ${z.side} ${z.zone[0]}–${z.zone[1]}${z.qualified ? " Q" : ""}${z.tapped ? " tapped" : ""}`).join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function runMarcoWeekly({ rules_path, symbols, out_dir } = {}) {
  let rules = {};
  try {
    rules = loadRules(rules_path).rules;
  } catch {
    /* optional */
  }
  const cfg = mergeConfig(rules);
  const watchlist = symbols?.length ? symbols : loadWatchlist(cfg.watchlist_section).watchlist;
  const execTf = cfg.htf?.timeframe ?? "240";

  let originalSymbol;
  let originalTimeframe;
  try {
    const state = await chart.getState();
    originalSymbol = state.symbol;
    originalTimeframe = state.resolution;
  } catch {
    /* nicety */
  }

  const results = [];
  for (const symbol of watchlist) {
    try {
      await chart.setSymbol({ symbol });
      await sleep(900);
      const reads = {};
      for (const tf of ["W", "D", execTf, "60"]) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);
        const { bars } = await data.getOhlcv({ count: 500 });
        // HTF feed: the daily inherits the weekly's intact levels, the
        // 4h/1h inherit the daily's (docs/MARCO.md §2.1)
        const src = tf === "D" ? reads.W : tf === "W" ? null : reads.D;
        const seed = src ? seedFromMap(src.map, src.bars, { before: bars[0]?.time, price: bars.at(-1)?.close, cfg }) : null;
        const map = buildLiquidityMap(bars, cfg, { seed });
        reads[tf] = { bars, map, story: storyRead(map, bars, cfg) };
      }
      // two layers [user, 2026-09-02]: the GLOBAL bias is the author's
      // weekly→daily read (§3.1) with the big targets that will not be hit
      // this week — recorded and re-evaluated every weekend. The INTRAWEEK
      // layer says where inside that story the week starts (D vs 4h),
      // lists reachable targets (nearest D/4h liquidity, ≈Nw in weekly
      // ATRs), the triggers in the global direction, and the early-week
      // counter-trend allowance (the first two sessions usually pull back —
      // intraday, nearest target only).
      const bias = resolveBias(reads.W.story, reads.D.story);
      const watr = atrSeries(reads.W.bars, cfg.atr_length).at(-1) ?? null;
      const price0 = reads.D.story.price;
      const weeks = (level) => (watr ? Math.round((Math.abs(level - price0) / watr) * 10) / 10 : null);
      for (const t of bias.targets) t.atr_weeks = weeks(t.price);
      const { intraweek, triggers, false_reactions } = intraweekLayer(reads, bias, cfg, { execTf });
      const price = reads.D.story.price;
      const htf_zones = ["W", "D"]
        .flatMap((tf) =>
          reads[tf].map.blocks
            .filter((b) => !b.dead)
            .map((b) => ({
              tf,
              side: b.side,
              zone: [round(b.bot), round(b.top)],
              qualified: b.qualified,
              tapped: b.tapped,
              distance: round(price > b.top ? price - b.top : price < b.bot ? b.bot - price : 0),
            })),
        )
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);
      results.push({ symbol, price, bias, intraweek, triggers, false_reactions, htf_zones });
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
    /* best effort */
  }

  const result = {
    week: isoWeek(),
    generated_at: new Date().toISOString(),
    methodology: "docs/MARCO.md §3.1 (global bias W→D) + intraweek layer (D/4h phase, reachable targets, 240/60 triggers, early-week counter-trend) / §4.4",
    symbols: results,
  };
  const dir = out_dir ? resolve(out_dir) : WEEKLY_DIR;
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `${result.week}.json`);
  const mdPath = join(dir, `${result.week}.md`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  writeFileSync(mdPath, renderWeeklyMarkdown(result));
  return { ...result, files: { json: jsonPath, markdown: mdPath } };
}

export function compactMarcoWeekly(result) {
  return {
    week: result.week,
    files: result.files,
    symbols: result.symbols.map((r) =>
      r.error
        ? { symbol: r.symbol, error: r.error }
        : {
            symbol: r.symbol,
            bias: `${r.bias.bias_word} (${r.bias.regime})`,
            primary_target: r.bias.primary_target,
            intraweek: r.intraweek
              ? {
                  phase: r.intraweek.phase,
                  week_target: r.intraweek.primary_target,
                  counter_trend: r.intraweek.counter_trend[0] ? fmtTrigger(r.intraweek.counter_trend[0]) : "none",
                }
              : null,
            invalidation: r.bias.invalidation,
            next_trigger: Object.fromEntries(
              Object.entries(r.triggers).map(([tf, t]) => [tf, t[0] ? fmtTrigger(t[0]) : "none"]),
            ),
          },
    ),
  };
}

function alignmentOf(storyDirection, bias) {
  if (!bias || !storyDirection) return "none";
  return storyDirection === bias ? "aligned" : "against";
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

export async function runMarcoBrief({ rules_path, symbols, timeframes, bias } = {}) {
  let rules = {};
  let loadedFrom = null;
  try {
    const r = loadRules(rules_path);
    rules = r.rules;
    loadedFrom = r.path;
  } catch {
    // rules.json is optional on this branch — defaults are fine
  }
  // --bias: weekly (default — the latest weekly brief) | long | short | off
  // (no bias, the analyst decides) | trap | draw (this TF's own story source)
  const biasOpt = String(bias ?? "weekly").toLowerCase();
  const manualBias = biasOpt === "long" ? 1 : biasOpt === "short" ? -1 : biasOpt === "off" ? 0 : null;
  const cfg0 = mergeConfig(rules);
  const cfg = biasOpt === "trap" || biasOpt === "draw" ? { ...cfg0, bias_source: biasOpt } : cfg0;
  const useWeekly = biasOpt === "weekly";
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

  const weekly = loadLatestWeekly();
  const weeklyFor = (symbol) => weekly?.symbols?.find((s) => s.symbol === symbol && !s.error) ?? null;

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
      const wk = weeklyFor(symbol);
      const htfMap = htfBars ? buildLiquidityMap(htfBars, cfg) : null;
      for (const tf of tfs) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);
        const { bars } = await data.getOhlcv({ count: cfg.bars_to_fetch, max: cfg.bars_to_fetch });
        const read = analyzeMarco(bars, cfg, {
          bias: manualBias !== null ? manualBias : useWeekly ? wk?.bias?.bias || null : null,
          seed: htfMap ? seedFromMap(htfMap, htfBars, { before: bars[0]?.time, price: bars.at(-1)?.close, cfg }) : null,
        });
        if (!read.error && htfBars) read.htf = htfContext(htfBars, read.last_price, cfg);
        if (!read.error && wk) {
          read.alignment = alignmentOf(read.story.direction, wk.bias.bias);
          if (read.alignment === "against") {
            read.story.read += ` [AGAINST the week's ${wk.bias.bias_word} bias — a false move, use it to enter with the bias]`;
          } else if (read.alignment === "aligned") {
            read.story.read += ` [aligned with the week's ${wk.bias.bias_word} bias${wk.bias.primary_target !== null ? `, HTF target ${wk.bias.primary_target}` : ""}]`;
          }
        }
        perTf[tf] = read;
      }
      const quote = await data.getQuote({});
      results.push({
        symbol,
        quote,
        weekly: wk
          ? { week: weekly.week, bias: wk.bias.bias_word, regime: wk.bias.regime, primary_target: wk.bias.primary_target, invalidation: wk.bias.invalidation }
          : null,
        timeframes: perTf,
      });
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

/**
 * Attach the dollar risk of one contract to each trigger, and flag the ones
 * the per-trade cap rules out. A symbol with no verified contract spec gets
 * `risk_usd: null` and says so — never a guessed figure, because the cap is
 * what decides whether a setup is takeable at all (docs/MARCO.md §5).
 */
function attachRisk(triggers, spec, cap) {
  if (!Array.isArray(triggers)) return triggers;
  for (const t of triggers) {
    if (!spec) {
      t.risk_usd = null;
      t.over_cap = null;
      t.risk_note = "no contract spec — risk not computed";
    } else if (t.stop == null || t.trigger == null) {
      t.risk_usd = null;
      t.over_cap = null;
      t.risk_note = "no stop anchor — risk not computable";
    } else {
      t.risk_usd = round(Math.abs(t.trigger - t.stop) * spec.usd_per_point);
      t.over_cap = cap != null && t.risk_usd > cap;
      if (t.over_cap) {
        t.risk_note =
          `$${t.risk_usd} > cap $${cap} at size 1 — refine the entry on a lower-TF LB or pass; never resize the stop`;
      }
    }
  }
  return triggers;
}

/**
 * The daily morning run (docs/MARCO.md — "the weekend sets direction, the
 * morning sets the setup", 2026-09-09). Direction comes from the weekend
 * brief; everything actionable — triggers, stops, RR, dollar risk, the cap
 * check, the 10am gate — is computed live on Marco's own cascade the
 * morning it is used. Counter-trend triggers appear on Monday and Tuesday
 * only, because that is when the allowance is live.
 */
export async function runMarcoDaily({ rules_path, symbols, timeframes, today } = {}) {
  let rules = {};
  try {
    rules = loadRules(rules_path).rules;
  } catch {
    /* rules.json is optional — defaults are fine */
  }
  const cfg = mergeConfig(rules);
  const { contracts, path: contractsPath } = loadContracts();
  const tfs = timeframes?.length ? timeframes : cfg.daily_timeframes;
  const watchlist = symbols?.length ? symbols : loadWatchlist(cfg.watchlist_section).watchlist;
  if (!watchlist.length) {
    throw new Error(`watchlists.json "${cfg.watchlist_section}" is empty. Add at least one symbol.`);
  }

  const now = today ? new Date(today) : new Date();
  const dow = now.getDay(); // 0 Sun … 6 Sat
  const counterOk = dow === 1 || dow === 2;

  const weekly = loadLatestWeekly();
  if (!weekly) {
    throw new Error(
      "No weekly brief found in briefs/weekly/. The daily run takes its direction from the weekend brief — generate it first.",
    );
  }
  const weeklyFor = (symbol) => weekly?.symbols?.find((s) => s.symbol === symbol && !s.error) ?? null;

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
      const wk = weeklyFor(symbol);
      if (!wk) {
        results.push({ symbol, skipped: `not in the ${weekly.week} weekly brief — no direction to trade from` });
        continue;
      }
      const spec = contractSpec(contracts, symbol);
      await chart.setSymbol({ symbol });
      await sleep(900);

      const perTf = {};
      let htfBars = null;
      let short = null;

      for (const tf of tfs) {
        await chart.setTimeframe({ timeframe: tf });
        await sleep(900);

        // A key timeframe that comes up short is usually still loading:
        // wait and refetch before failing. Depth is never annotated away —
        // either the analysis stands on enough bars or it is not produced.
        const isKey = (cfg.key_timeframes ?? []).map(String).includes(String(tf));
        const need = cfg.min_bars?.[tf] ?? 0;
        let bars = (await data.getOhlcv({ count: cfg.bars_to_fetch, max: cfg.bars_to_fetch })).bars;
        for (let i = 0; isKey && bars.length < need && i < (cfg.history_retries ?? 0); i++) {
          await sleep(cfg.history_retry_ms ?? 1500);
          bars = (await data.getOhlcv({ count: cfg.bars_to_fetch, max: cfg.bars_to_fetch })).bars;
        }
        if (bars.length < need) {
          if (isKey) {
            short = `${tf}m has ${bars.length} bars, needs ${need} — the chart has not loaded enough history for a trustworthy read`;
            break;
          }
          perTf[tf] = { error: `insufficient history: ${bars.length} bars, needs ${need}` };
          continue;
        }

        if (tf === String(cfg.htf?.timeframe)) htfBars = bars;
        const htfMap = htfBars ? buildLiquidityMap(htfBars, cfg) : null;
        const read = analyzeMarco(bars, cfg, {
          bias: wk.bias.bias || null,
          counter: counterOk,
          seed:
            htfMap && tf !== String(cfg.htf?.timeframe)
              ? seedFromMap(htfMap, htfBars, { before: bars[0]?.time, price: bars.at(-1)?.close, cfg })
              : null,
        });
        if (!read.error) {
          read.bars_analyzed = bars.length;
          attachRisk(read.triggers, spec, cfg.max_risk_per_trade);
          attachRisk(read.counter_triggers, spec, cfg.max_risk_per_trade);
          read.alignment = alignmentOf(read.story.direction, wk.bias.bias);
        }
        perTf[tf] = read;
      }

      if (short) {
        results.push({ symbol, error: short });
        continue;
      }

      const quote = await data.getQuote({});
      results.push({
        symbol,
        quote,
        contract: spec ? { usd_per_point: spec.usd_per_point, journal: spec.journal } : null,
        weekly: {
          week: weekly.week,
          bias: wk.bias.bias_word,
          regime: wk.bias.regime,
          invalidation: wk.bias.invalidation,
          primary_target: wk.bias.primary_target,
        },
        timeframes: perTf,
      });
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
    trading_day: now.toISOString().slice(0, 10),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow],
    counter_trend_open: counterOk,
    counter_trend_note: counterOk
      ? "Mon–Tue intraday only, nearest target only, never held against the global bias — occupies a concurrent slot"
      : "closed — counter-trend entries are Mon–Tue only",
    direction_from: `briefs/weekly/${weekly.week} (global layer)`,
    risk_cap: cfg.max_risk_per_trade,
    contracts_path: contractsPath,
    methodology: "docs/MARCO.md — Accettone liquidity blocks",
    results,
  };
}

export function compactMarcoBrief(brief) {
  return {
    instruction:
      "Render one compact block per symbol/timeframe: the story line first " +
      "(mode + read — liquidity is the priority), then LB rows (side, role, zone, " +
      "qualified, inducement, tapped, stop_beyond), then intact liquidity with touch " +
      "counts and build-ups (equal highs/lows with xN taps — the local targets; " +
      "swept ones name the LB they produced), then the 10 a.m. H4 line when available. All thresholds are " +
      "[CALIBRATION] (docs/MARCO.md §6) — never present them as Accettone's.",
    generated_at: brief.generated_at,
    symbols: brief.results.map((r) =>
      r.error
        ? { symbol: r.symbol, error: r.error }
        : {
            symbol: r.symbol,
            price: r.quote?.last ?? null,
            weekly: r.weekly ?? null,
            timeframes: Object.fromEntries(
              Object.entries(r.timeframes).map(([tf, t]) => [
                tf,
                t.error
                  ? { error: t.error }
                  : {
                      story: `${t.story.mode}: ${t.story.read}`,
                      draw: t.story.draw?.read ?? null,
                      alignment: t.alignment ?? null,
                      bias_used: t.bias_used,
                      bias_source: t.bias_source,
                      triggers: t.triggers,
                      false_reactions: t.false_reactions,
                      blocks: t.blocks,
                      intact_above: t.liquidity.intact_above.slice(0, 4),
                      intact_below: t.liquidity.intact_below.slice(0, 4),
                      buildups: t.liquidity.buildups ?? [],
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

/**
 * Compact render of the daily run — one block per symbol, each trigger on
 * its own line with the entry model, stop, dollar risk and RR, so a line
 * maps straight onto a journal setup rung (see the K-indexed format in
 * .claude/skills/journal-weekly-plan/SKILL.md).
 */
export function compactMarcoDaily(daily) {
  const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const money = (g) =>
    g.risk_usd == null ? g.risk_note ?? "risk n/a" : `$${Math.round(g.risk_usd)}${g.over_cap ? " ⚠ OVER CAP" : ""}`;
  const trig = (g) => {
    const where =
      g.kind === "tap"
        ? `tap ${g.trigger} (LB ${g.stop_anchor?.[0]}–${g.stop_anchor?.[1]})`
        : `sweep ${g.side === "long" ? "<" : ">"} ${g.trigger}${g.confirmed ? ` x${g.touches}` : " unconf"}`;
    if (g.stop == null) return `      ${g.side} ${where} — no stop anchor, not takeable`;
    const flags = [g.confirmed && g.kind === "tap" ? "Q" : null, g.tapped ? "tapped" : null].filter(Boolean).join(" ");
    return `      ${g.side} ${where}${flags ? ` [${flags}]` : ""} · stop ${g.stop} · T ${g.target ?? "—"} · RR ${r2(g.rr) ?? "—"} · ${money(g)}`;
  };

  const out = [
    `Marco daily — ${daily.trading_day} (${daily.weekday})`,
    `Direction from ${daily.direction_from} · risk cap $${daily.risk_cap} at size 1`,
    `Counter-trend: ${daily.counter_trend_note}`,
    "",
  ];

  for (const r of daily.results) {
    if (r.skipped) { out.push(`## ${r.symbol} — skipped: ${r.skipped}`, ""); continue; }
    if (r.error) { out.push(`## ${r.symbol} — ERROR: ${r.error}`, ""); continue; }
    const inv = r.weekly.invalidation;
    out.push(`## ${r.symbol}${r.contract ? ` (${r.contract.journal})` : ""} — ${r.quote?.last ?? "?"}`);
    out.push(`   W ${r.weekly.bias}/${r.weekly.regime}${inv ? ` · inval ${inv.level} ${inv.rule}` : ""}${r.contract ? "" : " · ⚠ NO CONTRACT SPEC — no dollar risk"}`);

    // The 10am gate is a property of the symbol, not of each timeframe.
    const gate = Object.values(r.timeframes).map((t) => t.h4_model).find((h) => h?.available);
    if (gate) {
      out.push(`   H4 gate (${gate.h4_date}, ${gate.phase}): H ${gate.h4_high} / L ${gate.h4_low}`);
      out.push(`     longs: ${gate.longs}`);
      out.push(`     shorts: ${gate.shorts}`);
      if (gate.note) out.push(`     ${gate.note}`);
    }

    for (const [tf, t] of Object.entries(r.timeframes)) {
      if (t.error) { out.push(`   ${tf}: ${t.error}`); continue; }
      const story = t.story.read.split(" — ")[0];
      out.push(`   ${tf} · ${t.bars_analyzed} bars · ${t.alignment} · ${story}`);
      for (const g of t.triggers ?? []) out.push(trig(g));
      if (t.counter_triggers?.length) {
        out.push(`     counter-trend (allowance open today):`);
        for (const g of t.counter_triggers) out.push(trig(g));
      }
    }
    out.push("");
  }
  return out.join("\n");
}
