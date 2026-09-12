# Marco Accettone (Inter Equity Trading) — Liquidity Blocks Reference

This file is the single source of truth for the `marco` branch.

Sources — six public videos from the **Inter Equity Trading** YouTube channel
(@InterEquity, Marco Accettone) plus one long-form interview (V7). Rules
below are distilled from the full auto-generated transcripts of:

| Ref | Video ID | Title | What it contributes |
| --- | --- | --- | --- |
| **V1** | `GIYrW7FC06M` | Liquidity Inducement Entries (LIQUIDITY BLOCKS) | LB definition, creation logic, stop-loss rule, priority rule |
| **V2** | `yIYY_jYy3sE` | The ONLY Entry Model You Need (SNIPER ENTRIES) | The 4-candle fractal entry model |
| **V3** | `pQ4WTVQnwBc` | ADVANCED Liquidity Concepts ON GOLD | Full trade story: no-man's land, intact lows as targets, management |
| **V4** | `hKh3-f3oAO8` | $10,000 Liquidity Inducement Trade in 4 MINUTES | Liquidity build-up, waiting for the trap, pre-framing targets |
| **V5** | `lEsZYpeGNVQ` | The Simple Trading Strategy That Actually Works | The 10 a.m. reversal — the 06:00–10:00 ET H4 candle model |
| **V6** | `aKoGbAe-xTE` | 10,000 Hours of Liquidity Trading in a 16 Minute Video | Weekly/daily bias, trend-line liquidity, the HTF→LTF entry chain |
| **V7** | `5NrNBik2dmY` | MRKT interview (Jun 2026, XAUUSD/NQ walkthrough) | "Invisible" levels = HTF candle highs / highs respected multiple times; re-entry while the target is intact; counter-bias framing; the short-term play toward the local draw |

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
  fuel. **[SOURCE, V3, V4]** "We are respecting this high multiple times" is
  the tell — the XAUUSD level of the V7 walkthrough (a plain 1h bar high at
  4378, no visible extreme) mattered exactly because later highs kept
  respecting it, and its run was the sell. **[SOURCE, V7]** The author boxes
  the equal extremes and drags
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
- **Higher-timeframe candle highs/lows** — "this 4-hour high here is just
  another high on the lower time frames — I just grab that high": a level can
  be the extreme of an HTF candle, invisible as a swing on the LTF. This is
  why the engine runs the HTF second pass (`htfContext`) and why the V3
  replay's entry zone was missed (§7.1). No FVG/imbalance is involved
  anywhere in the method. **[SOURCE, V7]**

**Memory and swings [CALIBRATION, 2026-09-06].** TradingView hands the
engine at most 500 bars of a timeframe, so a lower-timeframe map inherits
the intact levels of the timeframe above it before its first bar (`seed_levels`
nearest per side; W → D → 240/60) — V7's "this 4-hour high is just another
high on the lower time frames, I just grab that high". The Pine indicator,
which sees the whole chart, bounds the same memory with `levelMaxAge`. A
swing is strictly beyond the `pivot_len` bars on its left and beyond-or-equal
on its right: a run of equal lows registers once, on its first bar (equal
lows 06:00/09:00 used to cancel each other out and vanish).

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

**What ends an LB [CALIBRATION, user, 2026-09-06].** Three rules follow from
"holds no liquidity" and from the stop always sitting beyond the extreme (§5):

- **A trade beyond the extreme kills the zone** — by trade, not by close. If
  price was there, the stop was hit and "no reason to trade below it" no
  longer holds; the extreme is swept liquidity (§7.1 pending rule: a reclaim
  makes the new extreme the new LB). The earlier close-based rule let the
  D-6B bear LB 1.3594–1.3653 survive the Aug-2026 wick to 1.3676 and never
  opened the pending that would have printed the 1.3653–1.3676 zone.
- **The zone ages out, the extreme does not.** A low that was made and never
  taken is still liquidity: when a zone expires (`zone_max_age`) its extreme
  returns to the map as a level, carrying the respects it collected. The
  engine's window is not its memory — lower timeframes inherit the higher
  timeframe's intact levels (§2.1, "HTF feed").
- **An LB is not a build-up.** The block is a low behind which there is no
  liquidity — until the crowd builds some. A later swing that holds within
  `eq_tolerance` of a live zone's extreme is a *respect* of that extreme;
  at `min_touches` taps (extreme + respects) the extreme is a target, not a
  block: the zone retires and its extreme joins the map as a build-up level.
- **Pocket floor.** A run that stops within `eq_tolerance` short of a deeper
  intact level took an inner level only — the trap completes beyond the
  pocket's *furthest* extreme (6E 1.15765, W36), so the stab is inducement
  into the pocket: the inner level is consumed, no pending opens, no LB is
  born, the floor keeps the liquidity. 6B 1h, 4 Sep 2026: Friday's 1.3476
  "swept" the 1.348 x3 cluster by 4 pips and stopped 2 pips above the
  Aug-13 / Sep-2 floor 1.3474 — under the old rules that made a bull LB, a
  1h buy story and "x0 fuel below"; under these it is a poke, and 1.3474 is
  an intact x4 build-up — the short's target.

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
flip back into the higher-timeframe one. The author trades both layers
himself: in V7 he runs a "short-term long" *into* the highs where the
sellers sit (the local draw) while the higher-timeframe idea waits for those
same highs to be taken out — the LTF story toward local liquidity is a
legitimate intraday/intraweek play, not merely a false move, as long as it
is managed as such ("once we take out a low like this, that's a target — in
and out"). **[SOURCE, V7]**

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

**Two layers of the weekly brief [CALIBRATION, user, 2026-09-02].** The
author's weekly→daily read is kept as the **global layer**: the bias, its
invalidation and the big targets — which will *not* be hit within a week
(W36: MGC primary 5752 ≈ 8–12 weekly ranges away). They are recorded as
such and re-evaluated every weekend ("has the picture changed, is it still
valid?"). W36 confirmed the layer: the bias side and the levels it was
expected to start from played out (MGC tap 4349–4365 → 4418, 6E stab
1.1572 → reclaim) while the big targets stayed far. The **intraweek layer**
then answers the week's practical questions inside that story: the phase
the week starts in (the D vs 4h read — `aligned` or `pullback`), reachable
targets (nearest D/4h liquidity, annotated with distance in weekly ATRs,
≈Nw), triggers on 240/60 in the global direction, and the **early-week
counter-trend allowance**: the first two sessions of a week usually pull
back, so Monday–Tuesday intraday counter-trend trades are permitted when a
visible short-term target exists — nearest target only, never held against
the global bias. Fractality **[SOURCE, V2, V4]** and the author's own
layering ("this is more of an intraday/intraweek kind of play… most likely
not going to be that higher time frame move", **[SOURCE, V7]**) license the
second layer; the first stays exactly the author's.

*Mechanics of the intraweek layer [CALIBRATION, 2026-09-06, after the W37
review].* Week targets are **clusters**: D/4h levels and zone edges within
`eq_tolerance` (of the daily ATR) are one draw, shown as a range with the
summed taps (MNQ 29759–29811.75 x2) — three slots mean three distinct draws.
A **target belongs to the trigger, not to the price**: each trigger takes
the first rung beyond its own entry that clears `target_min_rr`, and prints
the rungs it skipped ("T1 29585 gives RR 1.13 — target moved to
30076.75"); when the rung it lands on is more than a weekly range away the
brief says to refine the stop on a lower-TF LB instead of chasing it (§5,
V6). "Aligned" needs a **live** story on at least one side — a stale trap
plus a continuation on the other timeframe is a lean (`weekly_only` /
`daily_only`, flagged `stale`), not agreement. The phase note is phrased
against the week's bias (a 4h trap with the week's side while the daily is
still continuation reads "the trigger timeframe agrees, the daily has not
turned yet", not "counter-trend").

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

**The weekend sets direction, the morning sets the setup [CALIBRATION,
user, 2026-09-09, after the W37 mid-week review].** The weekend brief stops
producing setups. It keeps only the global layer — the W/D (optionally H4)
story, bias, invalidation, the big targets in weekly ATRs, and a new
week-over-week delta ("what changed in the global picture") — plus the map
of HTF zones price would have to reach for anything to become actionable.
Triggers, stops, RR and counter-trend entries move to a **daily morning
run**, computed live on 240/60/15/5 the morning they are used, and carrying
the dollar risk at minimum size with the per-trade cap checked *before* a
setup is written.

W37 forced this: every setup the Sunday lock carried failed as written.
MGC's long 4411.4–4462.8 needed a $537 stop against a $250 cap and the
brief itself said "refine on 15m"; its early-week counter-trend triggers
sat at 4533.5 / 4543.7 while Tuesday's actual high was 4488.7; 6E's two
targets were both taken by Tuesday while neither of its entries was
touched; MNQ's near pocket was run on day one without a held reclaim. The
levels were not wrong — they were computed three days before the entry they
described. Trigger selection is already nearest-first (`triggerSetups`,
sorted by distance), so this is snapshot staleness, not a ranking bug: the
zone that produced Tuesday's short was created by Tuesday's own high and
could not exist in a Sunday list.

The early-week counter-trend allowance therefore stops needing a special
path. It is valid Monday–Tuesday and is now computed on those mornings, so
there is nothing frozen to go stale and no flag to gate.

Journal side: the sprint moves to `plan_horizon: "day"` — the journal's own
default, which the W36–W37 sprint had overridden to `week`; the
`morning-plan` ritual records that a weekly cadence degenerates into "from
Tuesday on the plan already exists". The weekend touches the journal not at
all — no `plan_start`, no lock. The first lock of the week is Monday
morning, which also sidesteps `plan_get_active` resolving against
`America/Chicago`, where an early Athens morning still reads as the
previous trading date. Intraweek theses survive the daily boundary through
the ritual's step 2½ (`plan_transfer_setup` / `plan_copy_setup`), chosen
per setup rather than inherited. `plan_horizon` is fixed at `sprint_start`
and there is no `sprint_update`, so the switch lands at a sprint kickoff.

**The H4 grid — the nested morning read [CALIBRATION, user, 2026-09-10/11].**
The morning run is one read nested three deep, not four reads side by side.
W/D set direction, invalidation and the big targets. The H4 is the *grid*:
on each side of price the nearest untaken liquidity — an alive same-side LB
extreme or a build-up (≥ `min_touches`) — is the edge, and the edge extends
outward through anything (any level, any LB extreme) within
`respect_tolerance_atr` beyond it, so a shelf under an LB (6E 1.16285 under
1.16335) or a nested LB inside the daily LB (MGC 4341.3 inside 4329.3) is one
edge. Single-touch levels between price and an edge are rungs (partials);
what lies past an edge is "beyond" — where the grid redraws to on the bias
side, where continuation goes on the other. A side with no strong candidate
falls back to its nearest level, flagged weak. The 1h/15m/5m reads live
*inside* the grid: their targets past an edge are clipped to it, a story
against the bias inside the grid is `noise` (docs/MARCO-CASES.md D1, "trap
city"), never merely "against", and their local frame is the sub-range
between the edges. Price leaving the grid is an H4 event — the grid redraws
and the lower reads are re-derived; it is never an LTF scenario.

Scenarios are events at the edges, rendered with ready answers: **A** the
nearest bias-side LB tap (over the cap, the nested same-side LB inside the
zone is named as the refinement, V6); **B** the run of the bias-side edge —
the level sweep there, or the next LTF bias-side trap inside the grid that
clears `target_min_rr` and the cap, or the edge itself when it is an LB
extreme; **C** the grid break (a 4h trade past the edge's buffered stop
without a reclaim) — a redraw, not a trade; **D** the counter edge (run +
reclaim → pullback origin; run without reclaim → continuation to the next
rung beyond). Then what is not done (counter-bias LBs are pullback origins,
nothing mid-grid without an event), partials, the 1h conditions per
scenario (the reclaim structure, the 1h LB for the stop) and the timing
line in exchange and local time. The brief order itself was chosen by the
user (docs/MARCO-CASES.md → Approved changes).

**PENDING — the run before the reclaim [CALIBRATION, user, 2026-09-12].**
An edge run within the last bars is not no-man's land, and it is not yet a
direction either. If the run bar closed back through the level, the trap is
in (the *yes* answer: the LB it left is the new edge, A/B are entries). If
it closed beyond and the reclaim has not come, the map has consumed the
level without printing an LB, and a naive grid would jump to the next rung
in the very moment V6 calls the reaction structure ("just because we took
the low does not mean buy right away"). The engine therefore exposes the
unresolved sweep (`map.pending`: level, excursion extreme, bars since the
run, bars left of `confirm_bars`), the grid keeps that side's edge at the run
level with the excursion extreme as the kill, "what we wait for" answers
**pending**, A becomes the reclaim itself (a 1h/15m close back through the
level within the bars left → entry on the tap of the LB it leaves, stop
beyond the extreme), B "the run deepens" (a new extreme moves the stop, no
entry beyond the level), C the breakdown (no reclaim in time → the level is
consumed, the grid redraws). A pending run of the *counter* edge is written
into D: a close back = pullback origin, a miss = continuation.

**Pocket flag on entries [CALIBRATION, user-raised 2026-09-10, built
2026-09-11].** Two tiers on existing parameters. Within `eq_tolerance_atr`
of a deeper intact level the map already prints no LB (pocket floor, §2.3).
Within `respect_tolerance_atr` the LB exists but is *inside the pocket*: its
tap is inducement — the buyers parked there are the fuel for the run of the
floor — so the tap is downgraded ("no entry until the floor is run") and the
sweep trigger at the floor is the preferred entry. The floor must be a
*level* of liquidity; a deeper same-side LB extreme is the V6 stop
refinement, not a trap. The H4 grid's tolerance governs the lower
timeframes: a 15m LB whose extreme sits within the H4 respect distance of a
level edge is inducement whatever the 15m ATR says (6E 15m 1.16405 inside
the 4h pocket 1.16285–1.16515, 2026-09-11).

**Ladder split [CALIBRATION, user, 2026-09-10].** A counter-bias LB on the
path is a pullback origin, not liquidity: its near edge is a partial before
the false reaction, its extreme is what continuation must run. Only the
range extreme — the furthest such zone, "the overall highs" (V3) — is a
target, and then its far edge is the final one. The story read prints
"(LB, pullback origin)" versus "(LB, range extreme)"; never an LB zone
bottom as liquidity (the 1.1668 correction, docs/MARCO-CASES.md U1). The V6
check in §7.2 still holds: the top's bearish LB is the range extreme.

**Contract roll [CALIBRATION, user, 2026-09-11].** Every brief records its
price basis (the last 30 closed exec-TF bars); the next run re-reads the
same bars from the chart. A constant difference on every shared bar is a
roll with back-adjustment (6E1! U6→Z6, +40.5 pips, 2026-09-11): the weekly
layer is shifted by the offset, the brief prints a roll note (redraw your
lines and the journal plan by the same amount) and the new basis is
stamped; a varying difference is a data problem, not a roll, and is said
so. `--shift SYMBOL=offset` applies a manual shift while no stored basis
exists yet.

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
- **Re-entry:** a stop-out does not kill the idea. While the target-side
  liquidity is still intact and the trap repeats, look for the re-entry —
  "if my sell target is still intact, definitely I'll be looking for
  re-entry"; a missed entry can be retaken on the snap-back and a lower-TF
  retest. One or two small losses before the real trade is normal (the
  author's own win rate is 40–60%, condition-dependent). **[SOURCE, V7]**

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
| What kills a zone | trade beyond the LB extreme (wick, no buffer) — since 2026-09-06; close-based before | on |
| How long an intact level is remembered | `levelMaxAge` (Pine) / HTF feed `seed_levels` (engine) | 2000 bars / 10 per side |
| Respects that turn a zone's extreme into a target (§2.3) | `minTouches` (reused: extreme + respects) | 2 |
| A run stopping this close above a deeper level is a poke, not a trap (§2.3) | `eqTolerance` (reused) | 0.25 ATR |
| Equal extremes: which bar of a tie run is the swing | first bar (strict left, ≥ right) | — |
| "Equal" level tolerance for build-up | `eqTolerance` (ATR mult) | 0.25 |
| Taps needed to call a level "build-up" | `minTouches` | 2 |
| How far back liquidity levels are tracked | `maxLevels` per side | 20 |
| Zones thinner than this are not entry-grade | `minZoneAtr` / `min_zone_atr` | 0.25 ATR |
| Stop offset past the zone extreme | `stopBufAtr` / `stop_buffer_atr` | 0.1 ATR |
| A trap older than this reads as stale | `story_fresh_bars` (engine only) | 16 bars |
| A later low holding this far above a level is a confirming touch ("low respecting low") | `respectTol` / `respect_tolerance_atr` | 0.75 ATR |
| Which sweeps count as a side of the range being run (the story anchor, §3) — the rest is inducement | `minTouches` / `minLevelAge` (reused) | 2 touches / 50 bars |
| Where a timeframe's own direction comes from (§3): the trap, the draw, or nothing | `Bias` / `bias_source` / `--bias` | trap |
| The weekly brief's two layers (§3.1): global bias W→D with big targets; intraweek phase D/4h, reachable targets, triggers 240/60, counter-trend window | `marco weekly` | Mon–Tue counter-trend, nearest target only |
| A trigger's target steps to the next cluster below this RR (§3.1) | `target_min_rr` | 1.5 (the journal's min RR) |
| Week-target clusters: D/4h levels closer than this are one draw | `eq_tolerance_atr` on the daily ATR (reused) | 0.25 ATR |
| "Aligned" needs a live story; a stale trap + continuation is a lean | `story_fresh_bars` (reused) | 16 bars |
| The H4 grid edge: the nearest alive LB extreme or build-up, chained through anything within this distance beyond it (§3.1) | `respect_tolerance_atr` (reused) | 0.75 ATR |
| Pocket flag: a bias-side LB tap whose extreme sits this close above a deeper *level* is inducement (§3.1); the poke tier below it prints no LB | `respect_tolerance_atr` / `eq_tolerance_atr` (reused) | 0.75 / 0.25 ATR |
| Scenario B inside the grid: an LTF sweep needs this RR and must fit the cap (§3.1) | `target_min_rr`, `max_risk_per_trade` (reused) | 1.5, $250 |
| Contract roll: every shared basis bar differs by one constant, within this tolerance (§3.1) | half a tick (`contracts.json`) | — |
| The timing line's local clock (§3.1) | `local_tz` | Europe/Athens |

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
  - `intraweekLayer(reads, bias)` — the pure intraweek layer (§3.1):
    `clusterTargets` ladder, per-trigger targets (`triggerSetups(..., {
    targets })` returns `targets: [{price, rr, atr_weeks}]` per trigger and
    the step/refine notes), phase note against the week's bias;
    `resolveBias` returns `stale`. Fixtures: `tests/fixtures/mnq_2026-09-04.json`,
    `6b_2026-09-04.json` (W/D/240/60 bars).
  - `seedFromMap(htfMap, htfBars, { before, price })` — the HTF feed (§2.1):
    `marco weekly` seeds D from W and 240/60 from D; `marco brief`/`scan`
    seed every scanned TF from the `htf` (240) map. New events: `low_poke` /
    `high_poke` (pocket floor), `*_lb_respect`, `*_lb_retired` (reason
    `expired` | `buildup`); blocks carry `respects`, levels `seeded`.
  - `node src/cli/index.js marco weekly --compact` — the weekly brief in
    two layers (§3.1): global bias W→D with the big targets (≈Nw = distance
    in weekly ATRs) and invalidation; intraweek phase (D vs 4h), reachable
    week targets, sweep triggers on 240 and 60 in the bias direction, and
    the early-week counter-trend setups. Writes `briefs/weekly/<ISO week>.md` and
    `.json`; `marco brief`/`scan` read the latest `.json` and stamp every
    intraday story `aligned` / `against` the weekly bias.
  - `node src/cli/index.js marco daily [--compact] [--shift SYM=offset]` —
    the morning run (§3.1): direction from the weekend brief, the H4 grid
    (`h4Grid`), the 1h/15m/5m reads clipped to it (`clipToGrid`), the
    pocket flag (`flagPocket`), scenarios A/B/C/D (`dailyScenarios`), the
    contract-roll check (`detectRoll`, `shiftPrices`, `basisBars`) and the
    approved brief (`renderDailyMarkdown`) — all pure, in
    `src/core/marco_grid.js`, tested in `tests/marco_grid.test.js`. Writes
    `briefs/daily/<date>.md` + `.json` (gitignored); the `.json` carries the
    basis the next run compares against. These are reads over the same
    map — no new state and no new parameter — so the Pine indicator is
    unchanged.
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

**V7 check (XAUUSD 1h, replayed at 2026-06-18, engine defaults):** the
interview's 4378 level is not a 1h pivot and never registers — yet the
machinery recovered the trade: before the spike the story was already
`sell_story` ("highs were run and reclaimed 2 bars ago — look for shorts at
the bearish LB 4349.6–4364.1") with the intact single-touch high 4369.7
standing as the run target; the 17 Jun 17:00 spike swept 4363.7/4364.1 (both
age-qualified via the invalidated-LB rule) and 4369.7, and left a
**qualified bear LB 4369.7–4382.6 that brackets the author's 4378 line** —
price then fell ~100 to 4278. Cost of the fractal proxy: the anchor sits
~$9 below his hand-drawn line. Open idea (not built — the case is caught
functionally): promote a non-pivot bar high to a level once later highs
respect it ≥ `min_touches` times within `eq_tolerance` — market-confirmed,
no new parameters; would move the anchor to the true bar high. **[V7]**
A second live case (6E 1h, W36) shows the miss can sit on the *trigger*
edge, not only the stop anchor: the Aug-16 Sunday-open wick 1.15765 is the
true bottom of the entry pocket but never registers (flat neighbors — not a
strict pivot), so the engine's sweep trigger reads 1.15795 (the pivot 3
pips above). By the book the trap completes only below the pocket's
furthest low — a stab under 1.15795 holding above 1.1576 is another
inducement into the pocket, not the completed run. Had 1.15765 registered,
the respect rule would have kept the level at the extreme.

**Third case and the fix (6B 1h, 4 Sep 2026 — built 2026-09-06).** The
floor 1.3474 (13 Aug, equal lows 06:00/09:00) never registered on the 1h —
tie pivots cancelled, and the Aug-13 bull LB 1.3474–1.3483 that did carry
it had aged out, extreme and all. Sep 2's 1.3475 (equal 12:00/13:00) was
invisible for the same reason, so Friday's 1.3476 read as a full sweep of
the 1.348 x3 cluster: bull LB, 1h buy story, "draw up, x0 below" — while
the user counted x3–x4 at 1.3474 and called it the short's target. Rules
shipped (§2.3, §2.1): trade-beyond invalidation, expired extreme → level,
respects retire a zone into a build-up, pocket floor, tie-aware swings, and
the HTF feed. On the same bars the 1h now reads 1.3474 as an intact x4
level (seeded from the daily, respected on Sep 2 and Sep 4), records Friday's
1.3476 as a `low_poke` with floor 1.3474, prints no bull LB there and reads
sell with the weekly (`tests/fixtures/6b_2026-09-04.json`, regression test).
The "respected bar-high promotion" idea above is superseded for lows/highs
that ever were a swing or a zone extreme; a bar extreme that was neither
still needs the promotion rule — not built.

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
- Cases from the Inter Equity Discord/Instagram and the user's own markups, with
  the engine read on the same bars, live in `docs/MARCO-CASES.md` — principles,
  approved-but-unbuilt changes, rule candidates and the engine-gap table. The
  procedure is the `marco-case-review` skill. A rule enters this file only after
  it is built (engine + Pine together, §7).
