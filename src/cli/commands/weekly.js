import { register } from "../router.js";
import * as core from "../../core/weekly.js";

register("weekly", {
  description:
    "Run your weekend planning brief — scan watchlist on M/W/D/4H, build week range envelope and bull/bear scenarios for the upcoming week",
  options: {
    rules: {
      type: "string",
      short: "r",
      description: "Path to rules.json (default: ./rules.json)",
    },
    watchlist: {
      type: "string",
      short: "w",
      description:
        "Name of the watchlist in rules.json to scan (default: first listed)",
    },
    "skip-preflight": {
      type: "boolean",
      short: "s",
      description:
        "Skip preflight checks (required indicators + calendar access)",
    },
  },
  handler: async ({ rules, watchlist, "skip-preflight": skipPreflight }) =>
    core.runWeeklyBrief({
      rules_path: rules,
      watchlist,
      skip_preflight: !!skipPreflight,
    }),
});

register("weekly-session", {
  description: "Get or save a weekly planning brief",
  subcommands: new Map([
    [
      "get",
      {
        description:
          "Get the weekly brief for the upcoming week (or a specific Monday)",
        options: {
          "week-start": {
            type: "string",
            description:
              "Monday of the planned week, YYYY-MM-DD (default: next Monday)",
          },
        },
        handler: async ({ "week-start": weekStart }) =>
          core.getWeeklySession({ week_start: weekStart }),
      },
    ],
    [
      "save",
      {
        description: "Save a weekly brief to disk",
        options: {
          brief: {
            type: "string",
            short: "b",
            description: "Brief text to save",
          },
          "week-start": {
            type: "string",
            description:
              "Monday of the planned week, YYYY-MM-DD (default: next Monday)",
          },
        },
        handler: async ({ brief, "week-start": weekStart }) => {
          if (!brief) throw new Error("--brief is required");
          return core.saveWeeklySession({ brief, week_start: weekStart });
        },
      },
    ],
  ]),
});
