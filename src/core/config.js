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
      let rules;
      try {
        rules = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        throw new Error(`Failed to parse rules.json at ${p}: ${e.message}`);
      }
      mergeWatchlistsFile(rules, dirname(p));
      return { rules, path: p };
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
 * Merge watchlists.json (sibling of rules.json) into the rules object.
 * Shapes accepted:
 *   - { "primary": [...], "crypto": [...] }            (flat)
 *   - { "watchlists": {...}, "default_watchlist": "x" } (wrapper)
 * watchlists.json entries win over rules.watchlists on key collision.
 */
function mergeWatchlistsFile(rules, rulesDir) {
  const p = join(rulesDir, "watchlists.json");
  if (!existsSync(p)) return;
  let wl;
  try {
    wl = JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`Failed to parse watchlists.json at ${p}: ${e.message}`);
  }
  if (!wl || typeof wl !== "object" || Array.isArray(wl)) return;
  const fromFile =
    wl.watchlists && typeof wl.watchlists === "object" && !Array.isArray(wl.watchlists)
      ? wl.watchlists
      : wl;
  rules.watchlists = { ...(rules.watchlists || {}), ...fromFile };
  if (wl.default_watchlist && !rules.default_watchlist) {
    rules.default_watchlist = wl.default_watchlist;
  }
}

/**
 * Resolve a watchlist from rules.json.
 *
 * Supported shapes in rules.json:
 *   1. New:    "watchlists": { "primary": [...], "crypto": [...] }
 *      Optional: "default_watchlist": "primary"
 *      If default_watchlist is omitted, the FIRST key is the default.
 *   2. Legacy: "watchlist": [...]   (treated as the sole default list)
 *
 * @param {object} rules  Parsed rules.json
 * @param {string} [name] Watchlist name. Omit for the default.
 * @returns {{ name: string, symbols: string[], available: string[] }}
 */
export function getWatchlistSymbols(rules, name) {
  // Legacy single-array support
  if (Array.isArray(rules.watchlist)) {
    const legacyName = "default";
    if (name && name.toLowerCase() !== legacyName) {
      throw new Error(
        `Watchlist "${name}" not found. rules.json uses the legacy single "watchlist" array format — ` +
          `migrate to the "watchlists" object to use multiple named watchlists.`,
      );
    }
    return { name: legacyName, symbols: rules.watchlist, available: [legacyName] };
  }

  const watchlists = rules.watchlists;
  if (!watchlists || typeof watchlists !== "object" || Array.isArray(watchlists)) {
    throw new Error(
      'rules.json must contain a "watchlists" object (e.g. { "primary": ["TVC:DXY", ...] }) ' +
        'or a legacy "watchlist" array.',
    );
  }

  const keys = Object.keys(watchlists);
  if (!keys.length) {
    throw new Error('rules.json "watchlists" is empty. Add at least one named watchlist.');
  }

  // Default resolution: explicit default_watchlist wins, else first key
  if (!name) {
    const explicit = rules.default_watchlist;
    const defaultName =
      explicit && Object.prototype.hasOwnProperty.call(watchlists, explicit)
        ? explicit
        : keys[0];
    return {
      name: defaultName,
      symbols: Array.isArray(watchlists[defaultName]) ? watchlists[defaultName] : [],
      available: keys,
    };
  }

  // Named lookup — exact, then case-insensitive
  if (Object.prototype.hasOwnProperty.call(watchlists, name)) {
    return {
      name,
      symbols: Array.isArray(watchlists[name]) ? watchlists[name] : [],
      available: keys,
    };
  }
  const lowered = name.toLowerCase();
  const match = keys.find((k) => k.toLowerCase() === lowered);
  if (match) {
    return {
      name: match,
      symbols: Array.isArray(watchlists[match]) ? watchlists[match] : [],
      available: keys,
    };
  }

  throw new Error(
    `Watchlist "${name}" not found in rules.json. Available: ${keys.join(", ")}`,
  );
}
