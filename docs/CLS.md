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

The tradeable candle is the **developing** one (this week / today). It is
the manipulator: whichever extreme of the **previous closed candle** it
sweeps sets the direction. The move is **mean reversion** toward the
middle of the range.

- **CLS range** — the range whose middle Model 1 targets. Its baseline is
  the **previous closed candle** on the analysis timeframe (W or D). It
  **merges** with the candle before it (up to `max_merge_candles`, **2** by
  default) when the developing candle sweeps a *deeper uncovered* extreme:
  then `range = [deepest swept low, highest high across the merged candles]`
  for a long (mirror for a short). Two closed weeks is the hard limit —
  deeper gets complex and less predictable. Implemented by
  `buildActiveSetup` in `src/core/cls.js`.
- **Manipulation / sweep** — the developing candle trades beyond the
  previous candle's low (→ **long**) or high (→ **short**). Direction is
  always *against* the swept side, back toward the middle.
- **Uncovered extreme** — a closed-candle low/high that no later closed
  candle has traded through: resting HTF liquidity. The staircase of
  uncovered lows (or highs) walking back from the last closed candle
  (`uncoveredExtremes`) gives the candidate levels.
- **Active vs deeper levels** — the **active** setup anchors at the
  deepest uncovered extreme the developing candle has **actually swept**.
  Deeper uncovered extremes not yet reached are **pending** setups
  (`deeper_levels`): they arm only once price trades to them, at which
  point the range merges down/up to include them (David's "if we fall to
  the lower line, the whole range becomes the two blue lines").
- **M1 target = middle (50%) of the CLS range**; **M2 target = the
  opposite extreme** (full range). Stop = the manipulation wick.
- **Level strength** — weekly extremes are **strong**, daily **weak**; an
  active setup at a weekly extreme outranks the same at a daily one.
- **NWOG** — New Week Opening Gap: Friday close → Sunday open. An unfilled
  NWOG on the target side is confluence (a draw toward the objective).
- **Acceptance** — the developing candle *closes beyond* the swept
  extreme rather than reverting: not a mean-reversion setup (continuation
  in the breakout direction instead).

`classifySignal` / `model1Levels` remain as tested lower-level primitives
(candle-vs-range classification) but the actionable read is the
developing-sweep model above (`buildActiveSetup` → `analyzeTimeframe`).

## 3. Entry models

### Model 1 — sweep → rejection → reversal
- Trigger: sweep confirmed (close back inside the CLS range).
- Direction: against the sweep (sweep of the high → short; low → long).
- Entry: after manipulation confirms on the execution timeframe
  (displacement — "big candles after sweeps signal readiness"); never on
  the first touch of the level.
- **Target: 50% of the CLS range** (first logical objective — "trade
  range runs roughly to the middle of the bar").
- **Invalidation: the sweep extreme** (the wick that took the liquidity).

#### Model 1 execution — AMD at the key level (morning routine)

The HTF signal candle is traded **while it is developing** — waiting for
the W/D close means missing the trade. "Close back inside" confirmation
happens on the execution TF (M15; H1 close is usually too late — on the
2026-07-13 6E trade the H1 displacement close was already within 5 pips
of the target). The morning check is an AMD sequence at a key level:

1. **Accumulation** — Asia consolidates in a tight range at/near the key
   level (PWH/PWL strong, PDH/PDL weaker).
2. **Manipulation** — price wicks through the level and the execution-TF
   candle closes back inside. This is the sweep; its extreme is the stop.
3. **Distribution** — CIOD (change in order flow): a displacement candle
   in the reversal direction. Enter only after that candle closes.

If Accumulation + Manipulation are present in the morning, that is the
trade: target 50% of the CLS range, stop beyond the manipulation
extreme. Distribution/CIOD is the entry timing, not part of the setup
decision.

**Detection [repo convention]** — `detectAMD()` in `src/core/cls.js`, run
by the brief on closed execution-TF bars of the current session against
every key level (PWH/PWL/PDH/PDL). Configurable via `rules.json →
cls.amd`. State machine per level:

| Status       | Meaning                                                      |
|--------------|--------------------------------------------------------------|
| NO_SETUP     | no bars near the level (proximity band = `proximity_ratio` × CLS range) |
| ACCUMULATING | bars near the level, extreme untouched; quality `ok` when ≥ `acc_min_bars` bars fit inside `acc_max_range_ratio` × CLS range |
| SWEEPING     | wick beyond the level, last close still beyond — unconfirmed |
| MANIPULATED  | sweep reclaimed (close back inside) — setup armed, await CIOD |
| CONFIRMED    | CIOD closed: reversal bar with body ≥ `ciod_body_mult` × avg prior body closing through the last `ciod_structure_bars` bars' structure — entry |
| INVALIDATED  | penetration > `max_penetration_ratio` × CLS range — acceptance risk |

Output per level: entry (CIOD close), stop (sweep extreme), target
(`target_ratio` of the CLS range), RR.

Worked example (6E, Mon 2026-07-13, weekly CLS range 1.1423–1.14955):
NWOG gap-down off Friday's 1.1444 close; Asia accumulated 1.1414–1.1439
on PWL 1.1423; manipulation wicks 1.1418 and 1.14135 closed back above;
London displacement 1.1431 → 1.14545; 50% target 1.14593 hit within the
hour (day ran to 1.1476 ≈ 73% of the range).

### Model 2 — the continuation entry after a completed Model 1

Model 2 is the **second, effectively risk-free** entry David Perk takes
once Model 1 has paid out. M1 captures the reaction off the sweep; if the
market makers did not fill enough size, price returns to the discount to
load more — that return is Model 2, the expansion. Because you are
risking booked M1 profit, the psychology is clean.

- **Precondition: Model 1 completed** — price reached the 50% target of
  the CLS range. No M1 completion → no M2. (In the detector this is the
  `m1_target_hit` flag; M2 is `null` until it flips true.)
- **Impulse leg** — from the **manipulation extreme** (the M1 sweep wick,
  = the stop) to the **furthest price the M1 impulse printed**.
- **Entry: pullback into the reload zone, 61.8–80% retracement** of that
  impulse leg — ideally where the zone overlaps another key level (the
  detector reports these as `confluence`; NWOG counts too).
- **Target: the full CLS range** — the opposite extreme of the CLS
  candle, not the 50% midpoint. This is the bigger-R leg.
- **Invalidation / stop: the manipulation extreme** — the same wick that
  invalidated M1. A close beyond it kills M2.

M2 status in the detector: `AWAIT_PULLBACK` (price still above the zone),
`ARMED` (price in the discount zone — the `deep` flag warns it slipped
past 80%, close to invalidation), `INVALIDATED` (broke the manipulation
extreme), `COMPLETE` (already ran the full range).

**Two scales, one setup.** David reads Model 2 straight off the HTF
structure — *"once we have the CLS range: Model 1 buying after the
manipulation and Model 2, the 61.8 fib pullback… looks like potential
Model 2, right?"* So the module computes M2 at both scales:

- **HTF / prospective** (`analyzeTimeframe.model2`, W and D) — the moment
  the previous *weekly/daily* candle completes an M1 (`m1_target_hit`),
  the coming pullback is projected as a multi-day "potential Model 2".
  This is the read David publishes days ahead of the entry.
- **Intraday / execution** (`detectAMD` `.model2`) — the same plan on the
  execution TF once an intraday M1 completes in the session.

Both use the identical geometry (`model2Plan`): leg = manipulation
extreme → impulse extreme, zone 61.8–80%, target = full range, stop =
manipulation extreme. Model 2 is **not** triggered by acceptance — the
trigger is a *completed Model 1*.

Worked example (6E, 2026-07-13, weekly range 1.1423–1.14955): M1 long off
PWL completed at the 1.14593 midpoint; the impulse ran 1.14135 → 1.1476,
so the M2 reload zone is ≈1.1426–1.14374 (61.8–80%), target the full
range at 1.14955, stop 1.14135. Price later drove back through the zone
and wicked below 1.14135 — M2 invalidated, M1 profit already banked. This
is the detector's `INVALIDATED` path and shows the shared stop working as
the filter.

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

## 7. Morning routine (no live monitoring)

The workflow is a **single ~09:00 (Europe/Athens) pass**, not intraday
babysitting. Asia has closed; London opens ~10:00. At 09:00 the whole
"Asia accumulates → London manipulates/distributes" cycle is already
computable, so the pass answers one question per symbol: **is a setup
worth waiting for in the next 60–90 minutes, or skip the day?**

**The two-layer, per-day model.** We detect the model *for today*, each
morning right after the Asian session:

- **Weekly setup persists all week.** Once the developing weekly candle
  sweeps the previous week's extreme, `analyzeTimeframe` shows the
  setup (direction, CLS range, middle target) for the rest of the week.
- **The manipulation can land on *any* day's Asian session.** So the AMD
  layer checks **today's** session only (`detectAMD` on the current day's
  execution-TF bars) — "is *today* the day the weekly level gets
  accumulated → manipulated → continued?" A fresh check every morning.
- **Continuation plays out during the day; the trade can run up to ~3
  days** toward the middle (M1) and, on a completed M1, the opposite
  extreme (M2). Managing an in-progress multi-day trade is manual — the
  morning pass is for *finding* the day the setup triggers, not babysitting
  one already entered.

This is why the AMD session window is one day, not the whole week: it is
by design, not a limitation.

The brief's `outlook` layer (`clsOutlook`) grades each symbol from the
AMD level reads:

| Verdict | Meaning                                                        |
|---------|----------------------------------------------------------------|
| WAIT    | a level is armed/forming (MANIPULATED/CONFIRMED, tight accumulation, or a sweep in progress) — stay and wait for the CIOD trigger |
| WATCH   | nothing armed, but a key level sits within `reach_ratio` × CLS range of price — reachable by the London impulse; watch the open |
| SKIP    | levels out of reach, invalidated, or nothing actionable        |

Strong (weekly) levels outrank weak (daily) ones at the same status. Each
non-SKIP verdict carries a **decide-by clock** (`session_open_local +
timebox_min`, default 11:30): if the manipulation/CIOD has not printed by
then, the day is skipped. London CLS setups resolve in the first ~90
minutes, so this is a natural cutoff.

Honest limits of a one-shot pass: it does not catch setups that only form
on the NY open, and it does not read the news calendar — filter NFP/CPI/
FOMC by hand (§6). A second short pass (`cls scan`) around the London
open closes most of the NY gap if wanted.

## 8. Instruments

David's core set: EURUSD, GBPUSD, USDCHF, DXY. In this repo the
`watchlists.json` `cls` list is used — currency futures (6E/6J/6C/6S/6A/6N/6B),
native CLS territory. DXY stays bias-only — translate to 6E (see memory rules).

Quality over quantity: properly filtered, expect ~6 A-setups per week
across three pairs.

## Sources

Public TradingView ideas by [David_Perk](https://www.tradingview.com/u/David_Perk/):

- [Liquidity Sweep: All the Info You Ever Need to Conquer](https://www.tradingview.com/chart/EURUSD/HRhZCqWX-Liquidity-Sweep-All-the-Info-You-Ever-Need-to-Conquer/)
  — sweep definition, M1/M2 rules, 50% target, 61.8–80% reload zone.
- [Understand Asia Session & Conquer London Setups](https://www.tradingview.com/chart/EURUSD/biqplj21-Understand-Asia-Session-Conquer-London-Setups/)
  — session framework, TF hierarchy, probability filters (kept here for
  the future session iteration).
- [EURUSD Weekly CLS Model 1 NWOG Setup](https://www.tradingview.com/chart/EURUSD/T6TS8LZm-EURUSD-Weekly-CLS-Model-1-NWOG-Setup/)
  — live Model 1 long (2026-07-13): manipulation into the key level below
  the CLS range, CIOD confirmation, entry after candle close, target 50%
  of the CLS range; NWOG as confluence.
- [CLS Model 2 — 100% Mechanical Trading Setup](https://www.tradingview.com/chart/USDCHF/9J9uVNbL-CLS-Model-2-100-Mechanical-Trading-setup/)
  — Model 2 as the continuation after Model 1; 61.8–80% pullback, full-range
  target, effectively risk-free (risking booked M1 profit).
- [GOLD — How to Catch Next Explosive Move](https://www.tradingview.com/chart/XAUUSD/r4hLAjO7-GOLD-How-to-Catch-Next-Explosive-Move/)
  — Model 2 read straight off HTF structure ("Model 1 buying after the
  manipulation and Model 2, the 61.8 fib pullback… potential Model 2"),
  the basis for the prospective HTF `analyzeTimeframe.model2`.

Exact key-level definitions and fine-tuned filters are part of his paid
course and are **not** reproduced here; where needed we approximate and
mark the choice as [repo convention].
