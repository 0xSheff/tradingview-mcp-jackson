/**
 * Morning brief core logic.
 * Reads rules.json, scans watchlist symbols across multiple timeframes
 * (M/W/D/H4/H1), collects FVG zones, OHLCV bars for 3-bar formation on
 * M/W/D, and naked fractal levels, then returns structured data for Claude
 * to apply the BIAS methodology.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as chart from "./chart.js";
import * as data from "./data.js";
import { loadRules, getWatchlistSymbols } from "./config.js";

const SESSIONS_DIR = join(homedir(), ".tradingview-mcp", "sessions");

const TF_SWITCH_DELAY = 1500;

/**
 * Timeframe scan configuration.
 * bars:          OHLCV bars to fetch (for 3-bar formation on W and D)
 * fvg:           read FVG pine boxes
 * labels:        read pine labels (BSL/SSL/liquidity levels)
 * study_values:  read indicator plot outputs (FVG Top/Bot, ATR)
 * fractals:      read naked fractals from "0x Fractals Advanced"
 *                (W/D → liquidity levels; H4/H1 → POI)
 */
const SCAN_TIMEFRAMES = [
  { key: "monthly", tf: "M",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "weekly",  tf: "W",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "daily",   tf: "D",   bars: 3, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "h4",      tf: "240", bars: 0, fvg: true, labels: true, study_values: true, fractals: true },
  { key: "h1",      tf: "60",  bars: 0, fvg: true, labels: true, study_values: true, fractals: true },
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
              // Parse last 3 bullish and 3 bearish FVGs from numbered plots
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
            if (nameLower.includes("average true range") || nameLower === "atr") {
              for (const [k, v] of Object.entries(study.values)) {
                const num = parseFloat(String(v).replace(/,/g, ""));
                if (!isNaN(num)) {
                  parsed.atr = num;
                  break;
                }
              }
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
              // Label format: "NFH <price>" or "NFL <price>"
              const m = text.match(/^(NFH|NFL)\s+([0-9]*\.?[0-9]+)/);
              if (!m) continue;
              const price = parseFloat(m[2]);
              if (isNaN(price)) continue;
              if (m[1] === "NFH") out.highs.push(price);
              else out.lows.push(price);
            }
          }
          // Deduplicate and sort
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

export async function runBrief({ rules_path, watchlist: watchlistName } = {}) {
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

  // Save current chart state so we can restore after scanning
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

      // Scan each timeframe
      for (const config of SCAN_TIMEFRAMES) {
        symbolData[config.key] = await scanTimeframe(config);
      }

      // Get current quote (from last TF, price is the same)
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

  // Restore original chart state
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
    watchlist: {
      name: resolvedName,
      available,
    },
    rules: {
      bias_model: rules.bias_model || null,
      risk_rules: rules.risk_rules || null,
      notes: rules.notes || null,
    },
    symbols_scanned: results,
    instruction: buildInstruction(),
  };
}

function buildInstruction() {
  return [
    "BIAS METHODOLOGY — Apply this analysis for each symbol:\n",

    "STEP 1 — MONTHLY BIAS (FVG Context + 3-Bar Formation):",
    "A) FVG Context: Use monthly.study_values.fvg_bull and monthly.study_values.fvg_bear.",
    "   Each array holds up to 3 unmitigated zones ordered most-recent first: [{top, bot, formed}, …].",
    "   Supplement with monthly.fvg_zones (boxes) for any additional context.",
    "   - Monthly FVGs are the most structural — they define the multi-month regime and frame all lower-TF moves.",
    "   - Read bull and bear FVGs together. Note which sit above vs. below current price — these are the largest-scale draws.",
    "   - Check monthly.labels for any macro BSL/SSL sweeps.",
    "B) 3-Bar Formation: Analyze monthly.bars (last 3 monthly candles, ordered oldest→newest as bar1, bar2, bar3-current):",
    "   - REVERSAL: bar2 swept bar1's high (bar2.high > bar1.high) but closed below it (bar2.close < bar1.high) → bearish reversal expected for bar3.",
    "   - REVERSAL: bar2 swept bar1's low (bar2.low < bar1.low) but closed above it (bar2.close > bar1.low) → bullish reversal expected for bar3.",
    "   - CONTINUATION: bar2 swept bar1's high AND closed above it → bullish continuation for bar3.",
    "   - CONTINUATION: bar2 swept bar1's low AND closed below it → bearish continuation for bar3.",
    "   - No sweep of bar1's high or low → no clear formation, skip.",
    "C) Combine FVG context + 3-bar formation → Monthly Bias: BULLISH / BEARISH / NEUTRAL.",
    "   Monthly bias is the TOP-OF-STACK context — it does not have to resolve into a trade by itself, but it filters everything below.\n",

    "STEP 2 — WEEKLY BIAS (FVG Context + 3-Bar Formation):",
    "A) FVG Context: Use weekly.study_values.fvg_bull and weekly.study_values.fvg_bear.",
    "   Each array holds up to 3 unmitigated zones ordered most-recent first: [{top, bot, formed}, …].",
    "   'formed' is the date (YYYY-MM-DD) when the FVG was created — use it to judge recency.",
    "   Supplement with weekly.fvg_zones (boxes) for any additional context.",
    "   - Read ALL available bullish and bearish FVGs together — analyze price's journey between them, not each in isolation.",
    "   - Bullish FVG: price support zone. If price body-closed inside or above → zone holds, bias BULLISH.",
    "     If price only wicked in then failed to rally, or closed below it → zone weakened, bias BEARISH.",
    "   - Bearish FVG: price resistance zone above price → target for shorts; resistance for longs.",
    "   - Note which of the 3 bull and 3 bear FVGs are above vs. below current price — price tends to",
    "     draw toward the nearest unmitigated zone on either side.",
    "   - Check weekly.labels for BSL/SSL sweeps — liquidity swept = cause of next directional move.",
    "   - Price moves from liquidity to liquidity, rebalancing FVGs in between.",
    "B) 3-Bar Formation: Analyze weekly.bars (last 3 weekly candles, ordered oldest→newest as bar1, bar2, bar3-current):",
    "   - REVERSAL: If bar2 swept bar1's high (bar2.high > bar1.high) but closed below it (bar2.close < bar1.high) → bearish reversal expected for bar3.",
    "   - REVERSAL: If bar2 swept bar1's low (bar2.low < bar1.low) but closed above it (bar2.close > bar1.low) → bullish reversal expected for bar3.",
    "   - CONTINUATION: If bar2 swept bar1's high AND closed above it (bar2.close > bar1.high) → bullish continuation for bar3.",
    "   - CONTINUATION: If bar2 swept bar1's low AND closed below it (bar2.close < bar1.low) → bearish continuation for bar3.",
    "   - If bar2 did not sweep bar1's high or low → no clear formation, skip this signal.",
    "C) Combine FVG context + 3-bar formation → Weekly Bias: BULLISH / BEARISH / NEUTRAL.",
    "   Weekly bias must be read IN THE CONTEXT of monthly bias — if weekly conflicts with monthly, the weekly move is likely counter-trend/retracement; note it.\n",

    "STEP 3 — DAILY BIAS (FVG Context + 3-Bar Formation):",
    "Apply the same FVG context + 3-bar logic to daily.study_values.fvg_bull, daily.study_values.fvg_bear, daily.fvg_zones, and daily.bars.",
    "Daily bias must be subordinate to weekly bias (which itself is subordinate to monthly). If daily conflicts with weekly, mark as NEUTRAL or note the conflict.",
    "Key question: Will today's daily candle close higher or lower?\n",

    "STEP 4 — ATR (Average True Range):",
    "Read the ATR value from each timeframe's study_values.atr (from the ATR indicator on the chart).",
    "Available as: daily.study_values.atr, h4.study_values.atr, h1.study_values.atr.",
    "Usage:",
    "  - D ATR: the expected full-day range. If price has already moved > 0.7× D ATR from today's open, targets on that side are nearly exhausted.",
    "  - H4 ATR: expected move per 4-hour block. Use for stop sizing (stop = 1–1.5× H4 ATR from entry).",
    "  - H1 ATR: use for entry precision — if price is more than 1× H1 ATR away from a POI, wait for it to come to the zone rather than chasing.\n",

    "STEP 5 — MULTI-TIMEFRAME FVG CONFLUENCE:",
    "Cross-reference the last 3 bull and 3 bear FVGs from each timeframe (M, W, D, H4, H1) to find overlapping zones.",
    "Overlap definition: two FVG zones overlap if one zone's top > the other zone's bottom AND vice versa (ranges intersect).",
    "Check all pairwise combinations across M/W/D/H4/H1.",
    "When 2+ timeframes share overlapping FVGs on the same side:",
    "  - The overlapping sub-range (the intersection) is a CONFLUENCE ZONE — stronger support/resistance than any single TF.",
    "  - 3+ timeframes overlapping = HIGH CONFLUENCE — treat as a major structural level.",
    "  - Any confluence that INCLUDES the monthly zone is the strongest possible — mark it explicitly.",
    "  - Note the exact overlap range (intersection of the zones), not the full zones.",
    "Use confluence zones to:",
    "  (a) REFINE ENTRIES: prefer entering at a confluence zone over a single-TF FVG.",
    "  (b) REFINE TARGETS: if the nearest draw-on-liquidity sits inside or near a confluence zone, it will likely act as strong resistance/support on approach.",
    "  (c) ADJUST STOPS: place stops beyond the confluence zone, not just beyond a single-TF FVG.",
    "Only report confluence zones that are RELEVANT to the current price and bias — within roughly 2× D ATR of current price.\n",

    "STEP 6 — KEY LIQUIDITY LEVELS (Naked Fractals on M, W & D):",
    "Read monthly.naked_fractals, weekly.naked_fractals, and daily.naked_fractals — these come from the '0x Fractals Advanced' indicator, which tracks pivot highs/lows over the last 50–100 bars and flags those not yet swept by subsequent price action.",
    "Each bucket contains { highs: [prices], lows: [prices] } sorted ascending.",
    "- UPPER liquidity (key level above price): closest naked fractal HIGH that is > current price. Search monthly first, then weekly, then daily.",
    "- LOWER liquidity (key level below price): closest naked fractal LOW that is < current price. Search monthly first, then weekly, then daily.",
    "- These are the draw-on-liquidity targets — price tends to reach for naked highs/lows before reversing.",
    "- Report M, W and D levels separately; monthly outranks weekly, which outranks daily, when multiple exist on the same side.\n",

    "STEP 7 — POINTS OF INTEREST (POI) on H4 and H1:",
    "POIs are where you look to ENTER trades in the direction of bias. Two POI types, all relative to current price:",
    "  (1) FVG zones — from h4/h1 study_values.fvg_bull and study_values.fvg_bear (last 3 bull/bear each, [{top,bot}…]),",
    "      supplemented by h4/h1 fvg_zones (boxes) for additional context.",
    "  (2) Naked fractal levels — from h4/h1 naked_fractals (closest upper fractal HIGH above price and closest lower fractal LOW below price, per timeframe).",
    "",
    "For each side (above price / below price) on each TF (4H, 1H), identify:",
    "  - closest FVG, closest naked fractal level.",
    "",
    "CONFLUENCE STRENGTHENING: If a naked fractal level falls INSIDE (or within a tight tolerance of) an FVG zone, that POI is STRONGER — mark it as ★ STRONG. Treat 'inside' as: fractal price between the zone's top and bottom.",
    "Additionally, if a POI falls inside or near a multi-TF FVG confluence zone (from Step 5), upgrade that POI's rating.\n",

    "STEP 8 — SYNTHESIS:",
    "Monthly bias is the macro regime — it frames whether weekly/daily moves are trend or retracement.",
    "Weekly bias is the primary trading direction, read in the context of monthly.",
    "Daily bias must align with weekly — if it conflicts, note it and lower confidence.",
    "When all three (M/W/D) align → highest-confidence setup. When M and W disagree → expect choppy/counter-trend behavior, trade smaller or stand aside.",
    "Use ATR to validate that entries are realistic (price not already over-extended) and to size stops.",
    "Use M/W/D naked fractals as the DRAW-ON-LIQUIDITY targets (where price is likely headed); monthly levels are the biggest magnets.",
    "Use H4/H1 POIs as ENTRY zones in the direction of bias, preferring STRONG (confluence) POIs.",
    "Use multi-TF FVG confluence zones to sharpen both entries and stop placement.\n",

    "OUTPUT FORMAT:",
    "For each symbol output:",
    "SYMBOL | MONTHLY BIAS: [bullish/bearish/neutral] (reason) | WEEKLY BIAS: [bullish/bearish/neutral] (reason) | DAILY BIAS: [bullish/bearish/neutral] (reason) | OVERALL: [bullish/bearish/neutral]",
    "3-BAR M: [reversal/continuation/none] — describe the formation",
    "3-BAR W: [reversal/continuation/none] — describe the formation",
    "3-BAR D: [reversal/continuation/none] — describe the formation",
    "M FVGs BULL: [#1 top–bot | #2 top–bot | #3 top–bot]  (above/below price, most recent first)",
    "M FVGs BEAR: [#1 top–bot | #2 top–bot | #3 top–bot]  (above/below price, most recent first)",
    "W FVGs BULL: [#1 top–bot | #2 top–bot | #3 top–bot]  (above/below price, most recent first)",
    "W FVGs BEAR: [#1 top–bot | #2 top–bot | #3 top–bot]  (above/below price, most recent first)",
    "D FVGs BULL: [#1 top–bot | #2 top–bot | #3 top–bot]",
    "D FVGs BEAR: [#1 top–bot | #2 top–bot | #3 top–bot]",
    "ATR: D [value] | H4 [value] | H1 [value]",
    "FVG CONFLUENCE: [list confluence zones within ~2× D ATR of price, with timeframes and overlap range, or 'none near price'; flag any overlap that includes M]",
    "KEY LIQUIDITY: [M upper: price | M lower: price | W upper: price | W lower: price | D upper: price | D lower: price]  (omit any side with no naked fractal)",
    "POI 4H ABOVE: [FVG: range | Fractal: price]  (mark ★ if confluence)",
    "POI 4H BELOW: [FVG: range | Fractal: price]  (mark ★ if confluence)",
    "POI 1H ABOVE: [FVG: range | Fractal: price]  (mark ★ if confluence)",
    "POI 1H BELOW: [FVG: range | Fractal: price]  (mark ★ if confluence)",
    "End with a one-sentence overall market read across all symbols. Be direct. No preamble.",
  ].join("\n");
}

export function saveSession({ brief, date } = {}) {
  mkdirSync(SESSIONS_DIR, { recursive: true });

  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SESSIONS_DIR, `${dateStr}.json`);

  const existing = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};
  const record = {
    ...existing,
    date: dateStr,
    saved_at: new Date().toISOString(),
    brief,
  };

  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return { success: true, path: filePath, date: dateStr };
}

export function getSession({ date } = {}) {
  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SESSIONS_DIR, `${dateStr}.json`);

  if (existsSync(filePath)) {
    return { success: true, ...JSON.parse(readFileSync(filePath, "utf8")) };
  }

  // Fall back to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const yesterdayPath = join(SESSIONS_DIR, `${yesterdayStr}.json`);

  if (existsSync(yesterdayPath)) {
    return {
      success: true,
      note: "No session for today — returning yesterday",
      ...JSON.parse(readFileSync(yesterdayPath, "utf8")),
    };
  }

  return {
    success: false,
    error: `No session found for ${dateStr} or ${yesterdayStr}`,
    sessions_dir: SESSIONS_DIR,
  };
}
