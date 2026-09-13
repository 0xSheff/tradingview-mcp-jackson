# Marco — case log and working notes

Raw material behind `docs/MARCO.md`. That file is the distilled rulebook; this one
keeps the cases that produced or tested a rule, so the reasoning travels with the
repo. Read `docs/MARCO.md` first — the tags and section numbers below refer to it.

## Conventions

- **Case ids.** `D#` = Inter Equity Discord post, `IG#` = Instagram post, `U#` = the
  user's own markup reviewed in a session, `E#` = a YouTube video by Elijah (Ghost
  Capitals, @Ghostcapitals — an IE coach with his own branch in the Inter Equity
  Discord; user, 2026-09-14). Author is named when it is not Marco
  (e.g. Elijah, IE moderator) — a moderator's chart is evidence about the method, not
  the author's word; it stays `[SOURCE, D#]` only if Marco's own rule is quoted.
- **Per case:** date/time (ET and Athens), instrument, what the pictures show, what
  our engine read on the same bars (`marco scan`), outcome if known, verdict, and any
  rule candidate. Screenshots are not stored (gitignored) — record the numbers.
- **Statuses.** *Principle* = agreed way of reading, no code needed. *Approved* =
  the user asked for it, not built yet. *Candidate* = proposed by the analyst, not
  confirmed. *Retracted* = an observation withdrawn after review, kept so it is not
  re-raised.
- Every number chosen by us stays `[CALIBRATION]`; never present it as the author's.

## Principles (agreed 2026-09-10)

1. **Nested read, not per-timeframe reads.** W/D = bias, invalidation, big targets in
   weeks — a constraint for everything below. H4 = the *grid*: the nearest untaken
   liquidity each side (with tap counts) plus alive LB zones; scenarios are events at
   the grid edges (run + reclaim / run without reclaim / respect), phrased in H4
   levels. H1 = scenarios *inside* the grid only: the confirmation structure at an
   edge, the local frame between the edges, partials at 1h levels. An H1 scenario
   never leaves the H4 grid; price leaving the grid is an H4 event — the grid is
   redrawn and the H1 scenarios re-derived.
2. **We wait for a run, not a touch.** At a level three things can happen: respect
   (tap count grows, the level becomes a likelier target), run + reclaim (the trap —
   the story flips to the other side, the LB left behind supplies stop and retest),
   run without reclaim (continuation — the level is consumed, the next one is nearest).
   The LB is what a run leaves, not what we wait for. H4 levels are for alerts, not
   orders. `[SOURCE, V1, V3, V6]` There is a fourth, transient state the brief must
   name (user, 2026-09-12; built the same day): **PENDING** — the edge was run but the
   reclaim is not confirmed yet. The level is gone from the map and the LB is not born,
   so a naive grid jumps to the next rung and reads no-man's land in the one moment
   V6 calls the reaction structure. The engine now exposes the unresolved sweep
   (`map.pending`), the grid keeps the edge at the run level with the excursion
   extreme as the kill, "what we wait for" answers *pending* with the bars left
   (`confirm_bars`), A becomes the reclaim itself (entry on the tap of the LB it will
   leave, stop beyond the extreme), B "the run deepens", C the breakdown. A run that
   was reclaimed within the last bars is the *yes* case — direction ready, not
   no-man's land — and the brief already printed it that way in the first live run
   (MNQ, 2026-09-11: "run 1 bar ago … reclaim → bull LB").
3. **Magnets vs pullback origins.** A magnet is where stops cluster: a build-up
   (x2+), a trend line, an HTF candle extreme, the range extreme. A *counter-bias LB*
   is not a magnet — its zone "holds no liquidity" (V1); it is where the false
   reaction is expected and its extreme is what continuation must run. A *swept
   level* is nothing: it explains why the run happened and its run's extreme became
   the LB, but it is neither target nor level. Do not quote an LB zone bottom as
   liquidity.
4. **Box edges** (§2.4): box = sweep extreme ↔ swept level, extended right to the
   first touch; invalidation = price traverses the full height (= trades beyond the
   extreme). Candle bodies and wicks are never mentioned in any IE material seen so
   far. Keep `zoneTopMode = "swept level"`; keep watching.
5. **Count taps, not highs and lows.** The ladder is sorted by distance, the weight is
   by taps: an x1 extreme and an x5 shelf are different things. A shelf of near-equal
   HTF lows is "lows respecting lows" `[SOURCE, V6]` even when no single bar is a
   strict swing — the engine misses those (see *Engine gaps*); the eye must not.

## Approved changes

All four below were **built on 2026-09-11** (`src/core/marco_grid.js`, wired into
`marco daily`; tests in `tests/marco_grid.test.js`; rules restated in
`docs/MARCO.md` §3.1 and §6). Two things were learned in the build and are
recorded under *Rule candidates* → pocket flag.

- **Intraday brief format** (user, 2026-09-10; built — `renderDailyMarkdown`,
  `marco daily --compact`, `briefs/daily/<date>.md`). Per instrument, in this order:
  1. global reminder — W/D bias, big targets (≈Nw), invalidation, one line;
  2. H4 grid — **current levels only** (user, 2026-09-11, after the first rendered
     brief): the lower edge, the upper edge, and the ladder between them — one line
     per level with its tap count or LB zone, nothing else. Two separate short blocks
     carry the rest: *since the last check* (which edge was run, when, the LB it left,
     where price went) and *beyond the grid* (the next rung past each edge — what the
     grid redraws to, and where continuation goes after the upper edge). "Levels are
     for alerts, not orders";
  3. "what we wait for" — has a bias-side level been run and reclaimed? yes → trigger,
     no → no-man's land;
  4. scenarios A/B/C/D with ready answers — entry zone, stop, first rung, RR, what
     kills it, what we do *not* do (no counter-bias LB entries, nothing mid-range); a
     grid break is written as "grid redraws", not as a trade scenario;
  5. 1h conditions per scenario — what the 1h must print (sweep + reclaim, the 1h LB
     for the tighter stop), the 1h local frame, partials at 1h levels;
  6. timing — NY session only (V5), the 10 a.m. H4 gate.
  Target: `marco daily` renders this; engine trigger rows map into the scenarios.
- **Clip the LTF layer to the H4 grid** (user, 2026-09-10; sharpened from "print the
  HTF range above the LTF setups"; built — `h4Grid` + `clipToGrid`). LTF targets beyond an H4 edge are replaced by the
  edge; an LTF story whose draw lies outside the grid against the bias is labelled
  *noise* (D1's "trap city"), not merely "against"; the LTF local frame is always the
  sub-range between the H4 edges.
- **Contract roll detection** (user, 2026-09-11; built — `detectRoll`, `shiftPrices`,
  `basisBars`, `--shift SYMBOL=offset`; `quote_get` with a foreign symbol now errors
  instead of mislabelling the chart's series). On 2026-09-11 `6E1!` rolled from
  6EU6 to 6EZ6 overnight and TradingView back-adjusted the whole series by +40.5
  pips: every level the engine printed moved, while the W37 brief's targets,
  invalidation and HTF zones — and the journal's locked 6E plan — stayed in
  September prices. The daily run must catch this itself: every brief (weekly and
  daily) records its price basis (front contract, plus the OHLC of its last closed
  bar per timeframe); the next run re-reads those same bars from the chart and, if
  every shared bar differs by one constant, treats it as a roll — shifts the weekly
  layer's levels by the offset, prints a roll note at the top of the instrument
  block (old → new for the user's lines and the journal plan), and stamps the new
  basis. A non-constant difference is a data problem, not a roll — say so and stop.
  Tooling bug found on the way: `quote_get` ignores its `symbol` parameter and
  returns the chart symbol (6EU2026 and 6EZ2026 came back identical) — fix it, and
  do not use it to detect the front contract until then.
- **E1 — left liquidity, deepened runs, the invalid-LB chain** (user, 2026-09-14;
  **built the same day** — engine + Pine v10 + `flagPocket` / `clipToGrid` /
  `dailyScenarios`; tests in `tests/marco.test.js` (three hand fixtures + the MNQ
  Sep-2 real bars) and `tests/marco_grid.test.js`; rules restated in `docs/MARCO.md`
  §2.3, §3, §3.1, §6, §7). The build decisions are recorded under the E1 verdict.
  Side effects seen in the suite: the 6B fixture's Sep-4 4h bear LB 1.3548–1.3549
  reads *invalid* under the intact Aug-31 high 1.3566 x2 (the D1 line), so the
  week opens with no local 4h story and the run of 1.3566 as the trigger — the
  intraweek test was updated to say so; the weekly 6B map no longer prints the
  Mar–Jun cascade of ever-lower LBs (each a "reclaim" of the previous extreme): a
  deepened run that is not reclaimed is a breakdown. Not re-uploaded to
  TradingView yet — the desktop app was not running; `pine check` and save the
  next time it is (back up the TV copy first).

## Rule candidates

- **Ladder split** (from U1; **built 2026-09-11** — `storyRead` marks counter-side
  zones `pullback_origin` / `extreme`, the reads print "(LB, pullback origin)" vs
  "(LB, range extreme)"). Print two lists instead of one "targets": (a) liquidity
  targets = intact levels / build-ups + the range extreme (kept even when the extreme
  is an LB — this preserves the V6 check in §7.2); (b) pullback origins = alive
  counter-bias LB zones on the path: partial before the false reaction, extreme = what
  continuation must run. Stop printing an LB zone bottom (= swept level) as a target.
- **Pocket flag on entries** `[CALIBRATION, user-raised, 2026-09-10]` — **built
  2026-09-11** (`flagPocket`, and the grid-level tier in `clipToGrid`). Two tiers on
  existing parameters: within `eq_tolerance` above an intact level → poke, no LB
  (existing §2.3 rule); within `respect_tolerance_atr` (0.75 ATR) → the LB is born but
  flagged `pocket`: its tap is downgraded ("no entry until the floor is run") and the
  sweep trigger at the floor becomes the preferred entry. The brief renders the LB
  tap as the inducement leg of the deeper scenario, not as an entry. U1 numbers: 6E
  4h ATR 18 pips, eq_tol 4.5, respect 13.5; the low 1.1593 sat 5.5 pips above the
  1.15875 shelf — the poke rule missed by one pip and the brief printed the LB tap
  first. **Learned in the build (first live run, 2026-09-11):** (1) the floor must
  be a *level* of liquidity — a deeper same-side LB extreme is the V6 stop
  refinement, not a pocket (MGC's nested 4341.3–4351.2 inside the daily
  4329.3–4365.2; MNQ's 29038 above the Sep-4 LB 28927.25) — the first version
  flagged both and called every refinement inducement; (2) the H4 grid's tolerance
  governs LTF taps: the 6E 15m LB 1.16405–1.16455 was not a pocket by the 15m's own
  ATR but sits 12 pips above the 4h floor 1.16285, so the grid marks it. Not built:
  "the build-up gains a respect tap" — that would touch the map's counts (state, and
  therefore the Pine), so the tap count stays as the map has it.
- **Shelf promotion** (§7.1 open idea, now four examples). A non-pivot bar low that
  later bar lows respect ≥ `min_touches` times within `eq_tolerance` becomes a level.
  See *Engine gaps*.
- **Left-liquidity validity test** `[CALIBRATION, from E1, 2026-09-14]` — **built
  2026-09-14** (see *Approved changes*; decisions under the E1 verdict). Elijah's
  diagram: a run creates a valid LB only when it takes the level *and* the liquidity
  from the left; while the left liquidity stays intact, price "respects this area and
  keeps trading" to it. The engine has this only as the respect-tolerance tier of the
  pocket flag (0.75 ATR), and both E1 misses sit beyond it (92 and 105 pts against
  60–71). Proposal: make the test structural. For a run on one side, the *left
  liquidity* is every intact same-side level or build-up beyond the swept level
  within the current leg — on the exec TF bounded by `story_lookback`, in the daily
  brief bounded by the H4 grid (edge included). Two tiers, both on existing
  parameters: left liquidity with ≥ `min_touches` (or the grid edge itself) intact →
  the LB is **invalid**: no story flip (`Bias = Auto`), no entry, its sweep is the
  trigger; only x1 swings intact → the LB is **valid but unrefined**: the tap or the
  build-up run is the *aggressive* entry, the sweep of the left swing the *refined*
  one (Elijah: "personal preference — me personally I like to wait for this point").
  Replaces the respect tier of `flagPocket` and the `inducement` test of `storyRead`;
  the `eq_tolerance` poke tier stays. Engine + Pine together. Open for the build:
  whether an alive same-side LB *extreme* counts as left liquidity for the story — it
  did in E1's Sep 1 09:00 read, while the 2026-09-11 exception keeps it out of the
  pocket flag (a nested LB inside the HTF anchor zone is a refinement); E1 suggests
  the layering decides: the extreme counts when it is the HTF's *draw*, not its anchor.
- **Deepened runs inherit the trap** `[CALIBRATION, from E1]` — **built 2026-09-14**.
  A fresh LB (younger
  than `confirm_bars`) traded through by a wick within `eq_tolerance` of its extreme,
  with the bar — or the next `confirm_bars` — closing back above the *original* swept
  level, is the same run deepened (§3.1 PENDING B, after the fact), not "an internal
  low run inside the leg": the LB becomes new extreme ↔ original swept level, keeps
  the level's qualification, the story stands. E1: Sep 2 05:00 → 07:00, 13.5 pts =
  0.16 ATR, the 1h fell from `buy_story` to `down_continuation` while the 240 (both
  wicks in one bar) read the trap. Engine + Pine; regression test on the MNQ fixture.
- **The invalid-LB chain in the brief** (rendering only) — **built 2026-09-14**. E1's
  1h → 5m walk is the D
  scenario's mechanics written out: the counter-bias LB is *invalid* — "an area price
  respects to engineer liquidity" — and its false reaction builds the build-up (trend
  line, equal lows) under which the bias-side trigger is expected: "do not buy above
  the build-up". Print, per bias-side scenario, both entry grades — aggressive (the
  build-up run, close-confirmed) and refined (the run of the leg's origin swing) —
  with the stop covering the whole LB extreme either way ("this high can easily get
  taken out and then respect this extreme"). `renderDailyMarkdown` only; no map change.

## Engine gaps observed

**Flat neighbours / shelves.** A run of near-equal HTF lows (or highs) where no bar is
a strict `pivot_len` swing never registers, so its tap count is lost:

| Instrument, TF | Shelf | What the engine saw | Effect |
| --- | --- | --- | --- |
| 6E 1h, W36 | Sunday-open wick 1.15765 | trigger read 1.15795, 3 pips above | trigger edge wrong (§7.1) |
| 6B 1h, 4 Sep 2026 | 1.3474 equal lows 06:00/09:00 | nothing — tie pivots cancelled | fixed: tie-aware swings, HTF feed (§7.1) |
| 6B 4h, 4–7 Sep 2026 | 1.3505 / 1.3511 / 1.3512 / 1.3506 | nothing on 240 and D; 1h had 1.3506 | 240 bull LB 1.3492–1.3521 instead of 1.3492–1.3505; second target unnamed |
| 6E 4h, 2–4 Sep 2026 | 1.15890 / 80 / 75 / 85 + Sep-4 1.15880 | x1 on 240 (the Sep-4 pivot only), x2 on 60 | the strongest build-up below price under-counted; pocket rule missed by a pip |

Rising lows are never strict pivots (each has a lower low within `pivot_len` bars to
the left), and a shelf 30 pips above the last pivot is beyond `respect_tolerance`, so
neither the swing rule nor the respect rule catches it.

**Deepened runs.** A wick through a fresh LB's extreme within `eq_tolerance` kills the
LB and re-opens the sweep against the LB's own young x1 extreme, so a qualified trap is
re-read as "an internal low run inside the leg" — MNQ 1h, 2 Sep 2026 05:00 → 07:00 ET
(E1): 28 940.75 → 28 927.25, 0.16 ATR, `buy_story` → `down_continuation` + `inducement`.
The 240 does not see it because both wicks fall in one bar. **Fixed 2026-09-14** (the
E1 build): the pending reopens against the original level with its qualification and
`bull_lb_deepened` marks it; the MNQ real-bars test pins the Sep-2 read.

---

## Cases

### D1 — Elijah (IE), Discord, 2026-09-09 22:33 ET / 05:33 Athens Sep 10 — "WELCOME TO TRAP CITY"

Instrument GBPUSD (FOREXCOM) 5m + 4h — our `CME:6B1!`. Text: *quick lesson on how
things can appear enticing on the lower timeframes, but the HTF can say otherwise —
simplify your markups — reduce the noise.*

Pictures: (1) plain 5m Sep 7–9; (2) the same 5m with about seven by-the-book LB boxes,
both sides, three of them run straight through (Sep 8 03:00 bear, Sep 8 09:00 bear,
Sep 9 07:00 bull); (3) 4h with two lines only — the Aug-31 high 1.3566, line *ending*
at the Sep 9 03:00 ET sweep (consumed), and the Sep-8 low 1.3521, line *extended
forward* (intact draw).

Engine on 6B 240 (scanned 2026-09-10 14:45 UTC): build-up high 1.3566 x2 swept 8 bars
earlier (Sep 9 ~03:00 ET) → bear LB 1.3566–1.3568 qualified, tapped at the 07:30 ET
retest; build-up low 1.3521 x2 swept 1 bar earlier (Sep 10 ~08:30 ET, low 1.3492) →
bull LB 1.3492–1.3521. The Sunday W37 brief already carried "short sweep above 1.3566
(confirmed x2)" as the 240 trigger. Elijah's two lines are our two 240 build-ups,
one for one.

Outcome after the post: five hours of chop 1.3551–1.3560, down from 04:00 ET; the
fresh 5m bull LB 1.35416–1.35438 tapped at 05:30 and 06:00 (looked held), broken
06:30, waterfall to 1.34915 at 08:30 = the 4h low run by 30 pips. The LTF long was the
trap the post described.

Verdict: confirms §2.5 no-man's land and §3 step 1 at the HTF; counter-bias LB = false
reaction; LTF stories inside the HTF range are noise. Nothing contradicted. Produced the
*clip the LTF layer* change and the box-edge principle (an earlier "sweep candle body"
reading of box 7 was **retracted**: 1 pip ≈ 20 px on the screenshot, the whole gap
between the two modes).

**Follow-up — why 1.3521 and not the lower 1.3506?** 6B 240, ATR14 24.9 pips, eq_tol
6.2, respect 18.7. Sep 02 06:00 L 1.3475 pivot (range extreme, x3 with Aug-13 1.3474
and the Sep-4 poke 1.3476); Sep 04 10:00 L 1.3505, 14:00 L 1.3511, Sun 18:00 L 1.3512,
Sun 22:00 L 1.3506 (1.5k contracts) — a shelf, none a strict pivot; Sep 08 02:00 L
1.3522 + 06:00 L 1.3521 pivot (20k contracts, the bar rallied 42 pips to 1.3563) — x2
equal lows, the origin of the impulse that ran 1.3566 ("explode … leaving internal
points", V3). Ladder nearest-first: 1.3521 → shelf 1.3505–1.3512 → extreme 1.3474.
Elijah drew the first rung only. 1.3506 is the second rung, not "the extreme". Sep 10
ran 1.3521 and the shelf and stopped 16 pips above 1.3474–76.

### U1 — user's 6E 4h markup, 2026-09-10 22:48 Athens (price 1.1612, weekly LONG aligned, target 1.19235)

User lines 1.1656 (top) and 1.15935 (today's low), then moved the lower line to 1.1588.
6E 4h, ATR14 18.0 pips, eq_tol 4.5, respect 13.5:

- Sep 02 02:00 L 1.15720 pivot — ran the Aug-28/30/Sep-1 x3 lows 1.15795–1.1583 →
  bull LB 1.1572–1.1579;
- Sep 02 10:00 / 14:00 / 18:00 / 22:00 lows 1.15890 / 80 / 75 / 85 — a shelf x4, no
  strict pivot; Sep 04 06:00 L 1.15880 pivot (60k contracts) — fifth tap;
- Sep 06 22:00 L 1.16110, Sep 08 02:00 L 1.16115, 06:00 L 1.16110 → 1.1611 x3;
- Sep 03 10:00 H 1.16445 + Sep 07 H 1.16395 + Sep 08 H 1.16390 → 1.16445 x3, run Sep 09
  06:00 H 1.16565 → bear LB 1.1652–1.16565 = pullback origin in the weekly long;
- Sep 10 06:00 L 1.15930 (58k contracts), close 1.16120 — ran 1.1611 x3, stopped 5.5
  pips above the 1.1588 shelf; the engine printed bull LB 1.1593–1.1611 qualified and
  "trap in", triggers `tap long @1.1611 RR 1.6`, `sweep long @1.1588 RR 3.1`, `tap long
  @1.1579 RR 7.3`.

Verdict: the 4h grid is 1.1588 ↔ 1.1656; 1.15935 is only the latest respect of 1.1588
and the extreme of today's LB. The engine under-counts 1.1588 (x1 on 240, x2 on 60);
the eye's x5 is right. Above: 1.1656 x1 (range top, pullback origin) → 1.1668–1.1672
(bear LB from the Aug-28 spike, pullback origin — **not** a magnet; 1.1668 is the
swept level and means nothing) → 1.1685–1.1690 x2 (the intact build-up, the real
draw) → 1.1720–1.1735 (the August range extreme, final target per §5 even though it
is registered as a bear LB).

Scenarios as written for the brief: **A** LB 1.1593–1.1611 holds — *inducement, not
an entry*: a 1h sweep of 1.1593 that closes back is another respect of 1.15875 and its
buyers are the fuel for the run of the shelf (pocket-flag candidate). **B** run of
1.15875 with a 1h reclaim structure — the main scenario (V6: "as soon as price stabs
it out, anywhere below is a valid buy"; V6: wait for the reaction structure), stop
under the 1h LB left below 1.1588 (the 4h stop under 1.1572–1.1579 is ~$375, over the
$250 cap), targets 1.1643 → 1.1656 → 1.1685–1.1690, BE once 1.1643 is taken (V3),
partial at 1.1656. **Grid break** — a 4h close below 1.1572 without reclaim: the grid
redraws with 1.152 x3 as the lower edge; no H1 scenario until then. **D** price reaches
1.1656: run + reclaim → new bear LB = pullback origin, wait for the next low; run
without reclaim → the path to 1.1685–1.1690 is open, stop to BE. Not done: shorts
from 1.1656 / 1.1672 (counter-bias, and the Mon–Tue window is closed), longs
mid-range without an event.

### E1 — Elijah (Ghost Capitals), YouTube `dSDugD5rhFs`, 2026-09-14 — "Identifying liquidity block & traps masterclass" (14:58)

Elijah is an IE coach (his own branch in the Inter Equity Discord — user, 2026-09-14).
The vocabulary and the rules are Marco's; the video is evidence about the method, not
`[SOURCE]`. Reviewed from the auto-generated transcript plus five user screenshots
(2:51, 4:12, 4:41, 5:22, 5:47); the NQ 1h example reproduced on
`tests/fixtures/mnq_2026-09-04.json` (MNQ, defaults, 60 seeded from 240). Prices below
are ours; his NQ1! differs by ticks.

**What he says (0:45–4:44, diagrams).** *Valid* LB = "an area that currently does not
have liquidity below / above — and it has to align with the current direction of the
market". *Invalid* LB = "an area we can see price respect and engineer liquidity,
because it does not align with the current direction". The diagram adds the test the
definition hides: bullish, the run must take the low **and the low from the left** —
"that traps all the traders in the market, meaning we now have no liquidity at this
low"; bearish is the mirror. Invalid: the high is taken but "we've kept these highs to
the left intact and price moves away — the liquidity from the left has not been taken,
therefore price can easily just respect this area and keep trading up"; bullish
mirror: "price could easily still hunt from this liquidity, respect this area … and now
leave liquidity — now you have the move." "Price won't always mirror these exact
diagrams — the market is situational — identify price action with logic."

**NQ 1h (4:49–5:30).** "Price has traded below this low" (the Aug-24 09:00 low
28 947.75, line extended to Sep 2) → "induced sellers — that gives us our direction:
no shorts, we are long". The bear LB from the Sep 1 11:00 spike (his box 29 178–29 318;
our bar 29 179–29 317.25) "does not align with the current direction — trap; that's to
build liquidity".

**NQ 5m (5:34–7:39, Sep 2 → Sep 3; user screenshots 6:32, 6:38, 6:49, 7:10, 7:15,
7:27, 7:39).** Sep 2 ET: the 03:10 high 29 120 (line) is taken by the 08:15 spike
(29 150); the 09:55 drop to 29 015.25 (blue arc) sweeps the 09:30 low and reclaims —
the 5m bull LB *below*; the 10:45 dip 29 088 (arrow, line) is "the low from the left —
you can see how we've reacted to this low and caused this move up, and we've just been
respecting that low ever since"; the 11:00 spike to 29 215 and the 11:20 dip to 29 118
("we've traded up above this high, then traded down, inducing sellers — we formed a LB
here … mind you, we've just respected this area to the left", the 29 120 line) print
the 5m LB 29 118–29 140 (pink box), and the rising channel 11:00–00:00 (lows 29 140 →
29 145) is the build-up "right above it — we need that build-up to solidify that LB,
and we have just that … we do not want to be buying anywhere above this build-up".
"I want to see that low [29 088] taken as my last point of liquidity as well. But more
often than not you don't need to refine it in this manner — you can honestly just take
the entry as soon as this [build-up] low is taken. Personal preference; me personally I
like to wait for this point." The trade (7:10–7:15): limit long **29 088** (the left
low), stop **29 015.25** (beyond the LB below), target **29 317.25** (the top of the
invalid 1h bear LB — the range extreme's far edge, §3.1 ladder split), RR 3.15 — a §4.4
sweep trigger at the origin, stop under the pre-existing LB, target the HTF liquidity.
Outcome: tagged Sep 3 01:15 (low 29 075 — "notice how it takes out that point as well
… we take out that low, and we take out the liquidity from the left; we have the LB
below, and price runs"), back toward entry 05:30 (29 100), target 09:35 (29 359). Our
1h: Sep 3 01:00 low 29 075 / close 29 188.75; 05:00–07:00 lows 29 127 / 29 105.5 /
29 101.75; 09:00 high 29 375.25.

**15m/5m bearish example (7:39–11:40; instrument and date not on the screenshots).**
Highs run → buyers induced → bearish. A "bull LB" left by a minor low run — "a lot of
you would have seen this as a liquidity block" — is invalid: "we've still reacted from
this low to the left … we're not in a bullish environment"; its reactions "induce
buyers yet again". 5m entry once sellers are trapped at a build-up of highs ("traded
into this area multiple times and sold off, now we finally take it out"): *aggressive*
= "as soon as this high gets taken, based on the candle-closure confirmation", target
the lows from the left; *most optimal* = the internal high that forms after the LB and
"induces sellers — this one will trap them once it gets taken out"; the stop covers the
whole LB high — "this high can easily get taken out and then respect this extreme, and
price can still sell off; I'd rather have a wider stop still covering this LB" (the
wider stop did save the trade).

**AUDUSD 15m/5m (11:45–14:06; user screenshot 14:12 — FOREXCOM 5m, Aug 28 → Sep 2
ET).** The Aug-28 09:00 spike 0.71880 runs the external high 0.71870 (blue arc) →
"induces buyers into the market … we now want to see price towards the lows" → bias
short; that spike is the valid bear LB (the stop side, 0.71875). The Aug-29 13:00 low
0.71545, after the 0.71660 high was taken, leaves a bull LB 0.71545–0.71600 (pink
box) — "mind you, we are not in a bullish environment, therefore this area should be a
trap: an invalid liquidity block, we should see false reactions coming from here" —
tapped Aug 30 21:00 and Aug 31 11:00, two false reactions. The highs 0.71720 (Aug 29
17:00 → Aug 31 16:30) are "liquidity being built here"; 0.71770 (Aug 28 09:30 → Aug 31
16:30) is the internal point left after the external run — "take out all this
liquidity from the left, respect this liquidity block, and trade all the way to the
downside". Trade: limit short **0.71770**, stop **0.71875**, target **0.71378** (the
lows from the left), RR 3.73; tagged Aug 31 18:00 (spike 0.71800), lows respected Sep 1
04:30–12:00 (0.71400 → bounce 0.71610), target Sep 2 00:05 (0.71330). The same
mechanics as the NQ long: the entry is the sweep of the left-liquidity level, the stop
beyond the pre-existing LB from the external run, the target the lows the structure
kept respecting.

**Engine on the same bars (MNQ 1h, defaults; 1h ATR14 80–95, eq 20–24, respect 60–71):**

| Bar (ET) | What happened | Engine 1h read | Elijah's rule | Outcome |
| --- | --- | --- | --- | --- |
| Sep 1 09:00 | waterfall runs the 1h lows 29 116.75 / 29 040 inside the Aug-24 LB zone 28 947.75–29 116.75, close 29 105.5 | `buy_story`; bull LB 29 040–29 095.5 **qualified**; `tap long @29095.5 RR 6.9, confirmed` | invalid — the low from the left (Aug-24 28 947.75, 92 pts below, beyond respect 68.5) is intact | killed 14:00 (29 001.75); 28 947.75 run Sep 2 |
| Sep 1 11:00 | spike 29 317.25, close 29 296 | level `29317.25 x1` (no LB — it swept no registered high) | invalid bear LB, "to build liquidity" | tapped Sep 2 23:00 (29 242.75) and Sep 3 04:00 (29 293) — false reactions; run Sep 3 09:00 |
| Sep 2 05:00 | low 28 940.75 runs the Aug-24 extreme 28 947.75, close 28 973.25 | invalidated-extreme rule → `buy_story` "lows were run and reclaimed 0 bars ago"; bull LB 28 940.75–28 947.75 Q, thin | direction long — "traded below this low, sellers induced" | agrees |
| Sep 2 07:00 | low 28 927.25 (13.5 pts = 0.16 ATR deeper), close 29 083.75 | the 05:00 LB **invalidated**; new bull LB 28 927.25–28 940.75 `inducement` ("an internal low run inside the leg"); story → `down_continuation` | the same trap, deepened — the low **and** the low from the left are taken | 29 543.75 within 28 h; the 240 (one 04:00–08:00 bar) read `buy_story` at once |
| Sep 2 10:00 | high 29 211.75 runs 29 171.25 x2, close 29 120.25 | `sell_story`; bear LB 29 171.25–29 211.75 **qualified** (x2 build-up run); target 28 940.75 | invalid — direction long, and the high from the left (29 317.25, 105 pts above, beyond respect 71) is intact | 20 h of chop 29 075–29 293 under it (the 5m trend line), then 29 317 run → 29 543.75 |
| Sep 3 04:00 | high 29 293, close 29 216.75 | bear LB 29 255–29 293 `pocket` — "24.25 below the x1 level 29 317.25; no entry until it is run" | invalid, same reason | run without reclaim 09:00, continuation — agrees |

W/D from the fixture on these dates: weekly `buy_story` (stale), daily `sell_story` with
28 947.75 as its target → `counter_trend` short. The Sep 2 run consumed the daily's
target, so the layered read returns to the weekly long on exactly the bar Elijah calls
the direction; in the daily brief the Sep 1 09:00 and Sep 2 10:00 1h stories would have
been `noise` against the bias — the H4 grid already carries the *alignment* half of his
rule.

**Verdict.** Nothing contradicts `docs/MARCO.md`: valid = "holds no liquidity" +
aligned (§2.3, §3); invalid = the false reaction / pullback origin (§3, ladder split);
the build-up solidifies the LB (§6 qualification); wait for the run and do not buy above
the build-up (§4.4, Principle 2, pocket flag); the trend line as build-up (§2.1);
direction as a reaction to a run (§3.1); the stop covers the LB extreme (§5); the
"internal point after the LB" entry is §4.2's candle 3. Two things the engine gets
wrong on his own example, both about the *left liquidity*: (1) the respect tier of the
pocket rule is distance-bounded while Elijah's test is structural — both misses
(Sep 1 09:00, Sep 2 10:00) sit 92–105 pts beyond a 60–71-pt tolerance; (2) a deepened
run kills a fresh qualified LB and demotes the story (Sep 2 07:00). Both → *Rule
candidates* (left-liquidity validity test; deepened runs inherit the trap), plus a
rendering candidate (the invalid-LB → build-up → trigger chain, two entry grades). The
Sep 1 09:00 miss is not an argument against the 2026-09-11 "floor must be a level"
exception: the Aug-24 extreme was the *daily's target* — the running leg's draw — not
the anchor of a live story as MGC's daily zone was; the layering, not the pocket flag,
separates a nested refinement from inducement into the draw.

**Build decisions (2026-09-14, all `[CALIBRATION]`).** (1) Alive same-side LB
extremes are not left liquidity — Elijah's 5m long sits above the 29 015 LB and the 1h
LB 28 927, his AUDUSD short under the 0.71880 LB: they are the stop anchors (V6), which
is also the 2026-09-11 "floor must be a level" exception. (2) The structure = intact
same-side levels born since the previous *clean* same-side LB, within `story_lookback`
— an inducement LB does not reset it (so the Sep-3 04:00 bear LB still sees
29 317.25); seeded HTF levels are the grid's business. (3) Grades: `invalid` when a
build-up (≥ `min_touches`) remains or the zone is unqualified — no flip, no entry, its
sweep is the trigger; `unrefined` when only x1 swings remain — no flip, the tap is the
aggressive entry, the sweep of the nearest swing the refined one; `clean` otherwise. A
qualified clean LB is the only story anchor. (4) The `respect_tolerance` tier of the
pocket flag stays as the near-floor rule for the shelves the engine under-counts (U1);
the H4-grid tier becomes structural — a level edge is the floor at any distance, an x1
rung makes the LTF tap unrefined, an LB edge is nothing. (5) Deepened run: a wick within
`eq_tolerance` through a zone younger than `confirm_bars` reopens the pending against
the original level with its taps and age. Known limit: a single-touch level older than
`story_lookback` is outside the structure — Sep 1 09:00's 29 016.75 (Aug 24 20:00, 179
bars) is caught only by the layering (the daily's target 28 947.75). Verified on the
same bars: Sep 2 07:00 `buy_story` at 28 927.25–28 947.75 with "the run deepened past
28 940.75 before the reclaim — the same trap"; Sep 2 11:00 `buy_story` held, the bear LB
29 171.25–29 211.75 `unrefined` and inducement "(the high 29 317.25 from the left is
intact)".
