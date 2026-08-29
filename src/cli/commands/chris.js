import { register } from "../router.js";
import * as core from "../../core/chris.js";

const commonOptions = {
  rules: {
    type: "string",
    short: "r",
    description: "Path to rules.json (default: ./rules.json)",
  },
  tf: {
    type: "string",
    multiple: true,
    description: "Timeframe to scan, repeatable (default: rules.json chris.timeframes)",
  },
  compact: {
    type: "boolean",
    short: "c",
    description: "Return a compact, report-ready payload without the config echo",
  },
};

register("chris", {
  description:
    "ChrisFX breaker-block analysis — graded A++/A+/A/B setups (docs/CHRISFX.md)",
  subcommands: new Map([
    [
      "brief",
      {
        description:
          'Scan the "chris" watchlist on 5m/15m and return graded breaker blocks',
        options: commonOptions,
        handler: async ({ rules, tf, compact }) => {
          const result = await core.runChrisBrief({ rules_path: rules, timeframes: tf });
          return compact ? core.compactChrisBrief(result) : result;
        },
      },
    ],
    [
      "scan",
      {
        description: "ChrisFX read of a single symbol: tv chris scan CME_MINI:MNQ1!",
        options: commonOptions,
        handler: async ({ rules, tf, compact }, positionals) => {
          const symbol = positionals?.[0];
          if (!symbol) throw new Error("Usage: tv chris scan <SYMBOL> [--tf 5 --tf 15]");
          const result = await core.runChrisBrief({
            rules_path: rules,
            symbols: [symbol],
            timeframes: tf,
          });
          return compact ? core.compactChrisBrief(result) : result;
        },
      },
    ],
  ]),
});
