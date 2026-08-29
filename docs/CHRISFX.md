# ChrisFX Breaker Block Methodology Reference

Source: *"BREAKER BLOCKS AND TRADING PLAN — ChrisFX Concepts"* (41 slides).
This file is the single source of truth for the `chris` branch. Detection code
lives in `src/core/chris.js`, tunables in `rules.json` → `chris`.

> **Two kinds of statement in this document.**
> Lines marked **[SOURCE]** are the author's rules, restated.
> Lines marked **[CALIBRATION]** are numbers *we* chose because the source
> states the rule qualitatively and never quantifies it. Every calibration maps
> to a key in `rules.json` and is meant to be tuned. Do not present a
> calibration to the user as if ChrisFX specified it.

---

## 1. Premise

Retail traders are trained to read a full-bodied close beyond a prior high/low
as a Break Of Structure and to trade the continuation. ChrisFX trades the
opposite side of that reflex: the strongest setups are the ones where the
liquidity grab looked *most* like a legitimate BOS, because that is where the
largest crowd is positioned wrong and gets stopped out. **[SOURCE]**

Everything in the grading system measures one thing: *how many traders were
fooled by the grab.* More manipulation → higher grade → more risk.

The method is timeframe- and session-agnostic — the author works 5m/15m and
states explicitly that it "works every time of the day". **[SOURCE]**

---

## 2. Core definitions

### 2.1 Liquidity point

A **valid low** is a candle whose low is lower than the low of the candle to its
left *and* the candle to its right. A **valid high** is the mirror.
**[SOURCE, slide 18]**

- `liquidity.fractal_strength` = 1 — the literal reading of the slide.
  **[CALIBRATION]** for any value > 1.
- `liquidity.lookback` = 60 bars — how far back we hunt for levels.
  **[CALIBRATION]**

### 2.2 Grab of liquidity

The move that trades through the level. Two flavours, and this is the primary
grading axis:

| Flavour | Condition | Meaning |
|---|---|---|
| **Body grab** | candle closes fully beyond the level (`close < level` / `close > level`) | looks like a BOS, traps the crowd |
| **Wick grab** | candle trades beyond the level but closes back inside (pinbar) | reads as a rejection, traps far fewer |

**[SOURCE, slides 6, 10, 13]**

"Impulsive" is required for the body grab but never quantified.
**[CALIBRATION]**

- `grab.impulse_body_atr_mult` = 1.3 — body >= 1.3 x ATR(14)
- `grab.impulse_body_ratio` = 0.6 — body >= 60% of the candle's full range

### 2.3 The breaker candle

- **Bullish breaker** = the most recent **bullish** candle *before* the
  down-move that grabbed the liquidity.
- **Bearish breaker** = the most recent **bearish** candle *before* the up-move
  that grabbed the liquidity.

**[SOURCE, slides 19, 32, 39]** — slide 32 adds that the breaker candle must
*precede* the last grab of liquidity; slide 31 warns that colour is decided by
the close, so zoom in: a doji that closed green is a green candle.

### 2.4 The breaker zone

The **whole candle including its wicks** (high → low), extended to the right.
**[SOURCE, slide 33]**

- `zone.extend_bars` = 40, `zone.max_age_bars` = 120 **[CALIBRATION]**

### 2.5 FVG confluence — the validity gate

The zone must overlap, **totally or partially**, with a Fair Value Gap.
Without it the breaker is not traded. **[SOURCE, slides 19, 33, 39]**

FVG = standard 3-candle imbalance. Bullish: `low[k+1] > high[k-1]`; bearish:
`high[k+1] < low[k-1]`.

- `fvg.require` = true **[SOURCE]**
- `fvg.min_overlap_ratio` = 0.0 (any overlap counts — "partially")
  **[CALIBRATION]**
- `fvg.search_bars_after_grab` = 5 **[CALIBRATION]**

### 2.6 Point of invalidation

The absolute extreme of the grab — the lowest low (bullish) or highest high
(bearish) reached before the reversal. If price passes it, the trade is wrong
by definition. **[SOURCE, slides 27, 36]**

---

## 3. The grading system

Two independent binary characteristics, applied in this order.

**Characteristic 1 — how the liquidity was grabbed.**
Full-body close beyond the level (maximum manipulation) vs. a wick/pinbar
(little manipulation). This alone separates {A++, A+} from {A, B}.
**[SOURCE, slides 5, 6, 10, 13]**

**Characteristic 2 — is the breaker candle the extreme of the leg?**
For a bullish breaker: is it the **highest** candle before the down-move that
grabbed liquidity? For a bearish breaker: the **lowest** candle before the
up-move? **[SOURCE, slides 8, 11]**

| Grade | Char. 1 (body grab) | Char. 2 (breaker = leg extreme) | Level age | Risk on 50k prop |
|---|---|---|---|---|
| **A++** | yes | **yes** | — | $500 |
| **A+**  | yes | no | — | $300 |
| **A**   | no (wick) | — | swept instantly from the left | $200 |
| **B**   | no (wick) | — | level lived longer to the left | $100 |

**[SOURCE, slides 2, 8, 11, 13, 15]** — the dollar figures are the author's own
on a "50k" prop account (real capital 2–2.5k), i.e. 1% / 0.6% / 0.4% / 0.2%.

### 3.1 The A++ → A+ downgrade

Slide 38: even with a body grab *and* the breaker at the leg extreme, a
**pinbar before the reversal** — i.e. the reversal is not immediate — makes it
A+, because the delay means fewer traders were trapped.

A second modifier is ours: the source treats "impulsive" and "full body close"
as one characteristic, but says nothing about a full-body close that is *not*
impulsive. We downgrade that case one notch too. **[CALIBRATION]**

Either modifier costs **one notch, never two**, and a body grab is **clamped at
A+**: A and B are wick-grab classes by definition, so a weak body grab can never
fall into them. `grade_modifiers` in the output names which modifier fired even
when the grade is already A+ and the notch has nowhere to go.

- `reversal.instant_max_bars` = 3 — the reversal must reclaim the liquidity
  level within 3 bars of the grab, else downgrade one notch. **[CALIBRATION]**
- `reversal.leg_lookback_bars` = 10 — window used to decide "extreme of the
  leg" for characteristic 2. **[CALIBRATION]**

### 3.2 A vs B

Identical setups; the only difference is how long the liquidity level existed
before it was taken. A = swept instantly from the left, B = the level lived
"a little bit longer to the left". **[SOURCE, slide 15]** No bar count is given.

- `liquidity.fresh_max_age_bars` = 12 (≈1 hour on 5m): age <= 12 → A, else B.
  **[CALIBRATION]**

### 3.3 Reference examples

Slide 2 grades six schematics. They are the fixtures in `tests/chris.test.js`:

| # | Grade | # | Grade | # | Grade |
|---|---|---|---|---|---|
| 1 | B | 3 | A+ | 5 | A++ |
| 2 | A++ | 4 | A | 6 | A+ |

---

## 4. Execution

### 4.1 POC refinement (the footprint step)

The author drops to a **footprint chart on the same timeframe**, marks every
high-delta / POC cell inside the breaker zone, extends them right, and enters
from the edge of that POC cluster: **the highest POC for longs, the lowest POC
for shorts**. **[SOURCE, slides 20–22, 34–35, 41]**

There are two ways to get this data, and which one you have depends on the
TradingView plan. Both publish boxes that `data_get_pine_boxes` reads back into
`attachPocLevels()`, so **`src/core/chris.js` is identical either way** — only
the Pine script differs.

**Real footprint — Premium / Ultimate.** Since Pine v6 (January 2026),
`request.footprint(ticksPerRow, valueAreaPercent)` exposes genuine order flow
to scripts: `footprint.poc()`, `.vah()`, `.val()`, `.delta()`, `.rows()`, and
per-row `volume_row.up_price()`, `.down_price()`, `.buy_volume()`,
`.sell_volume()`, `.delta()`, `.has_buy_imbalance()`, `.has_sell_imbalance()`.
That covers the author's step exactly — the real POC and the real imbalance
cells he highlights, not a reconstruction. It returns `na` on plans below
Premium, and on bars with no footprint data.

**Approximation — every plan below Premium.** `scripts/chrisfx_poc.pine` uses
`request.security_lower_tf` to pull 1-minute bars inside each execution candle,
builds a volume-at-price histogram plus a signed up/down-volume delta per bin,
and publishes the POC bins as boxes. The intrabar cap is 100K on all
non-professional plans including the free one, so this works everywhere — but
it is **not** exchange bid/ask footprint: direction is inferred from each
sub-bar's close. Whenever a report uses these levels, say they are approximate.

- `poc.lower_tf` = "1", `poc.bins` = 24, `poc.min_delta_ratio` = 0.15
  **[CALIBRATION]**

### 4.2 Stop placement — three variants

All three are the author's, offered as a spectrum rather than a ranking:
**[SOURCE, slides 25–27, 41]**

1. **Beyond the POC extreme** — tightest, enormous RR, low win rate.
2. **Beyond the breaker zone** — the middle option.
3. **Beyond the point of invalidation** — "safest", explicitly *not* "ideal".

Slide 41: "the tighter your stop loss is, the more times you will get stopped
out" — the choice belongs to the trader, so the scanner reports all three.

### 4.3 Targets

**The source document defines no targets at all.** It covers entries and stops
only, and mentions partials in passing without rules. Everything below is ours:

- `targets.rr_levels` = [2, 3] — R-multiples off the chosen stop
- `targets.use_opposing_liquidity` = true — nearest unswept fractal on the
  opposite side, reported as the structural target

**[CALIBRATION]** — flag these as our addition whenever they are reported.

---

## 5. What the source does not specify

Carry these caveats into every report:

1. No HTF bias filter — the author claims the setup works on all timeframes at
   any time of day, with no directional context requirement.
2. No target/exit framework (see §4.3).
3. No maximum trades per day, no news filter, no correlation rules.
4. No guidance on what invalidates a *pending* zone other than the point of
   invalidation being breached.

---

## 6. Instruments

`watchlists.json` → `chris`: MNQ, MGC, 6J, 6B, 6E. Execution timeframes 5m and
15m per `rules.json` → `chris.timeframes`.

---

## Sources

`tmp/BREAKER BLOCKS CHRISFX (2).pdf` — slide numbers cited inline above.
