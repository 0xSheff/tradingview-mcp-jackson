# ChrisFX backtest — run 01

First run of `scripts/chrisfx_strategy.pine`. Recorded so the numbers survive
the session; **treat every one of them as provisional** — the caveats at the
bottom are not boilerplate, several are large enough to flip a conclusion.

## Setup

| | |
|---|---|
| Symbol / timeframe | `CME_MINI:MNQ1!` · 15m |
| Range | Oct 1 2025 – Aug 28 2026 (~11 months) |
| Account | 50,000 USD, `margin_long/short = 4` |
| Sizing | Constant risk 500 USD, capped at 10 contracts |
| Stop | Beyond the breaker zone |
| Fills | Bar Magnifier on |
| Detection | defaults from `rules.json` → `chris` |

Detection tally: **740 setups detected, 685 armed, 185 timed out, 55 skipped as
opposite-direction** (Pine nets positions and cannot hold both sides).

## By grade — fixed 3R target

| Grade | Trades | Win rate | Profit factor | PnL |
|---|---|---|---|---|
| **A++** | 4 | 50.00% | 2.512 | +2.90% |
| **A+** | 189 | 24.87% | 0.951 | −5.54% |
| **A** | 294 | 26.19% | 0.741 | −55.46% |
| **B** | 34 | 29.41% | 1.338 | +6.16% |
| all | 239 | 22.59% | 0.557 | −86.05% |

**The author's gradation does not hold on this data.** B — his weakest class —
has the best win rate of the three classes with a usable sample, and A, which he
ranks above it, is the worst. A++ looks excellent but n = 4 and means nothing.

Win rates cluster in a 22–29% band across every grade. With a 3R target,
breakeven is 25%. So the grading separates almost nothing here, and the whole
set sits on the breakeven line rather than above it.

## By exit model — all grades

| Exit model | Trades | Win rate | Profit factor | PnL |
|---|---|---|---|---|
| Fixed 3R | 239 | 22.59% | 0.557 | −86.05% |
| Nearest liquidity, skip below 2R | 231 | 18.61% | 0.744 | −35.34% |

The liquidity target wins on profit factor despite a **lower** win rate — its
targets sit further out on average, so the winners are worth more than 3R.
Neither is profitable. Skipping setups whose nearest liquidity is worth less
than 2R (rather than stretching the target to 2R) costs few trades: 231 vs 239.

## Caveats — read before quoting any number above

1. **The size cap binds on 222 of 685 arms.** Those trades are not
   R-normalised, so PnL and profit factor are distorted. Win rate is the only
   figure here that the cap does not touch.
2. **Concurrent positions stack risk.** `pyramiding = 100` lets many trades run
   at once, which is right for measuring the method and wrong for an equity
   curve. The 86% drawdown is an artefact of that, not a property of the setup.
3. **Per-grade runs are not strictly comparable to the combined run.** Enabling
   fewer grades changes which setups get blocked as opposite-direction, so A
   alone produces 294 trades while all grades together produce 239.
4. **One symbol, one timeframe, ~11 months.** Nothing here generalises yet.
5. **A++ n = 4, B n = 34.** Both far too small to carry a conclusion.
6. Entries are at the zone edge — **the footprint/POC step is not applied**, and
   that is where the author claims his edge comes from.

## What would make run 02 worth trusting

- Raise the contract cap or lower risk-per-trade until the cap stops binding,
  so profit factor becomes meaningful.
- Run longs-only and shorts-only separately to remove the opposite-direction
  blocking, then combine.
- Extend to the full `chris` watchlist and to Deep Backtesting's full range for
  a real A++ sample.
- Add the `request.footprint()` POC entry and compare against the zone edge on
  the same setups.
