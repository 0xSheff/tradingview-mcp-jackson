/**
 * Drift guard for the duplicated Pine detection code.
 *
 * Pine libraries have to be published to TradingView before they can be
 * imported, so scripts/chrisfx_stats.pine carries a copy of the detection block
 * from scripts/chrisfx_strategy.pine rather than importing it. A copy that
 * drifts would silently make the strategy and the measurement disagree — and
 * the whole point of the stats indicator is that it measures the SAME setups.
 *
 * The block is delimited by sentinels and must stay byte-identical.
 * tests/chris_pine_parity.test.js separately checks that the algorithm inside
 * it agrees with src/core/chris.js.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "// >>> SHARED DETECTION START";
const END = "// <<< SHARED DETECTION END";

function sharedBlock(file) {
  const src = readFileSync(join(ROOT, "scripts", file), "utf8");
  const i = src.indexOf(START);
  const j = src.indexOf(END);
  assert.ok(i >= 0, `${file} is missing ${START}`);
  assert.ok(j > i, `${file} is missing ${END}`);
  return src.slice(i, j + END.length);
}

describe("Pine scripts — shared detection block", () => {
  it("the strategy and the stats indicator carry an identical copy", () => {
    const strat = sharedBlock("chrisfx_strategy.pine");
    const stats = sharedBlock("chrisfx_stats.pine");
    assert.equal(
      stats,
      strat,
      "the detection block has drifted — regenerate the stats indicator instead of editing it by hand",
    );
  });

  it("the block actually contains the detection, not just the sentinels", () => {
    const strat = sharedBlock("chrisfx_strategy.pine");
    for (const symbol of ["detectSetup", "nearestOpposing", "gradeName", "atrG"]) {
      assert.ok(strat.includes(symbol), `shared block should define ${symbol}`);
    }
    assert.ok(strat.split("\n").length > 100, "shared block looks truncated");
  });

  it("neither script declares the other's entry point", () => {
    const strategy = readFileSync(join(ROOT, "scripts", "chrisfx_strategy.pine"), "utf8");
    const stats = readFileSync(join(ROOT, "scripts", "chrisfx_stats.pine"), "utf8");
    assert.ok(/^strategy\(/m.test(strategy), "chrisfx_strategy.pine should declare strategy()");
    assert.ok(/^indicator\(/m.test(stats), "chrisfx_stats.pine should declare indicator()");
    assert.ok(!/^strategy\(/m.test(stats), "the stats script must not be a strategy");
  });
});
