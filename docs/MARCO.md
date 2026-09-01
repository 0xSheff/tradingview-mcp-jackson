# Marco Accettone (Inter Equity Trading) — Liquidity Blocks Reference

This file is the single source of truth for the `marco` branch.

Sources — six public videos from the **Inter Equity Trading** YouTube channel
(@InterEquity, Marco Accettone). Rules below are distilled from the full
auto-generated transcripts of:

| Ref | Video ID | Title | What it contributes |
| --- | --- | --- | --- |
| **V1** | `GIYrW7FC06M` | Liquidity Inducement Entries (LIQUIDITY BLOCKS) | LB definition, creation logic, stop-loss rule, priority rule |
| **V2** | `yIYY_jYy3sE` | The ONLY Entry Model You Need (SNIPER ENTRIES) | The 4-candle fractal entry model |
| **V3** | `pQ4WTVQnwBc` | ADVANCED Liquidity Concepts ON GOLD | Full trade story: no-man's land, intact lows as targets, management |
| **V4** | `hKh3-f3oAO8` | $10,000 Liquidity Inducement Trade in 4 MINUTES | Liquidity build-up, waiting for the trap, pre-framing targets |
| **V5** | `lEsZYpeGNVQ` | The Simple Trading Strategy That Actually Works | The 10 a.m. reversal — the 06:00–10:00 ET H4 candle model |
| **V6** | `aKoGbAe-xTE` | 10,000 Hours of Liquidity Trading in a 16 Minute Video | Weekly/daily bias, trend-line liquidity, the HTF→LTF entry chain |

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
  fuel. **[SOURCE, V3, V4]** The author boxes the equal extremes and drags
  the box right; it is the *local target* of the story, and its run is the
  trap that flips it (MNQ 1h, 31 Aug–1 Sep 2026: equal highs 29538–29543.5
  tapped four times, run at 08:00 Athens, price fell 300 points). Tooling:
  the engine keeps a `buildups` record per level (side, equal-extreme range,
  taps, `intact`/`swept`, the LB the run created) that outlives the sweep,
  and the story read names it ("the x4 build-up at 29543.5 was the local
  target, now taken"); the indicator draws a box across the equal extremes
  (`xN`) once a level has `minTouches` taps, and keeps it grey as `swept xN`
  until it ages out when *Keep swept build-up boxes* is on. A later "equal"
  extreme that pokes beyond the first counts as a sweep, not a tap.
  **[CALIBRATION]**
- **Trend-line liquidity** — a chain of rising lows (or falling highs) that
  each tap the same sloped line. The line is where trend-line traders' stops
  rest; a move whose "purpose" is to clear it runs through the whole chain in
  one go, then finds the LB below. **[SOURCE, V6]**

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
false pullback reactions will come from — but are never entered: "all these
bearish ones are still by-the-book liquidity blocks, but not liquidity blocks
we would use for entry … you can anticipate this false reaction here, this
pullback, and if there's a bullish opportunity you buy back up" (V1
5:27–6:02, 7:32). The false reaction runs from the counter-bias zone to the
next bias-side setup. **[SOURCE, V1, V3]**

**Inducement, as the author draws it (V1 diagram, 1:20–2:40).** Uptrend →
"grabbing a low here, inducing sellers — they are going to view this to be a
BOS, this level is going to be a trap for them" (red box) → "then we stab out
the liquidity, and boom, that is where the liquidity block is created" (at
the high). Inducement is the run of a *minor* level that the crowd reads as
a break of structure; the real LB is the later sweep of the true liquidity.
Mirror for the bullish case. This is the answer to the "BOS looks like an
LB" confusion: the LB left by the inducement break is real, and it is on the
wrong side of the story. **[SOURCE, V1]**

**Worked example (V1 4:24–6:04, Gold 15m OANDA, 24–26 Feb 2026, ET).** Lows
~5 130 tested twice (Tue 09:00, 12:00 — build-up) are run Tue ~18:00 to
~5 128 and reclaimed → bullish LB 5 128–5 136 ("price has sold off taking
this internal low, printing what could be a liquidity block"). The rally
leaves a single-touch high ~5 194 (Tue ~21:00); a spike Wed ~01:00 runs it
to ~5 210 and closes back → bearish LB 5 201–5 210, by the book. Wed ~11:00
price taps that zone and gives the false reaction to ~5 173 ("you can
anticipate this false reaction here, this pullback"), then runs through it
to ~5 217 ("if there's a bullish opportunity you buy back up" — the author
draws the arc over the zone before it happens). Thu ~10:00 a spike to
~5 127 taps the bullish LB and the real reaction follows. The author's only
stated reason is "pair it with liquidity": the video explicitly excludes
bias ("I don't want to talk about direction … this is purely on liquidity
blocks", 3:20), and the entry-side LB itself took an "internal low".
**[SOURCE, V1]**

**Rule (engine and indicator).** An LB never sets the story by itself —
liquidity does. The story *anchor* is the most recent alive LB that ran a
confirmed side of the range (build-up or age qualified, §6); it holds until
invalidated or expired, even past `story_lookback` (the V1 bullish LB was
68 bars old at its counterpart's tap). Unqualified events after the anchor
on the other side — an internal point run and reclaimed (an `inducement`
LB) or consumed without reclaim — never flip it: they are marked, expected
to give a false reaction, and listed under `false_reactions`. A *qualified*
LB on the other side (a build-up level run) does flip the story — that is
step 2 above. The boundary "which sweeps count as a side being run" is the
existing qualification threshold (`min_touches` / `min_level_age`); the
author sets it by eye. **[CALIBRATION]** In the engine every zone carries a
`role` (`entry` / `pullback_origin`) once a bias is known plus an
`inducement` flag, `storyRead` names the inducement zone in its read, and
the indicator's `Bias` input (Auto / Long / Short / Off) draws counter-bias
zones dashed with the label `false` and mutes their alerts; Auto follows the
last qualified LB and is not moved by inducement zones.

**Bias source [CALIBRATION].** The author's bias is a liquidity read, never
the block: the *draw* (where liquidity built — "the only logical liquidity
point left") is the lean, and the *trap* (the run of the other side) is the
trigger; the LB is the trap's by-product that supplies entry and stop. The
tooling therefore offers three sources for a timeframe's own direction —
`bias_source` in the engine, `--bias` on the CLI, the `Bias` input on the
indicator:

- **trap** (default) — the last qualified LB, i.e. the last confirmed side
  that was run and reclaimed. This is the trigger read: it reproduces the
  author's trades in §7, but it fires on any level that qualifies by
  build-up *or age*, so a qualified-by-age internal level run inside a
  bigger story yields an LTF story that the HTF frame calls a pullback (6B
  1h, 31 Aug 2026).
- **draw** — the side holding more intact build-up taps (fuel = Σ taps of
  intact levels with ≥ `min_touches` on each side of price). This is the
  order in which the author *thinks*: fuel first, trigger second. The
  engine also reports whether the last trap sits on the other side —
  `draw.activated` — which is what turns the lean into a story; the
  indicator marks by the lean alone.
- **off** — no automatic bias; the analyst sets Long/Short by hand (from
  the weekly brief). An explicit bias (weekly brief, `--bias long|short`,
  or `--bias off` for none) always overrides the source.

Because every source is read per timeframe, the indicator on `Auto` is a
pure LTF story without HTF or draw — useful precisely to see the local bias
flip back into the higher-timeframe one.

---

### 3.1 Higher-timeframe bias (weekly → daily)

The same story read, run on the weekly first. The author's NQ walkthrough
(top → 7-week sell-off → April-2025 bottom → recovery) **[SOURCE, V6]**:

1. **Mark the liquidity the market communicated.** Equal highs ("this high
   respecting this high") — "I'm not predicting, the market has literally
   communicated it." Same for the chain of lows / trend-line liquidity below.
2. **Ask why the move happened.** A multi-week sell-off exists to clear the
   liquidity built below (the chain, the build-up box) — and to induce
   sellers, who now want to keep selling.
3. **The extreme lands in an HTF liquidity block.** Buyers above the swept
   lows are trapped; the tap into the old LB is where the bottom is found;
   confirmation = the bullish weekly closes out of it.
4. **Bias = back to the untaken side.** "Your eyes should be back to these
   highs — the only logical liquidity point left." Target = the equal highs.
5. **Every move against the bias is false.** "Any bearish moves, deem them
   false, use them to find a buy back up." Entries come from the 4h/1h: a
   low that built liquidity ("low respecting low") gets run → buy with the
   stop below an LB, target the HTF highs. "Just because we took the low
   does not mean buy right away — that is pattern trading": wait for the
   reaction structure.
6. **Management:** once a left-side high is taken, liquidity is taken — move
   to BE or tuck the stop below the last low. If the LB is too big, refine
   the stop on a lower timeframe LB. HTF-only entries in the walkthrough
   ran 1:6, 1:7, 1:19, 1:14, 1:3.6.

**Bias is a reaction, not a forecast.** There is *always* liquidity marked
on both sides — that state is no-man's land (2.5) and its bias is "none":
"mark out the lows, mark out the highs, wait for one of them to get taken,
and react accordingly" (V3); "we're trying to short — therefore we're not
going to short with the sellers, we want to wait for the sellers to get
taken out" (V4). The bias appears only after one side is run and reclaimed:
the run side is spent ("holds no liquidity — no reason to trade below it
again"), so the untaken side becomes "the only logical liquidity point
left" (V6). The only forward-looking part is build-up asymmetry — the side
with more taps is where the crowd's stops rest, hence the likelier first
run — but it is waited for, never front-run. **[SOURCE, V3, V4, V6]**

**Divergence rule [CALIBRATION, user]:** a daily trap against a *live*
weekly story (trap fresh, target still open) is inducement — the weekly
leads, the daily move is false, enter with the weekly once the daily's run
is in (regime `pullback`). Only against a *stale* weekly story does the
daily take over, traded consciously as counter-trend with targets at the
nearest levels only (`counter_trend`). Continuation states never make a
counter-trend case: a daily continuation against a weekly trap is a
pullback, two continuations without a trap are no bias. Chosen after the
§7.2 replay showed the plain "daily wins" version inverting two of the
author's winning longs. Implemented in `resolveBias` (`aligned` /
`counter_trend` / `pullback` / `daily_only` / `weekly_only` / `no_bias`).

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

### 4.3 The 10 a.m. reversal (H4 candle model)

The author trades the New York session only, and this model gives the
*timing* gate for the day. **[SOURCE, V5]**:

1. The H4 candle that opens 06:00 and closes 10:00 ET is the reference. At
   10:00 a new H4 candle opens — "10 a.m. is a very, very powerful time,
   especially in futures."
2. Mark the previous (06–10) H4 high and low.
3. Bullish scenario: after 10:00, **longs only become active once price
   trades below the previous H4 low** — "we are not longing until that low
   is taken out; it's a very strict rule." The sell-off into it is treated
   as false (the trap). Bearish is the mirror above the H4 high.
4. The entry itself is unchanged — a liquidity block, stop covering the LB
   extreme ("the entries are repeatable, nothing ever changes").
5. Systematic target: the previous H4 high (resp. low). Alternative:
   liquidity targets — intact highs/lows beyond. **[SOURCE, V5]**

The bias still comes from the liquidity story (§3); this model only times
the entry. In V5 the bias was long because a double-tapped high fueled the
sell-off that swept internal liquidity, leaving intact highs above as draw.
**[SOURCE, V5]**

How long the gate stays open after 10:00 is not stated; we close it at the
next H4 open, 14:00 ET (`h4.active_until_hour`). **[CALIBRATION]**

---

### 4.4 Sweep-trigger entry (the HTF chain)

Used once the higher-timeframe bias is set (§3.1). The entry is *not* a tap
into the zone the run creates — it is the run itself **[SOURCE, V6, V4]**:

1. **Trigger** = a level of liquidity on the bias side that the market has
   confirmed ("low respecting low", build-up). "Wait for price to come below
   this low — as soon as price stabs it out, anywhere below is a valid buy."
2. **Stop** = beyond the nearest *pre-existing* LB in the trade direction —
   "we're not just buying below lows, we need a liquidity block: it provides
   the level for the stop." If that LB is too big, use a refined (lower-TF)
   LB nested inside it and shrink the stop.
3. **Target** = the higher-timeframe liquidity (the weekly equal highs), not
   the next intraday level; intraday levels are partial/management points.
4. **Management** = once a left-side high is taken, move to BE; the next
   trigger is the next confirmed low on the way up. Position size is fixed
   dollar risk (the author's position tool shows a constant "Amount").

"Low respecting low" is a *confirmation touch*, not an equal level — the
second low holds above the first (on the 1h walkthrough ~77 points above,
beyond any equal-level tolerance). It counts as build-up through a separate
"respect" tolerance, `respect_tolerance_atr` = 0.75 ATR. **[CALIBRATION]**

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
| --- | --- | --- |
| What counts as a swing point | `pivotLen` | 3 |
| Must the sweep close back above the swept level, and how fast | `confirmBars` | 3 |
| LB zone top edge | `zoneTopMode` | swept level |
| How long a zone stays alive untapped | `maxAgeBars` | 300 |
| What kills a zone | close beyond LB extreme | on |
| "Equal" level tolerance for build-up | `eqTolerance` (ATR mult) | 0.25 |
| Taps needed to call a level "build-up" | `minTouches` | 2 |
| How far back liquidity levels are tracked | `maxLevels` per side | 20 |
| Zones thinner than this are not entry-grade | `minZoneAtr` / `min_zone_atr` | 0.25 ATR |
| Stop offset past the zone extreme | `stopBufAtr` / `stop_buffer_atr` | 0.1 ATR |
| A trap older than this reads as stale | `story_fresh_bars` (engine only) | 16 bars |
| A later low holding this far above a level is a confirming touch ("low respecting low") | `respectTol` / `respect_tolerance_atr` | 0.75 ATR |
| Which sweeps count as a side of the range being run (the story anchor, §3) — the rest is inducement | `minTouches` / `minLevelAge` (reused) | 2 touches / 50 bars |
| Where a timeframe's own direction comes from (§3): the trap, the draw, or nothing | `Bias` / `bias_source` / `--bias` | trap |

The `minZoneAtr`, `stopBufAtr` and `story_fresh_bars` rows come from the
09:55 replay experiment (§7.1): 1-tick zones made R math absurd, extremes
got pierced by ticks before the real move, and a 36-bar-old trap was quoted
as a live story. The anchor row comes from the V1 review (§3): with "last LB
wins" the engine inverted the author's own example — the inducement zone
became the entry and the entry zone the pullback origin.

The **tradeability filter** (§3) is directional context. The indicator
approximates it: an LB is drawn *qualified* (bright) when the level it swept
had build-up (≥ `minTouches` within `eqTolerance`) or stood intact for ≥
`minLevelAge` bars; otherwise it is drawn faint. Under `Bias = Auto` the
last qualified LB sets the side and unqualified zones against it draw as
`false` (inducement). Full story-reading (bias, no-man's land, target-side
fuel) stays with the analyst. **[CALIBRATION]**

---

## 7. Tooling on this branch

Two implementations of the same state machine — keep them in sync when
tuning any default:

- **`scripts/marco_liquidity_blocks.pine`** — the visual indicator. Saved on
  TradingView as the user's script "Liq blocks".
- **`src/core/marco.js`** — the analysis engine: the same levels/sweep/LB
  replay plus the narrative layer (`storyRead`, §3 — anchored on the last
  live qualified LB; inducement zones are flagged, never a flip; the build-up
  the trap ran is named as the local target), build-ups that outlive their
  sweep (`liquidity.buildups`, §2.1), setups in the bias
  direction (`triggerSetups`, §4.4 — sweep triggers and zone taps, nearest
  first, each with stop anchor, target and RR), the 10 a.m. gate
  (`h4Model`, §4.3) and an HTF second pass (`htfContext`) that runs the map
  on `htf.timeframe` (default 240) and attaches long-lived zones, nearest
  HTF levels and a proximity alert to every LTF read. Driven by the CLI:
  - `node src/cli/index.js marco brief --compact` — scan the `marco` list in
    `watchlists.json` (default TFs 15/60).
  - `node src/cli/index.js marco scan COMEX_MINI:MGC1! --tf 15` — one symbol.
  - `--bias weekly|long|short|off|trap|draw` on `brief`/`scan` — which bias
    sets the zone roles (default `weekly` = the latest weekly brief; `off`
    marks nothing; `trap`/`draw` use this TF's own story source, §3).
  - `node src/cli/index.js marco weekly --compact` — the weekly bias brief
    (§3.1 + §4.4): W and D stories → `resolveBias` → targets, invalidation,
    sweep triggers on 240 and D. Writes `briefs/weekly/<ISO week>.md` and
    `.json`; `marco brief`/`scan` read the latest `.json` and stamp every
    intraday story `aligned` / `against` the weekly bias.
  - Optional overrides live in `rules.json` → `marco` (gitignored, optional).
- **`tests/marco.test.js`** (`npm run test:marco`) — fixture scenarios for
  every §§2–4 rule: sweep+reclaim, breakdown, build-up qualification,
  invalidation, tap, the bearish mirror, the H4 gate, the V1 inducement
  sequence (build-up run → single-touch high run → story holds), and the
  build-up record (equal highs x3 → swept → linked LB).

### 7.1 Replay validation against the author's own trades

Both breakdown-video trades were located on `COMEX_MINI:MGC1!` and replayed
bar-by-bar through `storyRead` (15m, defaults) on 2026-08-29:

- **V4 short — Mon 2026-03-16, NY open.** By 09:00 ET the engine was already
  in `sell_story` with targets 5122.6 / 5099.1 / 5096 (the day flushed to
  5102.9; 5096 was Sunday's low). At 09:30 — the author's "just before stock
  open" entry — it printed `high_swept 5165.6` → bear LB at the day high
  (5175) → tap at 10:00, then price walked the targets. Structure reproduced
  one-for-one; the author executed on M1 (tighter stop), which is his
  fractality claim in practice.
- **V3 short — Tue 2026-04-07, late NY.** The pre-day read was `sell_story`
  with targets 4763 / 4744.4 / **4719.4**; the author's final target printed
  at 4718.9 on Sun 2026-04-12, where the engine flipped to `buy_story` (the
  market then rallied to 5007 within four sessions). Story, targets and exit
  matched. The exact entry zone (the ~4981 spike top) did **not**: his LB
  came from March-crash structure older than the 400-bar fetch window, and
  the 4994.1 retrace high never qualifies as a pivot under our strict
  definition. Partially addressed since: `runMarcoBrief` now runs the
  `htfContext` second pass on 240 and alerts when price nears a long-lived
  HTF zone. Caveat that stands: a retrace high inside a waterfall (like
  4994.1) is not a pivot on any timeframe under the strict definition, so
  zones anchored to such highs still go unseen.

**V6 check (NQ weekly as of 2025-05-25, engine defaults):** `buy_story` —
lows run and reclaimed 5 bars ago, bullish LB 17675.75–20292, target = the
intact high 23872.5 with 2 touches (the equal highs). That is the author's
weekly read verbatim. Miss: the Oct-2023 weekly LB he uses for the bottom
never exists in our map — the Sep-2023 LB got invalidated on 2023-10-22 and
its extreme is not re-registered as liquidity, so the real low (16810.75,
reclaimed the next week) opens no pending sweep. **Rule (implemented):** an invalidated LB's
extreme is swept liquidity — a pending opens on the invalidating bar and a
reclaim makes the new extreme an LB (test: "an invalidated LB's extreme is
swept liquidity"). **[CALIBRATION]**

### 7.2 V6 entry chain — validation targets

The author's five NQ longs (1h/4h, target = weekly highs 23,363), read off
the position-tool labels at 16:01 of V6. Prices are his back-adjusted NQ1!:

| # | Date (2025) | Entry | Stop | RR | Mechanic |
| --- | --- | --- | --- | --- | --- |
| 1 | Apr 30 | ~19,9xx | 19,295.25 | 1:6 | tap into the Apr-24 LB after the flush |
| 2 | May 7 | 20,446.50 | 20,042.00 | 1:7 | sweep of the range low, stop under the refined Apr-30 LB |
| 3 | May 23 | 20,767.50 | 20,632.25 | 1:19 | sweep of a confirmed low, stop under a 15m LB |
| 4 | May 30 | 21,522.75 | 21,396.00 | 1:14 | same |
| 5 | Jun 3 | 21,849.00 | 21,432.25 | 1:3.6 | same, wider stop |

Replay result (2026-08-30, 1h map at each day's open; our NQ1! prints
~+500 above his back-adjusted chart, so compare structure): the map held all
five trades — entry 1 = nearest bull LB below price with the stop under the
next LB down (his 19,295 ↔ our 19,810 − 500); entries 2 and 4 = his entry
levels appear as bull LB zones (20,446 ↔ 20,955–21,075; 21,522 ↔
21,942–22,017) with the stop anchors he used; entry 3 = the trigger's stop
anchor LB 21,273–21,296 is his entry zone; entry 5 = his entry sits inside
our qualified LB 22,287–22,357 and his stop equals the lower LB's buffered
bottom (21,432 ↔ 21,935 − 500). Bias: the weekly read was `buy_story` on
every date. **But on May 7 and May 30 the daily printed a bearish trap
(`sell_story`) against it, and the divergence rule turned the bias short —
the author bought those dips (1:7 and 1:14).** In his framing a daily trap
against a live weekly story is inducement, not a new story. Resolved: `counter_trend` is
reserved for a stale weekly story; a live one turns the daily trap into
`pullback` (§3.1). With `triggerSetups` listing zone taps next to sweep
triggers (nearest first), the five entries read off the 1h map as: Apr 30 →
tap LB 20,473–20,608; May 7 → tap LB 20,954–21,047 (his 20,446 + 500) with
the Apr-30 LB as the deeper anchor; May 23 → sweep 22,033 with the stop under
LB 21,273–21,296 (his entry zone); May 30 → tap LB 21,942–22,017 (his
21,522 + 500, stop 21,396 ↔ 21,933 − 500); Jun 3 → tap LB 22,287–22,357
(qualified), RR 9 to the top zone's bottom edge. Targets now
include alive opposite-side LB zones (the top's bearish LB is "the highs"):
primary = zone bottom, final = zone top.

## 8. Working agreements for this branch

- On this branch all analysis is Accettone-only — do not mix in ChrisFX, CLS,
  EMA/RSI or the regular morning-brief reads.
- Statements from this file quoted to the user keep their [SOURCE] /
  [CALIBRATION] tag distinction.
- Transcripts live outside the repo (scratchpad); this file is the distilled
  record. Re-derive from the video IDs above if needed.
