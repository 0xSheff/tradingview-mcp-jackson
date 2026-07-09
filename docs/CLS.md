# CLS Methodology Reference (David Perk)

Single source of truth for the CLS analysis implemented in this repo
(`src/core/cls.js`, CLI `cls`, skill `cls-analysis`). Compiled from David
Perk's public TradingView ideas — see [Sources](#sources). Where his paid
material leaves a definition open, the choice we made is marked **[repo
convention]** and is configurable via the `cls` section of `rules.json`.

---

## 1. Premise

FX order flow is aggregated and settled by CLS (Continuous Linked
Settlement, ~$7T/day). Orders collected during Asia are settled and the
resulting liquidity appears in the following sessions — producing a
repeating cycle: **consolidation → liquidity sweep (manipulation) →
distribution**. The tradeable unit of that cycle on any timeframe is the
**candle liquidity sweep**.

The narrative is native to FX (6E, DXY, EURUSD…). The mechanics apply to
gold and index futures as well (David publishes XAUUSD breakdowns using the
same rules), but flag those reads as *adapted*, not native.

## 2. Core definitions

- **CLS candle** — the previous *closed* candle on the analysis timeframe
  (W or D in this iteration). **[repo convention]** — matches David's
  candle-based examples; a swing-based range variant may be added later.
- **CLS range** — the CLS candle's high–low.
- **Liquidity sweep** — price trades beyond the range high/low (triggering
  clustered stops), then **closes back inside** the range. The close back
  inside is the confirmation that manipulation happened.
- **Acceptance** — price closes *beyond* the range extreme. Not a sweep:
  it signals continuation in the breakout direction.
- **Inside candle** — neither extreme taken: range building, no signal.
- **Double sweep** — both extremes taken (outside bar). If the close is
  back inside the range there is no clear signal; if it closes beyond one
  side, treat as acceptance of that side.

Classification table (signal candle vs CLS candle):

| Took high | Took low | Close                | Signal                    |
|-----------|----------|----------------------|---------------------------|
| yes       | no       | back inside          | sweep high → **M1 short** |
| yes       | no       | above range high     | acceptance → **cont. up** |
| no        | yes      | back inside          | sweep low → **M1 long**   |
| no        | yes      | below range low      | acceptance → **cont. down** |
| yes       | yes      | inside               | double sweep → no signal  |
| yes       | yes      | beyond one side      | acceptance of that side   |
| no        | no       | —                    | inside candle → no signal |

## 3. Entry models

### Model 1 — sweep → rejection → reversal
- Trigger: sweep confirmed (close back inside the CLS range).
- Direction: against the sweep (sweep of the high → short; low → long).
- Entry: after manipulation confirms on the execution timeframe
  (displacement — "big candles after sweeps signal readiness"); never on
  the first touch of the level.
- **Target: 50% of the CLS range** (first logical objective).
- **Invalidation: the sweep extreme** (the wick that took the liquidity).

### Model 2 — sweep/acceptance → pullback → continuation
- Trigger: acceptance (close beyond the range) or a completed M1 leg.
- Entry: pullback into the **reload zone, 61.8–80% retracement** of the
  impulse leg.
- Target: the extreme of the impulse leg, then the run through the range
  toward the opposite side.
- Invalidation: the origin of the impulse leg.
- **[repo convention]** the impulse leg is measured from the signal
  candle's opposite extreme to the furthest price printed since the
  signal.

## 4. Timeframe hierarchy

| TF   | Role                                                |
|------|-----------------------------------------------------|
| W/D  | Bias, CLS ranges, liquidity locations (this module) |
| H4   | Order-flow confirmation                             |
| H1   | Asia range, order blocks (session iteration — later)|
| M15  | Entry confirmation                                  |

HTF bias is non-negotiable: no HTF bias → skip the trade. Always ask
"where is the liquidity?" — daily/weekly closes drive even intraday reads.

## 5. Liquidity map

- Untaken swing highs/lows (fractals not yet exceeded) within the
  configured lookback are resting liquidity.
- **Equal highs / equal lows** (two swings within tolerance) are the
  strongest draws.
- Read of the daily close: closed above previous day's high without
  reaching a key level → liquidity above, expect continuation up; wicked
  above but closed below → liquidity likely below previous day's low.

## 6. Probability filters

Avoid (flags, not hard blocks — surface them in the brief):

- **3+ consecutive bullish daily candles → no fresh longs** (mirror for
  shorts). Wait for the pullback.
- W vs D signal conflict → reduced confidence, prefer the deeper pullback.
- Post-FOMC extreme ranges; before NFP / CPI; stacked high-impact news.

## 7. Instruments

David's core set: EURUSD, GBPUSD, USDCHF, DXY. In this repo the shared
`rules.json` watchlist is used; 6E/DXY are native CLS territory, MGC/MES/
MNQ are adapted. DXY stays bias-only — translate to 6E (see memory rules).

Quality over quantity: properly filtered, expect ~6 A-setups per week
across three pairs.

## Sources

Public TradingView ideas by [David_Perk](https://www.tradingview.com/u/David_Perk/):

- [Liquidity Sweep: All the Info You Ever Need to Conquer](https://www.tradingview.com/chart/EURUSD/HRhZCqWX-Liquidity-Sweep-All-the-Info-You-Ever-Need-to-Conquer/)
  — sweep definition, M1/M2 rules, 50% target, 61.8–80% reload zone.
- [Understand Asia Session & Conquer London Setups](https://www.tradingview.com/chart/EURUSD/biqplj21-Understand-Asia-Session-Conquer-London-Setups/)
  — session framework, TF hierarchy, probability filters (kept here for
  the future session iteration).

Exact key-level definitions and fine-tuned filters are part of his paid
course and are **not** reproduced here; where needed we approximate and
mark the choice as [repo convention].
