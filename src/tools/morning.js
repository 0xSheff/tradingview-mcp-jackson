import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/morning.js";

export function registerMorningTools(server) {
  server.tool(
    "morning_brief",
    "Scan a named watchlist from rules.json across multiple timeframes (M/W/D/4H/1H), collecting FVG zones, S&D zones, and OHLCV bars for 3-bar formation analysis on M/W/D. Returns structured multi-timeframe data for Claude to apply the BIAS methodology (FVG context + 3-bar candlestick patterns across monthly/weekly/daily) and identify Points of Interest. rules.json can define multiple named watchlists under the \"watchlists\" key — pass the `watchlist` parameter to target one by name (e.g. \"crypto\", \"futures\"); omit it to use the default (first listed). Runs a preflight check first (required indicators on chart + economic calendar access); if any required indicator is missing or hidden, returns `preflight_failed: true` with an instruction to ask the user what to do — do NOT scan until the user responds. Pass `skip_preflight: true` only after the user explicitly tells you to proceed anyway.",
    {
      rules_path: z
        .string()
        .optional()
        .describe(
          "Optional path to rules.json. Defaults to rules.json in the project root.",
        ),
      watchlist: z
        .string()
        .optional()
        .describe(
          "Name of the watchlist in rules.json to scan (e.g. \"primary\", \"crypto\"). Omit for the default (first watchlist listed).",
        ),
      skip_preflight: z
        .boolean()
        .optional()
        .describe(
          "Skip the preflight check (indicator visibility + calendar access). Only set true when the user has explicitly told you to proceed despite preflight issues.",
        ),
    },
    async ({ rules_path, watchlist, skip_preflight } = {}) => {
      try {
        return jsonResult(
          await core.runBrief({ rules_path, watchlist, skip_preflight }),
        );
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "session_save",
    "Save today's morning brief to ~/.tradingview-mcp/sessions/YYYY-MM-DD.json for future reference.",
    {
      brief: z
        .string()
        .describe(
          "The brief text to save (output from morning_brief after Claude applies the rules).",
        ),
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
    },
    async ({ brief, date } = {}) => {
      try {
        return jsonResult(core.saveSession({ brief, date }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "session_get",
    "Retrieve a saved session brief. Returns today's if available, otherwise yesterday's.",
    {
      date: z
        .string()
        .optional()
        .describe("Date string YYYY-MM-DD. Defaults to today."),
    },
    async ({ date } = {}) => {
      try {
        return jsonResult(core.getSession({ date }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
