import { register } from "../router.js";
import * as core from "../../core/marco.js";

const commonOptions = {
  rules: {
    type: "string",
    short: "r",
    description: "Path to rules.json (optional — marco section overrides defaults)",
  },
  tf: {
    type: "string",
    multiple: true,
    description: "Timeframe to scan, repeatable (default: 15, 60)",
  },
  compact: {
    type: "boolean",
    short: "c",
    description: "Return a compact, report-ready payload without the config echo",
  },
};

register("marco", {
  description:
    "Accettone liquidity-block analysis — story, LB zones, 10am H4 gate (docs/MARCO.md)",
  subcommands: new Map([
    [
      "brief",
      {
        description:
          'Scan the "marco" watchlist and return the liquidity story per symbol',
        options: commonOptions,
        handler: async ({ rules, tf, compact }) => {
          const result = await core.runMarcoBrief({ rules_path: rules, timeframes: tf });
          return compact ? core.compactMarcoBrief(result) : result;
        },
      },
    ],
    [
      "weekly",
      {
        description:
          'Weekly bias brief (W + D story → bias, targets, triggers) for the "marco" list; writes briefs/weekly/<week>.md + .json',
        options: {
          ...commonOptions,
          out: { type: "string", description: "Output directory (default: briefs/weekly)" },
        },
        handler: async ({ rules, out, compact }, positionals) => {
          const result = await core.runMarcoWeekly({
            rules_path: rules,
            out_dir: out,
            symbols: positionals?.length ? positionals : undefined,
          });
          return compact ? core.compactMarcoWeekly(result) : result;
        },
      },
    ],
    [
      "scan",
      {
        description: "Accettone read of a single symbol: tv marco scan COMEX_MINI:MGC1!",
        options: commonOptions,
        handler: async ({ rules, tf, compact }, positionals) => {
          const symbol = positionals?.[0];
          if (!symbol) throw new Error("Usage: tv marco scan <SYMBOL> [--tf 15 --tf 60]");
          const result = await core.runMarcoBrief({
            rules_path: rules,
            symbols: [symbol],
            timeframes: tf,
          });
          return compact ? core.compactMarcoBrief(result) : result;
        },
      },
    ],
  ]),
});
