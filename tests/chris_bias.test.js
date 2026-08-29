/**
 * Daily bias — checked against the author's own worked example.
 *
 * The video ("HOLISTIC APPROACH NQ — Case Study") walks through 3 January 2025
 * on NQ: Thursday's daily candle takes out the low left behind on Friday
 * 20 December 2024, closes its body back above it, and that makes the bias
 * bullish for Friday — with the expectation that Thursday's high gets taken.
 *
 * These are real CME_MINI:NQH2025 daily bars pulled from the chart, not
 * synthetic ones. If our encoding of the rule ever stops reproducing his call
 * on his own example, this fails.
 *
 * Bars are labelled by the session's start date in UTC, so the CME session that
 * TRADES on Friday 3 Jan is labelled 2025-01-02, and the one that sets the bias
 * (Thursday 2 Jan) is labelled 2025-01-01.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dailyBias, CHRIS_DEFAULTS } from "../src/core/chris.js";

// oldest → newest
const NQ_DAILY = [
  { d: "2024-12-02", o: 21471.25, h: 21593.75, l: 21400, c: 21545.5 },
  { d: "2024-12-03", o: 21578.75, h: 21815.5, l: 21574.75, c: 21803.25 },
  { d: "2024-12-04", o: 21774, h: 21835, l: 21707.5, c: 21740.5 },
  { d: "2024-12-05", o: 21713, h: 21936, l: 21696, c: 21924.25 },
  { d: "2024-12-08", o: 21911, h: 21975, l: 21707.5, c: 21750.75 },
  { d: "2024-12-09", o: 21737, h: 21873.25, l: 21619.25, c: 21670 },
  { d: "2024-12-10", o: 21699, h: 22087, l: 21674, c: 22062.5 },
  { d: "2024-12-11", o: 22027, h: 22042.5, l: 21871.75, c: 21918.5 },
  { d: "2024-12-12", o: 21967.25, h: 22184, l: 21942.5, c: 22082 },
  { d: "2024-12-15", o: 22062, h: 22450, l: 22050.5, c: 22408 },
  { d: "2024-12-16", o: 22412.25, h: 22425.75, l: 22244.25, c: 22314.5 },
  { d: "2024-12-17", o: 22309.25, h: 22387.75, l: 21311, c: 21501.75 },
  { d: "2024-12-18", o: 21499.75, h: 21697.75, l: 21345.75, c: 21379 },
  { d: "2024-12-19", o: 21429.25, h: 21812.25, l: 21006.5, c: 21566.5 }, // the 20 Dec low
  { d: "2024-12-22", o: 21566, h: 21776.75, l: 21476.75, c: 21753.25 },
  { d: "2024-12-23", o: 21743.25, h: 22049.75, l: 21709, c: 22028.5 },
  { d: "2024-12-25", o: 22049.5, h: 22111.25, l: 21870.25, c: 22008 },
  { d: "2024-12-26", o: 21990.75, h: 22008, l: 21498.75, c: 21698.5 },
  { d: "2024-12-29", o: 21711, h: 21742.75, l: 21253, c: 21416.25 },
  { d: "2024-12-30", o: 21390.25, h: 21524.75, l: 21182, c: 21226.5 },
  { d: "2025-01-01", o: 21269, h: 21490.5, l: 20983.75, c: 21167.5 }, // trades Thu 2 Jan
  { d: "2025-01-02", o: 21186.75, h: 21559.25, l: 21144, c: 21516.5 }, // trades Fri 3 Jan
  { d: "2025-01-05", o: 21532.25, h: 21896.75, l: 21478.25, c: 21744.5 },
].map((b, i) => ({ time: i * 86400, open: b.o, high: b.h, low: b.l, close: b.c, date: b.d }));

const at = (date) => NQ_DAILY.findIndex((b) => b.date === date);
/** Bars up to and including the candle that sets the bias for the next day. */
const upTo = (date) => NQ_DAILY.slice(0, at(date) + 1);

const THURSDAY = "2025-01-01"; // sets the bias for Friday 3 Jan
const FRIDAY = "2025-01-02"; // the day he traded

describe("Daily bias — the author's 3 January 2025 example", () => {
  it("the setup he describes is actually in the data", () => {
    const decLow = NQ_DAILY[at("2024-12-19")].low;
    const thu = NQ_DAILY[at(THURSDAY)];
    assert.equal(decLow, 21006.5, "the 20 Dec low");
    assert.ok(thu.low < decLow, "Thursday took that low out");
    assert.ok(thu.close > decLow, "and closed its body back above it");
  });

  it("the strict fractal encoding calls it bullish, off the right level", () => {
    const read = dailyBias(upTo(THURSDAY), CHRIS_DEFAULTS);
    assert.equal(read.bias, 1, "bullish bias for Friday");
    assert.equal(read.level, 21006.5, "off the 20 Dec low, the level he points at");
  });

  it("the looser swing encoding agrees", () => {
    const cfg = { ...CHRIS_DEFAULTS, bias: { ...CHRIS_DEFAULTS.bias, mode: "swing" } };
    const read = dailyBias(upTo(THURSDAY), cfg);
    assert.equal(read.bias, 1);
    assert.equal(read.level, 21006.5);
  });

  it("the bias was right — Friday took Thursday's high, as he predicted", () => {
    const thu = NQ_DAILY[at(THURSDAY)];
    const fri = NQ_DAILY[at(FRIDAY)];
    assert.ok(fri.high > thu.high, `${fri.high} should exceed ${thu.high}`);
  });

  it("no bias is reported without enough history", () => {
    const read = dailyBias(NQ_DAILY.slice(0, 2), CHRIS_DEFAULTS);
    assert.equal(read.bias, 0);
    assert.match(read.reason, /not enough/);
  });
});

describe("Daily bias — mechanics", () => {
  it("a sweep that closes back beyond the level gives no bias", () => {
    // same shape, but the candle closes BELOW the level it swept: no reclaim
    const bars = upTo(THURSDAY).slice();
    bars[bars.length - 1] = { ...bars[bars.length - 1], close: 20990 };
    assert.equal(dailyBias(bars, CHRIS_DEFAULTS).bias, 0);
  });

  it("no sweep at all gives no bias", () => {
    const bars = upTo(THURSDAY).slice();
    bars[bars.length - 1] = { ...bars[bars.length - 1], low: 21200, close: 21300 };
    assert.equal(dailyBias(bars, CHRIS_DEFAULTS).bias, 0);
  });

  it("the mirror case reads bearish", () => {
    // A candle that takes out a prior untouched high and closes back below it.
    // The level has to sit at least two bars back: a level swept by the very
    // next candle is not a fractal, because that candle is its right neighbour.
    const bars = NQ_DAILY.slice(0, at("2024-12-17") + 1).slice();
    const priorHigh = NQ_DAILY[at("2024-12-15")].high; // 22450
    bars[bars.length - 1] = {
      ...bars[bars.length - 1],
      high: priorHigh + 50,
      low: 22200,
      close: priorHigh - 100,
    };
    const read = dailyBias(bars, CHRIS_DEFAULTS);
    assert.equal(read.bias, -1);
    assert.equal(read.level, priorHigh);
  });

  it("a level swept by the very next candle does not count as liquidity", () => {
    const bars = NQ_DAILY.slice(0, at("2024-12-16") + 1).slice();
    const priorHigh = NQ_DAILY[at("2024-12-15")].high;
    bars[bars.length - 1] = {
      ...bars[bars.length - 1],
      high: priorHigh + 50,
      low: 22200,
      close: priorHigh - 100,
    };
    assert.equal(dailyBias(bars, CHRIS_DEFAULTS).bias, 0);
  });
});
