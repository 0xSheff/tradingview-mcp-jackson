# ICT / SMC notes — the optional direction add-ons (not Marco)

The trader's Notion course notes (ICT / SMC school, "CR 2" / "CR 3" modules), distilled for the
optional add-ons of the marco branch. Evidence about a neighbouring method — **never `[SOURCE]`
for Marco**; tagged `[ICT, N#]`. Read `docs/MARCO.md` first; the rulebook stays Marco's.
The decisions about what enters the system live in `docs/MARCO-CASES.md` (*Approved changes*).

## Sources

| id | Notion page (Trading → …) | What is there |
| --- | --- | --- |
| N1 | [Order Flow](https://app.notion.com/p/1c45052c6a5147f2abd42a115b9b6c3d) (CR 2) | OF as delivery A → B; HRLR, LRLR, combined; MSS; STB / BTS |
| N2 | [OF Examples](https://app.notion.com/p/7d9c0ad5ff9d4bbebcae717e05fcbb0d) (CR 2 / Order Flow) | screenshots only: HRLR up, LRLR down, combined; the trader's own 6J / 6A / MES examples (Feb 2025) |
| N3 | [BIAS](https://app.notion.com/p/f6bd908906304bb1bb72be8aceb6547c) (CR 3) | context = cause → consequence → result; weekly / daily bias; previous-candle reversal / continuation models |
| N4 | [Candle Range Theory. PO3/AMD. DO-MO-WO](https://app.notion.com/p/3e6adaae77c0818e8f5ef9d9b1b3b3c8) (CR 2) | OHLC, opens (DO/WO/MO/YO, NY midnight), PO3 / AMD, CRT |

Fetched 2026-09-26 through the Notion connector; images are not transcribed.

## Concepts, distilled

**N1 — Order flow.** OF is the delivery of price from **point A** (the liquidity run or POI it
starts from) to **point B** (the target, found on the higher timeframe); the flow itself is read
one timeframe lower (targets W–D → flow H4–H1; targets H4–H1 → flow m5–m1). Two rules: price
seeks the opposite liquidity (after BSL → SSL and back), and moves POI → POI. The start is
confirmed by a **market structure shift (MSS)**; the end by the opposite MSS at B. Forms:
**HRLR** — alternating runs of internal liquidity and new structural extremes toward B;
**LRLR** — alternating FVG rebalances and new extremes toward B; **combined**. Entries
**STB / BTS**: the last move that ran liquidity and caused the shift; zone = shift ↔
manipulation extreme, entry on its test (or its 0.5), stop beyond the manipulation extreme.
"Liquidity is the source of every move; structure forms from liquidity, not the other way."

**N3 — Bias.** Context answers from where, to where and how price is delivered: **cause** (a
liquidity run or an inefficiency rebalance) → **consequence** (the delivery = the order flow)
→ **result** (the opposite liquidity or the nearest opposite inefficiency). "Price goes from
liquidity to liquidity, rebalancing inefficiencies in between." Weekly bias asks "is the week
candle forming up or down?" (W1 / D1 / H12, the last 6–8 months on the left); daily bias asks
the same of the day (D1 / H4) — inside a bullish week 1–2 days are corrective, typically after
a first target is reached. Previous-candle models (PWH/PWL, PDH/PDL): **reversal** — candle 2
runs candle 1's extreme and does not close its body beyond → candle 3 expands the other way;
**continuation** — candle 2 closes its body beyond → candle 3 continues. Worked daily example
(EURGBP): days with a body close beyond the previous extreme were followed in the same
direction; a day that reached a target, or closed back under the level it ran, ended the read.

**N4 — CRT, PO3, opens.** **CRT**: candle 1 = a range; candle 2 runs one side of it (ideally
closing back inside; a small body close beyond is tolerated when the wick is large); candle 3 =
distribution, first target the other end of candle 1. Key levels: IRL/ERL (PDH/PDL, sessions,
EQH/EQL), blocks, FVG. Confirmation pairs W → H4, D → H1, H4 → M15, H1 → M5; timing D1 on
Tue–Thu. **PO3 / AMD**: accumulation (Asia, near the open) → manipulation beyond the open
(London) → distribution (New York); opens DO / WO / MO / YO and NY midnight as reference levels.

**FVG as a level (the trader, 2026-09-26).** Marco says IE does not use FVG, yet the trader has
seen the IE team mark the FVG edge nearest to price as a plain level: after an up-move the
**low of the third candle** (the FVG top), after a down-move the **high of the third candle**
(the FVG bottom). Proposed: take that edge as a level of ours.

## Mapping to the Marco vocabulary

| ICT (N#) | Marco (`docs/MARCO.md`) | Note |
| --- | --- | --- |
| BSL / SSL, EQH / EQL, external / internal liquidity | levels, build-ups, extremes, internal points (§2.1) | same idea; we count taps |
| Run + no body close beyond (reversal model, CRT candle 2) | run + reclaim = the trap (§2.2, §3) | Marco needs *qualified* liquidity and an LB |
| Body close beyond (continuation model) | run without reclaim = continuation (Principle 2) | the trader's "закріплення" |
| Point A → point B | the trap → the draw / target (§3, §3.1) | cause → result = our map |
| Order flow HRLR / LRLR, MSS | the MTF leg layer (U2 candidate): WITH / AGAINST / TURNING | one mechanism, see *Approved changes* |
| STB / BTS zone | LB + V8 origin + the 4-candle model (§2.2, §3, §4.2) | nothing new to add |
| Previous candle high / low | HTF candle extremes as levels (§2.1, V7 "I just grab that high") | Marco-compatible |
| PO3 / AMD with the opens | the 10 a.m. H4 model (§4.3, V5) | timing already covered |
| FVG | — (not used by Marco) | its edge as a level only, per the trader |

## Data check on our instruments (2026-09-26)

CME continuous contracts 6E1!, MNQ1!, MES1!, MGC1! (unadjusted rolls), the chart's loaded
bars: W 300 (Dec 2020 – Sep 2026), D 300 (Jul 2025 – Sep 2026); pooled over the four. Every
model is compared with a baseline that controls what would explain the hit rate mechanically.
Scripts: `scripts/research/direction/` (local, gitignored); the numbers are `[CALIBRATION]` evidence, not rules.

| Model | W hit vs baseline (n) | D hit vs baseline (n) | Baseline controls |
| --- | --- | --- | --- |
| Continuation (close beyond the previous extreme) → next bar extends | 74% vs 78% (636) | 69% vs 72% (582) | where the bar closed in its range |
| Reversal (ran the previous extreme, closed back) → next bar takes the other end | 65% vs 63% (560) | 54% vs 58% (596) | same |
| CRT → candle 3 reaches candle 1's other end | 36% vs 35% (352) | 32% vs 32% (365) | the same ATR distance (median ≈ 0.65 ATR) |
| CRT → … within 3 bars | 53% vs 55% | 51% vs 52% | same |
| **3-bar fractal, close beyond (acceptance) → the next fractal before a close back** | **49% vs 36% (68)** | **46% vs 35% (80)** | every bar in the same race at the same relative position |
| 3-bar fractal, run but no close beyond → the opposite fractal before a new extreme | 27% vs 31% (139) | 29% vs 28% (140) | same |
| Acceptance lost (a close back through the accepted level) → the opposite fractal first | 37% vs 30% (35) | 40% vs 35% (42) | same |

Read: the candle patterns carry nothing beyond where the bar closed or how far the target is.
**Acceptance at an HTF fractal is the one read with an edge** (+11–13 points, z ≈ 2 per
timeframe) — it says the market is heading to the next level, about one time in two. A run
that fails to close beyond says nothing about the other side; a lost acceptance leans that way
only weakly (small n). Per-instrument samples (6E: n ≈ 20 per TF) are too small to read alone.

**Second pass — the bar-by-bar read in context (2026-09-26).** The trader's framing: CRT is
only an example of how HTF price reacts at the previous bar's high / low; the useful part is the
bar-by-bar read (the close of today / this week against the previous bar's extremes), read as
order flow and never alone — one factor of "is the market heading to the bias targets now, or
correcting?". Tested on D bars inside a W heading known before the week (the acceptance rule
on W; 573 days, pooled). Next-day and 3-day outcomes are measured toward the W target:

| Today's D bar, relative to the W heading | next day closes toward | +3 days closer | next day runs today's counter extreme, then closes back toward | … and closes beyond it | n |
| --- | --- | --- | --- | --- | --- |
| every day (baseline) | 54% | 55% | 12% | 21% | 573 |
| 1 · closed beyond the previous extreme toward the target | 56% | 51% | 4% | 11% | 158 |
| 2 · ran the previous extreme toward, closed back ("failed push") | 55% | 63% | 14% | 25% | 104 |
| 3 · ran the previous extreme against, closed back (the textbook HRLR pullback) | 44% | 46% | 8% | 30% | 87 |
| 4 · closed beyond the previous extreme against the target (a correction day) | 62% | 63% | 23% | 20% | 115 |
| inside day | 51% | 52% | 13% | 27% | 77 |

First read (withdrawn in part, see the robustness check below): a correction day seemed to be
followed by the heading more often (62 / 63%), a failed push to resolve toward the target (63%
after 3 days), a one-day run of the previous low to be followed by weaker progress.

**Robustness check (same day).** With the W heading from the trader's two-bar rule (always
defined, 1152 days) the directional rows fall to base — correction day → next day toward the
target 53% vs 52%, +3 days 55% vs 53%; failed push 48% / 53%; the textbook pullback 50% / 50%
— and splitting by heading age (0–3 vs 4+ weeks) changes nothing. What holds under both
definitions: after a correction day, the next day runs its extreme in 62–64% of cases, then
closes back toward the target in 23% (vs 13–14%) or beyond the extreme, the correction going
on, in 30–31% (vs 22–24%). The bar-by-bar read locates tomorrow's battleground; the close (and
the LTF structure) decides it. Scripts: `scripts/research/direction/context2.mjs` (first read),
`context3.mjs` / `context5.mjs` (robustness).

**Mon–Tue window, first measurement (2026-09-26; the trader keeps the window and validates it
by probability).** Weeks with a W heading known before Monday, n = 116: Tuesday's close was
against the heading vs the previous Friday in 49%; the week's extreme against the heading was
made Mon/Tue in 42%, the extreme with the heading in 34% (all 245 weeks: low on Mon/Tue 44%,
high 36% — the index drift). Uniform chance for "Mon or Tue" is 40%. With the two-bar W
heading (n = 237): the counter-heading extreme on Mon/Tue 41%, the with-heading one 41%.
Not decisive on either proxy; the journal's own Mon–Tue trades are the next test.

## What is adopted

Status and wording of every decision: `docs/MARCO-CASES.md` → *Approved changes* → "HTF direction
read". In short: the trader's acceptance rule is the core (not an ICT add-on); from these notes
the order-flow vocabulary goes into the MTF leg layer, previous-candle extremes and FVG edges
become map levels (switchable). CRT is not used as-is: its bar-by-bar core (the close against
the previous D / W bar's extremes) enters as one order-flow factor of the heading read, never
as a forecast on its own — alone it matched its baselines, in context it reads as above.
