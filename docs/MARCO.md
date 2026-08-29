# Marco Accettone (Inter Equity Trading) — Liquidity Blocks Reference

This file is the single source of truth for the `marco` branch.

Sources — four public videos from the **Inter Equity Trading** YouTube channel
(@InterEquity, Marco Accettone). Rules below are distilled from the full
auto-generated transcripts of:

| Ref | Video ID | Title | What it contributes |
|---|---|---|---|
| **V1** | `GIYrW7FC06M` | Liquidity Inducement Entries (LIQUIDITY BLOCKS) | LB definition, creation logic, stop-loss rule, priority rule |
| **V2** | `yIYY_jYy3sE` | The ONLY Entry Model You Need (SNIPER ENTRIES) | The 4-candle fractal entry model |
| **V3** | `pQ4WTVQnwBc` | ADVANCED Liquidity Concepts ON GOLD | Full trade story: no-man's land, intact lows as targets, management |
| **V4** | `hKh3-f3oAO8` | $10,000 Liquidity Inducement Trade in 4 MINUTES | Liquidity build-up, waiting for the trap, pre-framing targets |

> **Two kinds of statement in this document.**
> Lines marked **[SOURCE]** are the author's rules, restated from the
> transcripts. Lines marked **[CALIBRATION]** are numbers *we* chose because
> the source states the rule qualitatively (on video, by dragging boxes on a
> chart) and never quantifies it. Every calibration maps to an input in
> `scripts/marco_liquidity_blocks.pine` and is meant to be tuned. Do not
> present a calibration to the user as if Accettone specified it.

---

## 1. Premise and priority rule

Liquidity is always the priority; liquidity blocks come second. The LB is not
a standalone signal — "if you don't understand liquidity, all you're going to
be doing is plotting on highs and lows that have been taken out, taking
entries left, right and center, and accumulating unnecessary losses."
**[SOURCE, V1]**

The bias / direction ("the story") comes from liquidity. The liquidity block
only supplies the *entry level and the stop-loss level* once the story already
says which way to trade. "No liquidity block, no stop loss" — and therefore no
entry. **[SOURCE, V1, V4]**

The model is fractal: the same pattern plays out on the weekly down to the M1;
only the time to play out changes. Lower timeframe → smaller stop → higher RR.
**[SOURCE, V2, V4]**

---

## 2. Core definitions

### 2.1 Level of liquidity

A swing high/low left behind by price. Sub-types the author marks on charts:

- **Extreme highs/lows** — untaken swing points framing the current range.
  **[SOURCE, V3]**
- **Internal points** — minor swing lows/highs left inside a move ("lows
  respecting lows, then we explode to the upside leaving internal points —
  future target"). **[SOURCE, V3]**
- **Build-up / equal levels** — repeated taps on the same level ("high
  respecting high tells me sellers in the market below these highs"; "we are
  building a tremendous amount of liquidity here"). The more taps, the more
  fuel. **[SOURCE, V3, V4]**

### 2.2 Inducement (the trap)

When price takes out a minor level, the crowd reads it as a BOS and enters in
the break direction — they are trapped, and their stops become the fuel for
the real move. Every bullish reaction after buyers are induced is short-lived
and only builds liquidity for the opposite side. **[SOURCE, V1, V3]**

### 2.3 Liquidity block (LB)

Created **when a level of liquidity gets swept and price moves away**:

- **Bullish LB** — price runs a previous *low* (level of liquidity) and moves
  away up. The low that did the sweep is the LB. Logic: the liquidity below
  is now consumed, so that low "holds no liquidity — we have no reason to
  trade below it again". **[SOURCE, V1]**
- **Bearish LB** — mirror: the high that swept a previous *high* and price
  moved away down. **[SOURCE, V1]**

### 2.4 The LB zone

The author grabs "the whole area" of the sweeping low/high with a box and
drags it right to current price action. **[SOURCE, V1, V3]** He never defines
the box edges numerically — on video the box visually spans the sweep wick
cluster. **[CALIBRATION]**:

- Bullish zone bottom = lowest low of the sweep excursion; zone top = the
  swept level (input `zoneTopMode = "swept level"`, alternative `"sweep candle
  body"`). Bearish is the mirror.

### 2.5 No-man's land

The chop between a marked level of liquidity above and one below. "This is
where build-up of liquidity happens. I'm typically not trading in here. I
want price either above or below. I will wait days or weeks." **[SOURCE, V3]**

---

## 3. When an LB is tradeable (the filter)

Not every LB is an entry. "Just because it's an LB does not mean we're going
to enter off it — but it's important to identify them, because you can
anticipate the false reaction there." **[SOURCE, V1]**

An LB entry is qualified when the full sequence is present:

1. **Both sides marked.** A level of liquidity above and below current price;
   everything between is no-man's land — no trades. **[SOURCE, V3]**
2. **One side gets run.** Price takes out one side — that run is the trap
   (inducement). E.g. highs get run → sellers/late buyers trapped → we want
   shorts back through the range. **[SOURCE, V3, V4]**
3. **The run leaves an LB.** The sweep that ran the level creates the LB at
   that extreme — this supplies the entry and the stop. **[SOURCE, V1, V3, V4]**
4. **Fuel on the target side.** Intact lows / internal points / build-up left
   on the opposite side give the draw ("look at the targets we have to the
   downside — one here, another here, the overall lows down here").
   **[SOURCE, V3, V4]**

LBs that appear *against* the story are still marked — they forecast where
false pullback reactions will come from — but are never entered.
**[SOURCE, V1, V3]**

---

## 4. Entry models

### 4.1 Zone tap (the base model)

Extend the LB zone right; when price taps back into it, that is the entry.
Stop loss beyond the LB extreme — "that will never change". Works as a limit
order at the zone. **[SOURCE, V1, V3]**

### 4.2 Sniper / 4-candle model (lower-timeframe refinement)

Bullish version, mirror for bearish **[SOURCE, V2]**:

1. **Candle 1** prints a low.
2. **Candle 2** spikes below candle 1's low and closes back above — this wick
   *is* a lower-timeframe LB.
3. **Candle 3** prints a (higher) low and closes bullish, leaving that low
   intact.
4. **Candle 4** trades below candle 3's low → longs are live **anywhere in the
   area between candle 3's low and the LB low**. Entry on the break of candle
   3's low; stop below the LB low. As long as price holds above the LB low
   the setup is valid, however deep the candle-4 wick goes.

Alternative refinement: open the LB zone on a lower timeframe (15m/H1 zone →
M1) and find the entry inside it there. **[SOURCE, V1, V3]**

---

## 5. Stops, targets, management

- **Stop loss:** always beyond the LB extreme. Systematic and repeatable — "I
  see people getting greedy or placing it at random levels. No." **[SOURCE, V1]**
- **Targets:** the intact levels of liquidity on the opposite side, nearest to
  furthest; final target = the extreme of the range. Multiple partials are the
  author's habit; he frames RR 1:3 – 1:6 as the comfort band. **[SOURCE, V3, V4]**
- **Management:** once the first level of liquidity on the target side is
  taken out, move to break-even ("we have just run a level of liquidity — it's
  not impossible for price to travel all the way back"). After a strong
  impulse, roll the stop above/below the last reaction high/low.
  **[SOURCE, V3]**
- Targets framed **before** entry — entry, stop and targets are all known
  before the button is clicked. **[SOURCE, V4]**

---

## 6. What the source never quantifies

Everything below is ours to tune — the videos show it by eye only.
**[CALIBRATION]**, mapped to Pine inputs in `scripts/marco_liquidity_blocks.pine`:

| Question the videos leave open | Input | Default |
|---|---|---|
| What counts as a swing point | `pivotLen` | 3 |
| Must the sweep close back above the swept level, and how fast | `confirmBars` | 3 |
| LB zone top edge | `zoneTopMode` | swept level |
| How long a zone stays alive untapped | `maxAgeBars` | 300 |
| What kills a zone | close beyond LB extreme | on |
| "Equal" level tolerance for build-up | `eqTolerance` (ATR mult) | 0.25 |
| Taps needed to call a level "build-up" | `minTouches` | 2 |
| How far back liquidity levels are tracked | `maxLevels` per side | 20 |

The **tradeability filter** (§3) is directional context. The indicator
approximates it: an LB is drawn *qualified* (bright) when the level it swept
had build-up (≥ `minTouches` within `eqTolerance`) or stood intact for ≥
`minLevelAge` bars; otherwise it is drawn faint. Full story-reading (bias,
no-man's land, target-side fuel) stays with the analyst. **[CALIBRATION]**

---

## 7. Working agreements for this branch

- On this branch all analysis is Accettone-only — do not mix in ChrisFX, CLS,
  EMA/RSI or the regular morning-brief reads.
- Statements from this file quoted to the user keep their [SOURCE] /
  [CALIBRATION] tag distinction.
- Transcripts live outside the repo (scratchpad); this file is the distilled
  record. Re-derive from the video IDs above if needed.
