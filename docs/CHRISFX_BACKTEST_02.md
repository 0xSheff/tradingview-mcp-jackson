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

> ### Superseded — read run 03 below
>
> The +0.60R figure came from 30 fills produced by an encoding far stricter
> than the author's. Once his actual everyday rule is used, the sample grows
> tenfold and the effect disappears. The tables in this section are kept
> because the comparison between them is the finding, not because the numbers
> stand.

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


---

# Run 03 — the author's own bias rule, and a longer zone life

Two corrections to run 02, both from the third transcript.

## Zone lifetime

The author extends a breaker and leaves it "at least four weeks, maybe two
months". Run 02 abandoned an untouched entry after 30 bars and an open one
after 200. Raised both to 500 (~4 weeks on 15m).

| | Setups | Filled | win% | exp |
|---|---|---|---|---|
| run 02 (30/200 bars) | 740 | 539 | 26.0% | +0.04 |
| **run 03 (500 bars)** | 740 | **692** | 26.6% | +0.06 |

**153 setups were being thrown away by a timeout the method does not have.**
The recovered ones perform like the rest, so the timeout was not hiding an
edge — but the sample is now complete and faithful to the source.

## The daily bias, measured properly

`composite` — the everyday previous-day rule with a continuation call overridden
by deeper liquidity (docs/CHRISFX.md §5.1–5.2), which is the encoding that
reproduces his call on 3 Jan 2025.

| Bias encoding | Setups | Filled | win% | **exp** |
|---|---|---|---|---|
| none | 740 | 692 | 26.6% | +0.06 |
| fractal (run 02, strict) | 51 | 30 | 40.0% | +0.60 |
| **composite (his actual rule)** | **360** | **336** | **25.2%** | **+0.01** |

**The bias filter does not produce an edge.** His rule fires on roughly half of
all setups — 336 fills against the fractal rule's 30 — and on that sample
expectancy is +0.01R, indistinguishable from the +0.06R of taking everything.

The run 02 result was a 30-fill sample. It is now superseded: with a sample ten
times larger and the author's own rule rather than our stricter proxy, the
"largest effect we have measured" is not there.

By session, with the composite bias on:

| Session | Setups | Filled | win% | exp |
|---|---|---|---|---|
| Asia / overnight | 134 | 129 | 26.0% | +0.04 |
| London | 77 | 67 | 21.2% | −0.15 |
| New York | 149 | 140 | 26.3% | +0.05 |

The bias flattens the session spread rather than creating edge: New York
recovers from −0.11R to +0.05R, Asia falls from +0.25R to +0.04R. Filtering by
direction stops the worst session losing; it does not make any session pay.

## Where that leaves the method

On MNQ 15m over eleven months, with the detection validated against the
author's own graded examples and the bias validated against his own worked
trade, every configuration we have measured sits between −0.01R and +0.07R per
setup. That is the breakeven line, not an edge.

What has *not* been ruled out, in rough order of promise:

1. **B keeps showing up.** 42.9% and +0.71R here, +0.65R in run 02 — the only
   class that is consistently positive, and it is the author's weakest grade.
   Still only ~20-40 fills, but it has survived every configuration change.
2. Other instruments and timeframes — this is one symbol.
3. The footprint at full POC coverage (currently 32%).
4. A news filter, which nothing here tests.


---

# Run 04 — how far setups actually run

Rather than guess a better target than a fixed 3R, measure the **maximum
favourable excursion** of every setup: how far it ran before its stop would
have closed it. Because MFE is measured to the stop, `P(MFE >= X)` *is* the win
rate a fixed X-R target would have produced.

The resolution also improved: each 15m bar is now walked through its 1-minute
sub-bars, so the order of stop vs target is read rather than assumed. The
intrabar budget runs out on older history — 209 of 690 setups resolved that
way, 449 still fall back to the pessimistic bar-level rule.

## The excursion distribution — 690 resolved setups

| reached | >=1R | >=2R | >=3R | >=5R | >=10R | >=15R | >=20R | avg |
|---|---|---|---|---|---|---|---|---|
| share | 68.6% | 42.9% | 31.3% | 18.1% | 8.8% | 6.4% | 4.5% | **4.19R** |

**The tail is real.** Average excursion is 4.19R, and 8.8% of setups run 10R or
more. On MNQ a fixed 3R does cut those off.

## But cutting them off is correct

Expectancy of a fixed target follows directly from the table:

| target | win rate | expectancy |
|---|---|---|
| **1R** | 68.6% | **+0.372R** |
| 2R | 42.9% | +0.287R |
| 3R | 31.3% | +0.252R |
| 5R | 18.1% | +0.086R |
| 10R | 8.8% | −0.032R |
| 20R | 4.5% | −0.055R |

The probability of reaching a target falls faster than the payout rises, all
the way down. **A fixed 3R is not too small — every larger target is worse, and
every smaller one is better.** The 15R row (+0.024R) is bucket noise, not a
reversal of the trend.

That settles the question as posed, but it also points at the answer the
question was reaching for: no *single* target can both bank the 68.6% that
reach 1R and ride the 8.8% that reach 10R. A partial exit can. Banking half at
1R and letting the rest run is the author's own approach, and this distribution
is exactly the shape that rewards it — that is run 05.

## Side effect of the intrabar fix

The liquidity exit model improves from −0.27R to −0.04R once the order of stop
and target is read rather than assumed. Its targets sit further away, so more
bars contained both, and it was carrying most of the pessimism. The fixed-3R
model barely moves (+0.06R to +0.05R).


---

# Run 05 — partial exits, and the target the data actually wants

## The partial model

Bank `partialPct` at `partialAtR`, let the rest run to `runnerR`. Measured as a
third track on the same fills.

| Exit model | exp | runner / scratch / loss |
|---|---|---|
| fixed 3R | +0.05 | |
| liquidity, skip under 2R | −0.04 | |
| partial 0.5 at 1R, runner to 10R, **stop to breakeven** | +0.01 | 22 / 372 / 297 |
| partial 0.5 at 1R, runner to 10R, **stop stays** | +0.05 | 60 / 330 / 297 |

**Moving the stop to breakeven destroys the tail.** Of the 394 setups that
reached 1R, only 22 went on to 10R with a breakeven stop, against 60 when the
original stop is kept — price returns to entry far more often than it completes
the move. But keeping the stop costs the runner a full R when it fails, and the
two effects cancel: both variants land on the same place as everything else.

> A bookkeeping bug inflated the second variant to +0.29R in the first
> measurement: the runner half was credited 0R instead of −1R when it was
> stopped at the original stop. Fixed; the corrected figure is +0.05R.

## The target the data wants

Run 04's excursion curve implied smaller targets are better all the way down.
Measured directly:

| Fixed target | win rate | **expectancy** |
|---|---|---|
| **1R** | **57.1%** | **+0.14** |
| 2R | — | +0.29 (run 02, bias-filtered subset) |
| 3R | 26.2% | +0.05 |

**A fixed 1R target is the best exit measured**, and it is positive on every
class with a usable sample — A+ +0.12, A +0.15, B +0.24 — and in every session:
Asia +0.20, London +0.11, New York +0.09. It is the first configuration that is
positive everywhere rather than on one slice.

Bracket the truth honestly: the excursion data says 68.6% of setups reach 1R,
the measured win rate is 57.1%. The gap is the bar-level ambiguity on the 449
setups without 1-minute data, where a bar holding both the target and the stop
is scored a loss. The real number sits between the two, so +0.14R is a floor.

## Where this leaves the exits

The original question was whether a fixed 3R was too small for MNQ, given moves
that run 15R. The answer is the opposite of the intuition: the tail is real
(8.8% reach 10R) but far too thin to pay for the 68.6% that reach 1R and the
43% that never do. Every attempt to capture the tail — larger fixed targets,
liquidity targets, partials with a runner — lands on or below the breakeven
line. Taking 1R quickly is what this edge, such as it is, actually looks like.

That is also the closest thing to what the author describes doing: in the third
transcript he says he mostly books 1.3–1.5R rather than chasing 2R.
