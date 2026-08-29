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

## By session — the same fills, sliced by when the setup appeared

Buckets in exchange time (America/New_York): London 03:00–08:00, New York
08:00–17:00, Asia/overnight everything else.

| Session | Setups | Filled | 3R win% | **3R exp** |
|---|---|---|---|---|
| **Asia / overnight** | 301 | 223 | 30.0% | **+0.20** |
| London | 154 | 121 | 24.6% | −0.02 |
| New York | 285 | 195 | 22.4% | **−0.10** |

**Time of day matters more than the grade does** — a spread of 0.30R between
the best and worst session, against 0.66R between the best and worst grade on
samples an order of magnitude smaller.

But the direction is the opposite of the obvious prior: **Asia is the best
session and New York the worst.** The intuition that this method needs a time
filter is supported; "filter out Asia" is not.

A plausible mechanism, offered as a hypothesis and not as a finding: the setup
is a mean-reversion trade on a failed breakout. In quiet overnight ranges a
sweep tends to revert, which is exactly what the breaker needs. In New York,
displacement is real often enough that the "trap" simply keeps going and the
breaker fails.

This tests one of three ideas about context. A news-time filter and a
higher-timeframe daily bias are **still untested** — the NY result is weakly
consistent with news hurting, but that is not evidence.

## With the daily bias filter (SOURCE 2)

The video's rule: trade only in the direction of the daily bias, never against
it. Encoded per docs/CHRISFX.md §5.1 and applied to the same 740 setups.

| | Setups | Filled | win% | **exp** |
|---|---|---|---|---|
| no filter, 3R | 740 | 539 | 26.0% | +0.04 |
| **bias filter, 3R** | **51** | **30** | **40.0%** | **+0.60** |
| bias filter, 2R | 51 | 30 | 43.3% | +0.30 |

**The daily bias is the largest single effect we have measured** — a 15×
improvement in expectancy, and the only change that moved the method off the
breakeven line. It is also the one filter the author added *after* the deck,
which is consistent with him having found the same problem.

By session, with the bias filter on and a 3R target:

| Session | Setups | Filled | win% | exp |
|---|---|---|---|---|
| Asia / overnight | 14 | 8 | 37.5% | +0.50 |
| London | 18 | 11 | 27.3% | +0.09 |
| **New York** | 19 | 11 | **54.5%** | **+1.18** |

**New York flips from worst to best.** Without a bias it was −0.10R; with one
it is +1.18R. That reframes the session finding above: New York was not a bad
session, it was the session where trading without direction was punished
hardest — which is what you would expect where displacement is most real.

### 2R vs 3R

Cutting the target to 2R, closer to the author's stated minimum, **lowers**
expectancy: +0.30R against +0.60R. The win rate only rises from 40.0% to 43.3%,
nowhere near enough to pay for the smaller payoff. Winners that reach 2R
usually carry to 3R, so his "at least 2 to 1" is a floor rather than an optimum.

### Validated against the author's own example

`tests/chris_bias.test.js` runs the rule over real CME_MINI:NQH2025 daily bars
for the case study he works through on video. It reproduces his call exactly:
bullish for Friday 3 Jan 2025, off the 21006.50 low left on 20 Dec 2024 — the
same level he points at. His prediction also verified: Friday's high (21559.25)
took Thursday's (21490.50).

So the encoding is faithful on the one example we can check it against.

### Trying to loosen it — did not work

The strict rule fires on only 51 of 740 setups where the author has a bias
nearly every day, so we tried a looser encoding: the swept level is the extreme
of the prior 10 days rather than an untouched daily fractal.

| Bias encoding | Setups | Filled | win% | exp |
|---|---|---|---|---|
| **fractal** (untouched daily fractal) | 51 | 30 | 40.0% | **+0.60** |
| swing (prior 10-day extreme) | 52 | 32 | 21.9% | −0.13 |

It **did not loosen anything** — 52 setups against 51 — because making a new
10-day low and closing back above it is just as rare. It simply fires on a
different set of days, and those days are worse.

Read carefully, that is informative: what carries the edge is not "recovered
after a new low" but "took out liquidity that had been resting untouched". The
fractal condition is doing real work, not just being restrictive.

With 30 fills against 32 the difference could still be noise. A genuinely
looser encoding needs the author's actual containment reference — a **weekly**
range, which he uses explicitly and we have not implemented.

### The size of the caveat

51 setups and 30 fills. **This is a small sample and the effect could be
noise.** Our bias rule is also far stricter than the author's — it fires on 51
of 740 setups, while he describes having a bias almost every day. A looser
encoding closer to his would both grow the sample and test the rule properly;
until then, treat +0.60R as a promising signal, not a measured edge.

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
