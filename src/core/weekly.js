/**
 * Weekly (next-week) planning brief.
 * Run on the weekend to lay out the structural picture for the upcoming
 * trading week. Mirrors morning.js but trims to M/W/D/4H, drops H1 and any
 * execution-tuned framing (no entries, no ATR-based stops, no POI-as-entry),
 * and instead produces:
 *   - a probable-week-range (ceiling / floor with bounce-vs-break call)
 *   - per-symbol bull/bear scenarios with invalidation
 *   - a Mon–Fri high-impact news calendar
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as chart from "./chart.js";
import * as data from "./data.js";
import { loadRules, getWatchlistSymbols } from "./config.js";
import { fetchWeekHighImpact, nextMondayInZone } from "./calendar.js";
import { runPreflight, buildPreflightInstruction } from "./preflight.js";

const SESSIONS_DIR = join(homedir(), ".tradingview-mcp", "sessions");

const TF_SWITCH_DELAY = 1500;

/**
 * Weekly scan: M / W / D for bias + structural levels, 4H for "where in the
 * week will setups likely form" framing only. No H1.
 */
const SCAN_TIMEFRAMES = [
  { key: "monthly", tf: "M",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "weekly",  tf: "W",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "daily",   tf: "D",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "h4",      tf: "240", bars: 0, fvg: true, labels: true, study_values: true, fractals: true },
];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scanTimeframe(config) {
  await chart.setTimeframe({ timeframe: config.tf });
  await delay(TF_SWITCH_DELAY);

  const promises = [];
  const keys = [];

  if (config.bars > 0) {
    keys.push("bars");
    promises.push(
      data.getOhlcv({ count: config.bars }).then((r) => r.bars || []).catch(() => [])
    );
  }

  if (config.fvg) {
    keys.push("fvg_zones");
    promises.push(
      data.getPineBoxes({ study_filter: "fair value" })
        .then((r) => {
          const study = r.studies?.[0];
          return study?.zones || [];
        })
        .catch(() => [])
    );
  }

  if (config.labels) {
    keys.push("labels");
    promises.push(
      data.getPineLabels({ max_labels: 30 })
        .then((r) => {
          const allLabels = [];
          for (const s of r.studies || []) {
            for (const l of s.labels || []) {
              allLabels.push(l);
            }
          }
          return allLabels;
        })
        .catch(() => [])
    );
  }

  if (config.study_values) {
    keys.push("study_values");
    promises.push(
      data.getStudyValues()
        .then((r) => {
          const parsed = {};
          for (const study of r.studies || []) {
            const nameLower = study.name.toLowerCase();
            if (nameLower.includes("fair value") || nameLower.includes("fvg")) {
              parsed.fvg = {};
              for (const [k, v] of Object.entries(study.values)) {
                const num = parseFloat(String(v).replace(/,/g, ""));
                if (!isNaN(num)) parsed.fvg[k] = num;
              }
              const parseFVGs = (prefix) => {
                const zones = [];
                for (let i = 1; i <= 3; i++) {
                  let top = NaN, bot = NaN, time = NaN;
                  for (const [k, v] of Object.entries(study.values)) {
                    const kl = k.toLowerCase();
                    const num = parseFloat(String(v).replace(/,/g, ""));
                    if (kl.includes(`${prefix} fvg ${i} top`)) top = num;
                    if (kl.includes(`${prefix} fvg ${i} bot`)) bot = num;
                    if (kl.includes(`${prefix} fvg ${i} time`)) time = num;
                  }
                  if (!isNaN(top) && !isNaN(bot)) {
                    const zone = { top, bot };
                    if (!isNaN(time)) zone.formed = new Date(time).toISOString().split("T")[0];
                    zones.push(zone);
                  }
                }
                return zones;
              };
              parsed.fvg_bull = parseFVGs("bull");
              parsed.fvg_bear = parseFVGs("bear");
            }
          }
          return parsed;
        })
        .catch(() => ({}))
    );
  }

  if (config.fractals) {
    keys.push("naked_fractals");
    promises.push(
      data.getPineLabels({ study_filter: "0x Fractals", max_labels: 100 })
        .then((r) => {
          const out = { highs: [], lows: [] };
          for (const s of r.studies || []) {
            for (const lb of s.labels || []) {
              const text = String(lb.text || "");
              const m = text.match(/^(NFH|NFL)\s+([0-9]*\.?[0-9]+)/);
              if (!m) continue;
              const price = parseFloat(m[2]);
              if (isNaN(price)) continue;
              if (m[1] === "NFH") out.highs.push(price);
              else out.lows.push(price);
            }
          }
          out.highs = [...new Set(out.highs)].sort((a, b) => a - b);
          out.lows  = [...new Set(out.lows)].sort((a, b) => a - b);
          return out;
        })
        .catch(() => ({ highs: [], lows: [] }))
    );
  }

  const results = await Promise.all(promises);
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = results[i];
  }

  return out;
}

export async function runWeeklyBrief({
  rules_path,
  watchlist: watchlistName,
  skip_preflight = false,
} = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const { name: resolvedName, symbols: watchlist, available } = getWatchlistSymbols(
    rules,
    watchlistName,
  );

  if (!watchlist.length) {
    throw new Error(
      `rules.json watchlist "${resolvedName}" is empty. Add at least one symbol to it.` +
        (available.length > 1 ? ` Available: ${available.join(", ")}` : ""),
    );
  }

  let preflight = null;
  let calendarResult = null;
  if (!skip_preflight) {
    preflight = await runPreflight({ rules, calendarMode: "week" });
    calendarResult = preflight.calendar._success
      ? {
          success: true,
          events: preflight.calendar._events,
          by_day: preflight.calendar._by_day,
          week_start: preflight.calendar.week_start,
          timezone: preflight.calendar.timezone,
        }
      : {
          success: false,
          events: [],
          by_day: {},
          week_start: preflight.calendar.week_start,
          timezone: preflight.calendar.timezone,
          error: preflight.calendar.error,
        };

    if (!preflight.ok) {
      return {
        success: false,
        preflight_failed: true,
        generated_at: new Date().toISOString(),
        rules_loaded_from: loadedFrom,
        watchlist: { name: resolvedName, available },
        preflight: {
          ok: preflight.ok,
          indicators: preflight.indicators,
          calendar: {
            ok: preflight.calendar.ok,
            currencies: preflight.calendar.currencies,
            timezone: preflight.calendar.timezone,
            week_start: preflight.calendar.week_start,
            event_count: preflight.calendar.event_count,
            error: preflight.calendar.error,
          },
          issues: preflight.issues,
          blocker_count: preflight.blocker_count,
          warning_count: preflight.warning_count,
        },
        instruction: buildPreflightInstruction(preflight, "weekly_brief"),
      };
    }
  }

  const calendarCfg = rules.calendar || {};
  const calendarPromise = calendarResult
    ? Promise.resolve(calendarResult)
    : fetchWeekHighImpact({
        currencies: calendarCfg.currencies || ["USD", "EUR"],
        timezone: calendarCfg.timezone || "Europe/Athens",
      });

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
      await delay(TF_SWITCH_DELAY);

      const symbolData = { symbol };

      for (const config of SCAN_TIMEFRAMES) {
        symbolData[config.key] = await scanTimeframe(config);
      }

      try {
        symbolData.quote = await data.getQuote({});
      } catch (_) {
        symbolData.quote = null;
      }

      results.push(symbolData);
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

  const calendar = await calendarPromise;
  const weekStart =
    calendar.week_start ||
    nextMondayInZone(new Date(), calendarCfg.timezone || "Europe/Athens");

  return {
    success: true,
    generated_at: new Date().toISOString(),
    week_start: weekStart,
    rules_loaded_from: loadedFrom,
    watchlist: {
      name: resolvedName,
      available,
    },
    rules: {
      bias_model: rules.bias_model || null,
      risk_rules: rules.risk_rules || null,
      notes: rules.notes || null,
    },
    calendar,
    symbols_scanned: results,
    instruction: buildInstruction(),
  };
}

function buildInstruction() {
  return [
    "WEEKLY PLANNING BRIEF — Big-picture structure for the upcoming trading week. NO entries, NO triggers, NO ATR-based stop sizing. This brief is for THESIS + LEVELS + SCENARIOS only — execution decisions belong to the morning brief.\n",

    "STEP 1 — MONTHLY BIAS (FVG Context + 3-Bar Formation):",
    "A) FVG Context: Use monthly.study_values.fvg_bull / fvg_bear (last 3 each, most-recent first), supplemented by monthly.fvg_zones.",
    "   Monthly FVGs define the multi-month regime. Note which sit above vs. below price — these are the largest-scale draws.",
    "B) 3-Bar Formation on monthly.bars (oldest→newest = bar1, bar2, bar3-current):",
    "   - REVERSAL: bar2 sweeps bar1 high but closes below → bearish reversal expected; sweeps low but closes above → bullish reversal.",
    "   - CONTINUATION: bar2 sweeps AND closes beyond bar1's high/low → continuation in that direction.",
    "C) Combine → Monthly Bias: BULLISH / BEARISH / NEUTRAL. Top-of-stack context.\n",

    "STEP 2 — WEEKLY BIAS (FVG Context + 3-Bar Formation):",
    "Apply the same FVG + 3-bar logic on weekly.* data. Read in the context of monthly bias — if weekly conflicts with monthly, the weekly move is counter-trend / retracement.\n",

    "STEP 3 — DAILY BIAS (FVG Context + 3-Bar Formation):",
    "Apply same logic on daily.* data. Daily must align with weekly (which itself is subordinate to monthly). Conflicts → mark NEUTRAL or note explicitly.\n",

    "STEP 4 — MULTI-TIMEFRAME FVG CONFLUENCE:",
    "Cross-reference last 3 bull/bear FVGs across M/W/D/4H to find overlapping zones (one zone's top > the other's bottom AND vice versa).",
    "  - 2 TFs overlap = CONFLUENCE ZONE.",
    "  - 3+ TFs overlap = HIGH CONFLUENCE — major structural level.",
    "  - Any confluence including the monthly zone is the strongest possible — flag explicitly.",
    "  - Report only confluences within roughly 2× weekly range of current price.\n",

    "STEP 5 — KEY LIQUIDITY (Naked Fractals on M, W, D):",
    "Read monthly.naked_fractals, weekly.naked_fractals, daily.naked_fractals — pivot highs/lows over ~100 bars not yet swept.",
    "  - UPPER liquidity per TF: closest naked fractal HIGH > current price.",
    "  - LOWER liquidity per TF: closest naked fractal LOW < current price.",
    "  - These are the draw-on-liquidity targets next week. Monthly outranks weekly outranks daily.\n",

    "STEP 6 — 4H STRUCTURE NOTE (framing only — NO entries):",
    "Use h4.fvg_zones / h4.study_values.fvg_bull / fvg_bear / h4.naked_fractals to identify the 4H zone where intra-week setups will most plausibly form.",
    "Express as a price ZONE (range), not a trigger. Examples: \"4H bull FVG at <range> aligns with W upper liquidity → likely setup region for shorts mid-week.\"",
    "Do NOT recommend entries, stops, or targets. This step is purely \"where on the 4H map will the morning brief most likely fire next week.\"\n",

    "STEP 7 — PROBABLE WEEK RANGE (Ceiling / Floor with Bounce-vs-Break call):",
    "Build the most-probable price envelope for the upcoming week using ONLY data already collected.",
    "",
    "A) Pool candidates ABOVE current price:",
    "   - Closest naked fractal HIGH from each of M, W, D",
    "   - Bottom edge of the closest unmitigated bear FVG above price (across M/W/D/4H)",
    "   - Any multi-TF FVG confluence zone above price (Step 4)",
    "B) Pool candidates BELOW current price (same logic, mirrored):",
    "   - Closest naked fractal LOW from each of M, W, D",
    "   - Top edge of the closest unmitigated bull FVG below price",
    "   - Any multi-TF FVG confluence zone below price",
    "",
    "C) PRIMARY CEILING = the closest candidate above price. PRIMARY FLOOR = the closest below.",
    "   Note its TYPE (M/W/D naked high|low, bull|bear FVG edge, or confluence zone) and the source TF(s).",
    "",
    "D) BOUNCE vs. BREAK call — state explicitly so the call is auditable:",
    "   - BOUNCE-LIKELY when the level: sits inside or coincides with a multi-TF FVG confluence; OR aligns with a higher-TF naked fractal (M > W > D);",
    "     OR opposes the overall bias direction (i.e. a ceiling against bullish bias is more likely to break, but a floor against bullish bias is more likely to hold).",
    "   - BREAK-LIKELY when the level: is a single-TF naked fractal with no FVG confluence; OR is counter-trend to monthly bias;",
    "     OR has already been tested with wicks (visible in labels / 3-bar formation as a sweep that failed to close beyond).",
    "   Always include a 1-clause WHY (e.g. \"bounce-likely — coincides with M+W bull FVG confluence\").",
    "",
    "E) SECONDARY level — only when primary is BREAK-LIKELY: report the next candidate behind it as the likely extension target.",
    "",
    "Frame this as the WEEK envelope: where price most plausibly STOPS, where it most plausibly PUNCHES THROUGH, and what's behind it if it does. No entries, no stops.\n",

    "STEP 8 — WEEK-AHEAD SCENARIO (Bull case / Bear case / Invalidation):",
    "For each symbol, write two short scenarios:",
    "  - BULL CASE → 1 sentence: what price action would confirm bullish; INVALIDATION: a single price below which the bull case is dead.",
    "  - BEAR CASE → mirror.",
    "Invalidation prices should be drawn from KEY LIQUIDITY or FVG edges — not arbitrary numbers.\n",

    "STEP 0 — KEY EVENTS NEXT WEEK (render BEFORE any symbol blocks):",
    "Use `calendar.by_day` — high-impact (red-folder, 3-star) events for USD/EUR grouped by Mon..Fri.",
    "If `calendar.success` is false OR every day's event list is empty, print: `CALENDAR: none / unavailable` and move on.",
    "Otherwise, render grouped by weekday in local time (calendar.timezone):",
    "  KEY EVENTS NEXT WEEK ({calendar.week_start}, {calendar.timezone}):",
    "    Mon DD-MM:  HH:MM CCY Title  (f: forecast / p: previous)",
    "    Tue DD-MM:  ...",
    "    (omit days with no events)",
    "Keep each event to one line. No commentary.\n",

    "OUTPUT FORMAT — for each symbol:",
    "SYMBOL | M BIAS: [bullish/bearish/neutral] (reason) | W BIAS: [...] | D BIAS: [...] | OVERALL: [...]",
    "3-BAR M: [reversal/continuation/none] — describe",
    "3-BAR W: [reversal/continuation/none] — describe",
    "3-BAR D: [reversal/continuation/none] — describe",
    "M FVGs BULL: [#1 top–bot | #2 | #3]",
    "M FVGs BEAR: [#1 top–bot | #2 | #3]",
    "W FVGs BULL: [...]   W FVGs BEAR: [...]",
    "D FVGs BULL: [...]   D FVGs BEAR: [...]",
    "FVG CONFLUENCE: [list zones near price with TFs and overlap range, or 'none near price'; flag any that include M]",
    "KEY LIQUIDITY: [M upper/lower | W upper/lower | D upper/lower] (omit empty sides)",
    "4H STRUCTURE NOTE: <zone where intra-week setups will most plausibly form — purely framing, no triggers>",
    "",
    "PROBABLE WEEK RANGE:",
    "  CEILING:  <price> — <type & source TF>",
    "            reaction: <BOUNCE-likely | BREAK-likely> — <why in 1 clause>",
    "  FLOOR:    <price> — <type & source TF>",
    "            reaction: <BOUNCE-likely | BREAK-likely> — <why in 1 clause>",
    "  Secondary ceiling (if primary BREAK-likely): <price> — <type>",
    "  Secondary floor   (if primary BREAK-likely): <price> — <type>",
    "",
    "WEEK-AHEAD SCENARIO:",
    "  BULL CASE → <1 sentence>; invalidation: <price>",
    "  BEAR CASE → <1 sentence>; invalidation: <price>",
    "",
    "End with a one-paragraph cross-watchlist read: where does monthly/weekly bias align across symbols, which symbols are at structural inflection points, what's the dominant theme for the week. Be direct. No preamble.",
  ].join("\n");
}

function sessionFilename(weekStart) {
  return `weekly_brief_${weekStart}.json`;
}

export function saveWeeklySession({ brief, week_start } = {}) {
  mkdirSync(SESSIONS_DIR, { recursive: true });

  const ws =
    week_start || nextMondayInZone(new Date(), "Europe/Athens");
  const filePath = join(SESSIONS_DIR, sessionFilename(ws));

  const existing = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};
  const record = {
    ...existing,
    week_start: ws,
    saved_at: new Date().toISOString(),
    brief,
  };

  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return { success: true, path: filePath, week_start: ws };
}

export function getWeeklySession({ week_start } = {}) {
  const ws =
    week_start || nextMondayInZone(new Date(), "Europe/Athens");
  const filePath = join(SESSIONS_DIR, sessionFilename(ws));

  if (existsSync(filePath)) {
    return { success: true, ...JSON.parse(readFileSync(filePath, "utf8")) };
  }

  return {
    success: false,
    error: `No weekly session found for week starting ${ws}`,
    sessions_dir: SESSIONS_DIR,
  };
}
