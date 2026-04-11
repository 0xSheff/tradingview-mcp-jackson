/**
 * Morning brief core logic.
 * Reads rules.json, scans watchlist symbols across multiple timeframes,
 * collects FVG zones, S&D zones, OHLCV bars for 3-bar formation,
 * and returns structured data for Claude to apply the BIAS methodology.
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
 * sd:            read S&D pine boxes
 * labels:        read pine labels (BSL/SSL/liquidity levels)
 * study_values:  read indicator plot outputs (FVG Top/Bot, S&D levels)
 * fractals:      read naked fractals from "0x Fractals Advanced"
 *                (W/D → liquidity levels; H4/H1 → POI)
 */
const SCAN_TIMEFRAMES = [
  { key: "weekly", tf: "W",   bars: 3, fvg: true,  sd: false, labels: true, study_values: true, fractals: true },
  { key: "daily",  tf: "D",   bars: 3, fvg: true,  sd: false, labels: true, study_values: true, fractals: true },
  { key: "h4",     tf: "240", bars: 0, fvg: true,  sd: true,  labels: true, study_values: true, fractals: true },
  { key: "h1",     tf: "60",  bars: 0, fvg: true,  sd: true,  labels: true, study_values: true, fractals: true },
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

  if (config.sd) {
    keys.push("sd_zones");
    promises.push(
      data.getPineBoxes({ study_filter: "supply" })
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
            }
            if (nameLower.includes("supply") || nameLower.includes("demand") || nameLower.includes("s&d") || nameLower.includes("s/d")) {
              parsed.sd = {};
              for (const [k, v] of Object.entries(study.values)) {
                const num = parseFloat(String(v).replace(/,/g, ""));
                if (!isNaN(num)) parsed.sd[k] = num;
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

  // Mid-term timeframes (H4/H1) expect S&D zones. The indicator sometimes
  // needs an extra beat after a TF switch to render its boxes/values — if
  // the first read came back empty, stay on the chart 2s longer and retry.
  if (config.sd && (!out.sd_zones || out.sd_zones.length === 0)) {
    await delay(2000);
    try {
      const retry = await data.getPineBoxes({ study_filter: "supply" });
      out.sd_zones = retry.studies?.[0]?.zones || out.sd_zones || [];
    } catch (_) {}
    if (config.study_values) {
      try {
        const r = await data.getStudyValues();
        const parsed = out.study_values || {};
        for (const study of r.studies || []) {
          const nameLower = study.name.toLowerCase();
          if (
            nameLower.includes("supply") ||
            nameLower.includes("demand") ||
            nameLower.includes("s&d") ||
            nameLower.includes("s/d")
          ) {
            parsed.sd = {};
            for (const [k, v] of Object.entries(study.values)) {
              const num = parseFloat(String(v).replace(/,/g, ""));
              if (!isNaN(num)) parsed.sd[k] = num;
            }
          }
        }
        out.study_values = parsed;
      } catch (_) {}
    }
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

    "STEP 1 — WEEKLY BIAS (FVG Context + 3-Bar Formation):",
    "A) FVG Context: Check weekly.fvg_zones AND weekly.study_values.fvg (Bull FVG Top/Bot, Bear FVG Top/Bot) relative to current price.",
    "   - Read BOTH bullish and bearish FVGs together — analyze price's journey between them, not each in isolation.",
    "   - If price traveled from a bearish FVG down into a bullish FVG and only mitigated it with wicks (not body close inside the zone), then failed to rally → bullish FVG is weakened, bias is BEARISH.",
    "   - If price rallied from a bullish FVG with body closing inside/above it → bullish FVG holds, bias is BULLISH.",
    "   - Unmitigated bearish FVG above price = resistance / target for shorts.",
    "   - Check weekly.labels for BSL/SSL sweeps — liquidity swept = cause of next directional move.",
    "   - Price moves from liquidity to liquidity, rebalancing FVGs in between.",
    "B) 3-Bar Formation: Analyze weekly.bars (last 3 weekly candles, ordered oldest→newest as bar1, bar2, bar3-current):",
    "   - REVERSAL: If bar2 swept bar1's high (bar2.high > bar1.high) but closed below it (bar2.close < bar1.high) → bearish reversal expected for bar3.",
    "   - REVERSAL: If bar2 swept bar1's low (bar2.low < bar1.low) but closed above it (bar2.close > bar1.low) → bullish reversal expected for bar3.",
    "   - CONTINUATION: If bar2 swept bar1's high AND closed above it (bar2.close > bar1.high) → bullish continuation for bar3.",
    "   - CONTINUATION: If bar2 swept bar1's low AND closed below it (bar2.close < bar1.low) → bearish continuation for bar3.",
    "   - If bar2 did not sweep bar1's high or low → no clear formation, skip this signal.",
    "C) Combine FVG context + 3-bar formation → Weekly Bias: BULLISH / BEARISH / NEUTRAL.\n",

    "STEP 2 — DAILY BIAS (FVG Context + 3-Bar Formation):",
    "Apply the same FVG context + 3-bar logic to daily.fvg_zones, daily.study_values.fvg, and daily.bars.",
    "Daily bias must be subordinate to weekly bias. If daily conflicts with weekly, mark as NEUTRAL or note the conflict.",
    "Key question: Will today's daily candle close higher or lower?\n",

    "STEP 3 — KEY LIQUIDITY LEVELS (Naked Fractals on W & D):",
    "Read weekly.naked_fractals and daily.naked_fractals — these come from the '0x Fractals Advanced' indicator, which tracks pivot highs/lows over the last 50–100 bars and flags those not yet swept by subsequent price action.",
    "Each bucket contains { highs: [prices], lows: [prices] } sorted ascending.",
    "- UPPER liquidity (key level above price): closest naked fractal HIGH that is > current price. Search weekly first, then daily.",
    "- LOWER liquidity (key level below price): closest naked fractal LOW that is < current price. Search weekly first, then daily.",
    "- These are the draw-on-liquidity targets — price tends to reach for naked highs/lows before reversing.",
    "- Report W and D levels separately; weekly levels outrank daily when both exist on the same side.\n",

    "STEP 4 — POINTS OF INTEREST (POI) on H4 and H1:",
    "POIs are where you look to ENTER trades in the direction of bias. Three POI types, all relative to current price:",
    "  (1) FVG zones — from h4/h1 fvg_zones and study_values.fvg (keys: 'Bull FVG Top/Bot', 'Bear FVG Top/Bot').",
    "  (2) S&D zones — from h4/h1 sd_zones and study_values.sd (keys: 'Nearest Demand Top/Bot', 'Nearest Supply Top/Bot').",
    "  (3) Naked fractal levels — from h4/h1 naked_fractals (closest upper fractal HIGH above price and closest lower fractal LOW below price, per timeframe).",
    "",
    "For each side (above price / below price) on each TF (4H, 1H), identify:",
    "  - closest FVG, closest S&D zone, closest naked fractal level.",
    "",
    "CONFLUENCE STRENGTHENING: If a naked fractal level falls INSIDE (or within a tight tolerance of) an FVG zone or an S&D zone, that POI is STRONGER — mark it as ★ STRONG. Treat 'inside' as: fractal price between the zone's top and bottom. If an FVG and S&D also overlap at the same fractal, that's the highest-confluence POI.\n",

    "STEP 5 — SYNTHESIS:",
    "Weekly bias (FVG + 3-bar) is the primary direction.",
    "Daily bias must align — if it conflicts, note it and lower confidence.",
    "Use W/D naked fractals as the DRAW-ON-LIQUIDITY targets (where price is likely headed).",
    "Use H4/H1 POIs as ENTRY zones in the direction of bias, preferring STRONG (confluence) POIs.\n",

    "OUTPUT FORMAT:",
    "For each symbol output:",
    "SYMBOL | WEEKLY BIAS: [bullish/bearish/neutral] (reason) | DAILY BIAS: [bullish/bearish/neutral] (reason) | OVERALL: [bullish/bearish/neutral]",
    "3-BAR W: [reversal/continuation/none] — describe the formation",
    "3-BAR D: [reversal/continuation/none] — describe the formation",
    "KEY LIQUIDITY: [W upper: price | W lower: price | D upper: price | D lower: price]  (omit any side with no naked fractal)",
    "POI 4H ABOVE: [FVG: range | S&D: range | Fractal: price]  (mark ★ if confluence)",
    "POI 4H BELOW: [FVG: range | S&D: range | Fractal: price]  (mark ★ if confluence)",
    "POI 1H ABOVE: [FVG: range | S&D: range | Fractal: price]  (mark ★ if confluence)",
    "POI 1H BELOW: [FVG: range | S&D: range | Fractal: price]  (mark ★ if confluence)",
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
