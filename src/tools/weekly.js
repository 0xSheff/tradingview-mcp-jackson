import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/weekly.js";

export function registerWeeklyTools(server) {
  server.tool(
    "weekly_brief",
    "Run a weekend planning brief for the upcoming trading week. Scans a named watchlist on M/W/D/4H (no H1, no execution-tuned framing) and returns structured data for Claude to produce: (1) per-symbol M/W/D bias with FVG context + 3-bar formation, (2) multi-TF FVG confluence, (3) M/W/D naked-fractal liquidity, (4) a 4H structure note framing where intra-week setups will likely form, (5) a PROBABLE WEEK RANGE — primary ceiling/floor with bounce-vs-break call and secondary level if break-likely, (6) bull/bear scenarios with explicit invalidation prices, plus a Mon–Fri high-impact economic calendar. THESIS + LEVELS + SCENARIOS only — no entries, no triggers, no ATR-based stops. Output is intended to be saved via weekly_session_save and consulted throughout the week. Runs preflight first (indicators + calendar); on failure returns preflight_failed: true. Pass skip_preflight: true only after the user explicitly tells you to proceed anyway.",
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
          "Name of the watchlist in rules.json to scan. Omit for the default (first watchlist listed).",
        ),
      skip_preflight: z
        .boolean()
        .optional()
        .describe(
          "Skip preflight (indicators + calendar). Only set true when the user has explicitly told you to proceed despite preflight issues.",
        ),
    },
    async ({ rules_path, watchlist, skip_preflight } = {}) => {
      try {
        return jsonResult(
          await core.runWeeklyBrief({ rules_path, watchlist, skip_preflight }),
        );
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "weekly_session_save",
    "Save the upcoming week's planning brief to ~/.tradingview-mcp/sessions/weekly_brief_YYYY-MM-DD.json (keyed by Monday of the planned week).",
    {
      brief: z
        .string()
        .describe(
          "The brief text to save (output from weekly_brief after Claude applies the rules).",
        ),
      week_start: z
        .string()
        .optional()
        .describe(
          "Monday of the planned week, YYYY-MM-DD. Defaults to next Monday in the configured timezone.",
        ),
    },
    async ({ brief, week_start } = {}) => {
      try {
        return jsonResult(core.saveWeeklySession({ brief, week_start }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );

  server.tool(
    "weekly_session_get",
    "Retrieve the saved weekly planning brief for the upcoming week (or a specific Monday).",
    {
      week_start: z
        .string()
        .optional()
        .describe(
          "Monday of the planned week, YYYY-MM-DD. Defaults to next Monday.",
        ),
    },
    async ({ week_start } = {}) => {
      try {
        return jsonResult(core.getWeeklySession({ week_start }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
