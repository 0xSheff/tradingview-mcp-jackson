/**
 * Morning brief core logic.
 * Reads rules.json, scans watchlist symbols, returns structured data
 * for Claude to apply bias criteria and generate a session brief.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadRules } from "./config.js";
import * as chart from "./chart.js";
import * as data from "./data.js";
import * as indicators from "./indicators.js";

function formatTf(tf, chartTf) {
  const raw = tf === "" || tf === null || tf === undefined ? chartTf : tf;
  const map = { D: "Daily", W: "Weekly", M: "Monthly", "1": "1M", "3": "3M",
    "5": "5M", "10": "10M", "15": "15M", "30": "30M", "45": "45M",
    "60": "1H", "120": "2H", "180": "3H", "240": "4H", "360": "6H",
    "480": "8H", "720": "12H" };
  return map[raw] ?? raw;
}

async function readIndicatorTfs(studies, chartTf) {
  const fvgStudy = studies.find(s => /fair value/i.test(s.name));
  const sdStudy  = studies.find(s => /supply.*demand/i.test(s.name));
  const result = {};

  if (fvgStudy) {
    try {
      const inp = await data.getIndicator({ entity_id: fvgStudy.id });
      const tf = inp.inputs?.find(i => i.id === "tf");
      result.fvg_timeframe = formatTf(tf?.value, chartTf);
    } catch (_) {}
  }

  if (sdStudy) {
    try {
      const inp = await data.getIndicator({ entity_id: sdStudy.id });
      const tfs = [];
      for (let n = 1; n <= 3; n++) {
        const enabled = inp.inputs?.find(i => i.id === `timeframe${n}Enabled`);
        const tf      = inp.inputs?.find(i => i.id === `timeframe${n}`);
        if (enabled?.value !== false) {
          tfs.push(formatTf(tf?.value, chartTf));
        }
      }
      result.sd_timeframes = tfs.length ? tfs : [formatTf("", chartTf)];
    } catch (_) {}
  }

  return result;
}

const SESSIONS_DIR = join(homedir(), ".tradingview-mcp", "sessions");

export async function runBrief({ rules_path } = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const { watchlist = [], default_timeframe = "240" } = rules;

  if (!watchlist.length) {
    throw new Error(
      "rules.json watchlist is empty. Add at least one symbol to your watchlist array.",
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
      await new Promise((r) => setTimeout(r, 900));
      await chart.setTimeframe({ timeframe: default_timeframe });
      await new Promise((r) => setTimeout(r, 900));

      const [state, studyValues, quote] = await Promise.all([
        chart.getState(),
        data.getStudyValues(),
        data.getQuote({}),
      ]);

      const tfs = await readIndicatorTfs(state.studies || [], default_timeframe);

      results.push({
        symbol,
        timeframe: default_timeframe,
        state,
        indicators: studyValues,
        quote,
        ...tfs,
      });
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
    rules: {
      bias_criteria: rules.bias_criteria || null,
      risk_rules: rules.risk_rules || null,
      notes: rules.notes || null,
    },
    symbols_scanned: results,
    instruction: [
      "For each symbol in symbols_scanned, apply the bias_criteria from rules to the indicator readings.",
      "Each symbol entry includes fvg_timeframe (the timeframe of the FVG indicator) and sd_timeframes (active timeframes of the S&D indicator).",
      "Output one line per symbol: SYMBOL | BIAS: [bullish/bearish/neutral] | LEVELS: [list each key level with its timeframe, e.g. 'Bear FVG 6681-6715 (4H)', 'Demand 6553-6632 (4H)', 'Supply 6894-6949 (4H)'] | WATCH: [what to monitor]",
      "Always include the timeframe label in parentheses next to every level mentioned.",
      "End with a one-sentence overall market read.",
      "Be direct. No preamble.",
    ].join(" "),
  };
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
