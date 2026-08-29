/**
 * The six schematics ChrisFX grades on slide 2 of his deck, as synthetic bars.
 * His own labels: 1 = B, 2 = A++, 3 = A+, 4 = A, 5 = A++, 6 = A+.
 *
 * Shared by tests/chris.test.js (the JS detector) and
 * tests/chris_pine_parity.test.js (the Pine port), so both are held to the same
 * reference data. See docs/CHRISFX.md §3.3.
 */

let clock = 0;

export const resetClock = () => {
  clock = 0;
};

export const mk = (open, high, low, close) => ({
  time: (clock += 300),
  open,
  high,
  low,
  close,
  volume: 100,
});

/** Flat, strictly equal bars: no fractal can form inside them. */
export function padding(n, { open, high, low, close }) {
  return Array.from({ length: n }, () => mk(open, high, low, close));
}

export const FLAT = { open: 100, high: 100.4, low: 99.6, close: 100.05 };

/** The bar index of the liquidity grab in each example — the Pine port
 *  evaluates a setup a fixed number of bars after this one. */
export const GRAB_INDEX = { example1: 34, example2: 21, example3: 21, example4: 21, example5: 21, example6: 21 };

/** Example 2 — A++ bullish: impulsive body grab, breaker is the leg extreme. */
export function example2() {
  resetClock();
  return [
    ...padding(16, FLAT),
    mk(100, 101, 99, 100.5), //     16
    mk(100.5, 101, 98, 98.5), //    17  valid low @ 98 — the liquidity
    mk(98.5, 99.5, 98.2, 99.2), //  18
    mk(99.2, 100.2, 99.0, 100.0), //19
    mk(100.0, 101.5, 99.8, 101.2), //20 BREAKER — highest of the leg
    mk(101.2, 101.3, 97.0, 97.2), //21 grab: full body close below 98, impulsive
    mk(97.2, 99.5, 97.1, 99.4), //  22 reversal on the very next bar
    mk(99.4, 102.5, 101.6, 102.3), //23 leaves a bullish FVG over the zone
    mk(102.3, 102.8, 102.0, 102.6), //24
    mk(102.6, 102.9, 102.4, 102.7), //25 developing
  ];
}

/** Example 5 — A++ bearish: the mirror of example 2. */
export function example5() {
  resetClock();
  return [
    ...padding(16, { open: 100, high: 100.4, low: 99.6, close: 99.95 }),
    mk(100, 101, 99, 99.5), //       16
    mk(99.5, 102, 99, 101.5), //     17  valid high @ 102 — the liquidity
    mk(101.5, 101.8, 100.8, 100.8), //18
    mk(100.8, 101.0, 99.8, 100.0), //19
    mk(100.0, 100.2, 98.5, 98.8), // 20 BREAKER — lowest of the leg
    mk(98.8, 103.0, 98.7, 102.8), // 21 grab: full body close above 102, impulsive
    mk(102.8, 102.9, 100.5, 100.6), //22 reversal on the very next bar
    mk(98.2, 98.3, 97.5, 97.6), //   23 leaves a bearish FVG over the zone
    mk(97.6, 97.8, 96.8, 97.0), //   24
    mk(97.0, 97.2, 96.6, 96.9), //   25 developing
  ];
}

/** Example 6 — A+ bullish: same as 2, but an earlier candle tops the breaker. */
export function example6() {
  const bars = example2();
  bars[19] = { ...bars[19], high: 102.0 }; // now higher than the breaker's 101.5
  return bars;
}

/** Example 3 — A+ bearish: same as 5, but an earlier candle undercuts the breaker. */
export function example3() {
  const bars = example5();
  bars[19] = { ...bars[19], low: 98.0 }; // now lower than the breaker's 98.5
  return bars;
}

/** Example 4 — A bullish: the level is taken by a wick, and it was fresh. */
export function example4() {
  const bars = example2();
  bars[21] = { ...bars[21], close: 99.0 }; // closes back above 98 → pinbar grab
  bars[22] = { ...bars[22], open: 99.0 };
  return bars;
}

/** Example 1 — B bullish: same pinbar grab, but the level had been sitting there. */
export function example1() {
  resetClock();
  return [
    ...padding(16, FLAT),
    mk(100, 101, 99, 100.5), //     16
    mk(100.5, 101, 98, 98.5), //    17  valid low @ 98
    mk(98.5, 99.5, 98.2, 99.2), //  18
    ...padding(14, { open: 99.5, high: 100.0, low: 99.2, close: 99.6 }), // 19..32
    mk(99.6, 101.5, 99.4, 101.2), //33 BREAKER
    mk(101.2, 101.3, 97.0, 99.0), //34 grab: wick below 98, closes back above
    mk(99.0, 99.5, 98.5, 99.4), //  35
    mk(99.4, 102.5, 101.6, 102.3), //36 bullish FVG over the zone
    mk(102.3, 102.8, 102.0, 102.6), //37
    mk(102.6, 102.9, 102.4, 102.7), //38 developing
  ];
}

/**
 * Append `n` copies of the last bar. The Pine port reads a setup from a fixed
 * offset behind the current bar, so it needs a few bars of runway past the ones
 * the JS detector uses. Identical bars form no new fractals and no new FVGs.
 */
export function extend(bars, n) {
  const out = bars.slice();
  for (let i = 0; i < n; i++) out.push({ ...out[out.length - 1], time: out[out.length - 1].time + 300 });
  return out;
}
