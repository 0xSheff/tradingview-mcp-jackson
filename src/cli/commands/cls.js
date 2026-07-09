import { register } from "../router.js";
import * as core from "../../core/cls.js";

register("cls", {
  description:
    "CLS (Candle Liquidity Sweep) analysis — David Perk's HTF methodology (docs/CLS.md)",
  subcommands: new Map([
    [
      "brief",
      {
        description:
          "Scan the watchlist on W/D and return CLS reads (models, levels, liquidity)",
        options: {
          rules: {
            type: "string",
            short: "r",
            description: "Path to rules.json (default: ./rules.json)",
          },
        },
        handler: async ({ rules }) => core.runClsBrief({ rules_path: rules }),
      },
    ],
    [
      "scan",
      {
        description: "CLS read of a single symbol: tv cls scan CME:6E1!",
        options: {
          rules: {
            type: "string",
            short: "r",
            description: "Path to rules.json (default: ./rules.json)",
          },
        },
        handler: async ({ rules }, positionals) => {
          const symbol = positionals?.[0];
          if (!symbol) throw new Error("Usage: tv cls scan <SYMBOL>");
          return core.runClsBrief({ rules_path: rules, symbols: [symbol] });
        },
      },
    ],
  ]),
});
