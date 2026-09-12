# Marco — case log and working notes

Raw material behind `docs/MARCO.md`. That file is the distilled rulebook; this one
keeps the cases that produced or tested a rule, so the reasoning travels with the
repo. Read `docs/MARCO.md` first — the tags and section numbers below refer to it.

## Conventions

- **Case ids.** `D#` = Inter Equity Discord post, `IG#` = Instagram post, `U#` = the
  user's own markup reviewed in a session. Author is named when it is not Marco
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
