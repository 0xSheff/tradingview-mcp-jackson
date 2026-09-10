/**
 * Centralized config loading for TradingView MCP.
 * Provides loadRules() for reading rules.json with fallback paths.
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");

export function loadRules(rulesPath) {
  const candidates = [
    rulesPath,
    join(PROJECT_ROOT, "rules.json"),
    join(homedir(), ".tradingview-mcp", "rules.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return { rules: JSON.parse(readFileSync(p, "utf8")), path: p };
      } catch (e) {
        throw new Error(`Failed to parse rules.json at ${p}: ${e.message}`);
      }
    }
  }

  throw new Error(
    "No rules.json found. Copy rules.example.json to rules.json and fill in your trading rules.\n" +
      "Looked in:\n" +
      candidates
        .filter(Boolean)
        .map((p) => `  - ${p}`)
        .join("\n"),
  );
}

/**
 * Load a named section from watchlists.json (single source of truth for
 * instrument lists). Defaults to the "primary" section.
 */
export function loadWatchlist(section = "primary", watchlistPath) {
  const candidates = [
    watchlistPath,
    join(PROJECT_ROOT, "watchlists.json"),
    join(homedir(), ".tradingview-mcp", "watchlists.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      let data;
      try {
        data = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        throw new Error(`Failed to parse watchlists.json at ${p}: ${e.message}`);
      }
      const list = data[section];
      if (!Array.isArray(list)) {
        throw new Error(
          `watchlists.json at ${p} has no "${section}" array section.`,
        );
      }
      return { watchlist: list, path: p };
    }
  }

  throw new Error(
    `No watchlists.json found. Add one with a "${section}" array of symbols.\n` +
      "Looked in:\n" +
      candidates.map((p) => `  - ${p}`).join("\n"),
  );
}

/**
 * Load contracts.json — per-instrument point value used for risk sizing.
 * Optional: a missing file yields an empty map, and callers must treat a
 * missing spec as "no dollar figure available" rather than substituting a
 * guess (docs/MARCO.md §5 — the per-trade cap decides takeability, so a
 * wrong figure is worse than none).
 */
export function loadContracts(contractsPath) {
  const candidates = [
    contractsPath,
    join(PROJECT_ROOT, "contracts.json"),
    join(homedir(), ".tradingview-mcp", "contracts.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      let data;
      try {
        data = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        throw new Error(`Failed to parse contracts.json at ${p}: ${e.message}`);
      }
      return { contracts: data.contracts ?? {}, path: p };
    }
  }
  return { contracts: {}, path: null };
}

/** Spec for a symbol, or null when absent or unverified. */
export function contractSpec(contracts, symbol) {
  const c = contracts?.[symbol];
  if (!c || c.verified !== true || typeof c.usd_per_point !== "number") return null;
  return c;
}
