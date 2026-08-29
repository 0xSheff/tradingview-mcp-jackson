# ChrisFX backtest — run 02: isolated setups, with footprint

Run 01 measured 239 of 740 setups because they all shared one account. This run
uses `scripts/chrisfx_stats.pine` instead: every setup is resolved
**independently** — its own entry, stop and target, no shared capital, no
margin, no position netting, no blocking. Both exit models are scored on the
**same** fills in a single pass, which is what makes them comparable.

Symbol/timeframe and range as run 01: `CME_MINI:MNQ1!` 15m, Oct 2025 – Aug 2026.
Expectancy is in **R** (multiples of the trade's own risk), so the size cap that
distorted run 01 cannot affect it.

## Entry at the zone edge

| Grade | Setups | Filled | 3R win% | **3R exp** | liq win% | **liq exp** | liq skipped |
|---|---|---|---|---|---|---|---|
| A++ | 6 | 4 | 50.0% | +1.00 | 33.3% | +0.68 | 3 |
| A+ | 273 | 196 | 24.7% | −0.01 | 24.0% | −0.11 | 142 |
| A | 416 | 305 | 24.7% | −0.01 | 15.2% | −0.45 | 232 |
| B | 45 | 34 | 41.2% | **+0.65** | 33.3% | +0.44 | 19 |
| **ALL** | **740** | **539** | **26.0%** | **+0.04** | **20.0%** | **−0.25** | |

201 setups never reached their entry. 20 bars contained both the stop and the
target — those are scored as losses (the pessimistic reading).

## Findings

**1. A+ and A are indistinguishable.** 24.7% win rate and −0.01R expectancy,
both. Characteristic 2 — "the breaker candle must be the extreme of the leg",
the rule the author uses to separate A++ from A+ — separates **nothing**
measurable here.

**2. The ranking inverts at the bottom.** B, his weakest grade, is the only
class with a clearly positive expectancy (+0.65R over 34 fills). A, which he
ranks above it, is flat.

**3. A++ cannot be judged.** 6 setups in eleven months, 4 filled. The +1.00R is
noise until the sample grows by an order of magnitude.

**4. Fixed 3R beats the liquidity target here — the reverse of run 01.**
+0.04R against −0.25R. Run 01 said the opposite because position interference
and the size cap distorted it; this measurement has neither, so trust this one.
The liquidity model also discards ~55% of setups on the 2R floor (396 of 740),
and wins less often on what is left.

**5. The whole thing sits on the breakeven line.** 26.0% win rate against the
25% a 3R target needs. +0.04R per setup is not an edge, it is noise.

## Entry at the footprint POC

`request.footprint()` on Premium, POC of the **breaker** candle, 4 ticks per row:

| Coverage | POC used | 3R win% | 3R exp |
|---|---|---|---|
| zone edge (baseline) | 0 | 26.0% | +0.04 |
| POC, 100-tick rows | 125 | 25.8% | +0.03 |
| POC of breaker, 100-tick rows | 168 | 26.8% | +0.07 |
| POC of breaker, 4-tick rows | 236 | 26.4% | +0.06 |

**The footprint step does not rescue the method on this data.** Across every
variant — 0% to 32% POC coverage — aggregate expectancy moved only between
+0.03R and +0.07R, and the grade ordering never changed once.

That is a weaker claim than "the footprint does not help", and it should stay
weak: coverage is still only 32%. The POC row sits on a global price grid, so
an edge row can protrude past the breaker candle and get rejected; the clamp
that fixes this is in `scripts/chrisfx_stats.pine` but the measurement above
predates it. A run at full coverage is still owed.

## Caveats

1. One symbol, one timeframe, eleven months.
2. A++ n=4 and B n=34 carry no weight on their own.
3. Bar-level resolution: when one bar holds both the stop and the target the
   trade is scored a loss. 20 of 539 fills (3.7%) hit that case.
4. Independent setups are the right lens for "does the method work" and the
   wrong lens for "what would my account have done" — that is run 01's job.
5. The detection is the same code the strategy uses, guarded by
   `tests/chris_pine_shared.test.js`, and agrees with `src/core/chris.js` on the
   author's own six examples via `tests/chris_pine_parity.test.js`.
