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
6. **The trap is the run of the origin, not of the pattern low** (agreed 2026-09-19,
   from V8). After a high is run (buyers induced), the level whose run traps them is
   the low *that move came from* — "where did this reaction occur from? Look to the
   left-hand side" — not the leg's structural swing low: requiring the latter is
   "pattern trading". Every internal run induces one side and is "nothing for us
   yet"; the first touch of the origin is not the trap either (the market may "go
   long again … induce buyers once more"), its *run* is. Without an inducement
   sequence inside the pullback the pattern read stands ("we haven't had a trap
   anywhere else"). Against a live story the stricter E1 test stays: a counter-side
   LB that leaves the leg's origin intact is inducement (MNQ 29 317.25).
   `[SOURCE, V8; E1]`

## Approved changes

All four below were **built on 2026-09-11** (`src/core/marco_grid.js`, wired into
`marco daily`; tests in `tests/marco_grid.test.js`; rules restated in
`docs/MARCO.md` §3.1 and §6). Two things were learned in the build and are
recorded under *Rule candidates* → pocket flag.

- **Intraday brief format v2 — `entry when` grammar** (user, 2026-09-22, after four
  losing trades of which two were entered while the 4h was PENDING; worked example
  `briefs/daily/2026-09-22.v2.md`; built the same day — `renderDailyMarkdown`, the
  `journal-weekly-plan` / `journal-midweek-addendum` templates). Supersedes the
  2026-09-10 layout below. The trader's words: "less noise, more concentrated information
  on the scenarios on the table; `entry when` instead of `no-entry` — a negative
  connotation reads harder, during the live market there is no time to untangle it".
  Per instrument, five blocks, one screen:
  1. **Bias** — header `SYM · LONG/SHORT · price · inval <rule level>`; one line W/D
     mode, regime, week targets, global target (≈Nw);
  2. **Now** — one state word **WAITING / PENDING / VALID / DONE**, the event that made
     it (TF, level, time), the trap pointer, and *the exact event that changes the state*
     (which TF must close where, when the bars close). Replaces "since the last check"
     and "what we wait for";
  3. **Grid** — the H4 edges and rungs, current levels only (unchanged), plus *beyond the
     grid*;
  4. **Scenarios** — numbered by priority, **named by the event** (RECLAIM, DEEPER RUN,
     BREAKDOWN, TOP, BUILD-UP RUN, AGGRESSIVE TAP), never lettered. Each one is
     `entry when:` (a positive condition: TF + level + time window, the 1h condition
     folded in) → `entry · stop · $ · RR · T1 · T2 · BE` → `→ next:` (the scenario it
     turns into when the condition fails). A grid break is `state when:`, not a trade.
     **No "don't" lists**: what is allowed is listed exhaustively and one closing line
     says *everything else = wait*;
  5. **Windows** — the sessions an entry is open in, as local time ranges ("London
     10:00–18:30 · NY 16:30–23:00"; the gate 17:00–21:00), never "no entry at 16:45".
     `[CALIBRATION, trader 2026-09-22]` **Europe + US sessions, not NY only**: Marco
     trades NY (V5) but keeps alerts and reads a level hit at another hour with the
     full picture; the trader wants the system exercised, so London and NY are both
     windows and a level hit outside them is an alert to read with the grid, not an
     entry by itself. A London event still leaves the entry to the LB it prints, on
     the same TF conditions — the session is a window, not a signal.
  The journal `setup_description` uses the same grammar: header · `entry when:` ·
  K-lines · `BE:` · `deeper run:` · `breakdown:` · `aggressive tap … skip` · `global:` ·
  `replaces:`. The labels `no-entry:` and `timing:` are retired into `entry when:`.
  Refinements come pointwise in use (trader, 2026-09-22).
  **v2.1 (trader, 2026-09-23, built the same day):** a summary table first (state + the
  main scenario per instrument); the sessions, the gate and the next 4h closes stated once
  at the top; scenarios a trader can act on today first — within `3 × 4h ATR` of the price
  `[CALIBRATION]` and inside the $ cap — with "(main)" on the first of them, the rest
  marked "not today"; an over-cap zone headlines its refined rung; prices on the contract
  tick (`contracts.json`), $ risk from the rounded stop; wall-clock bar times instead of
  "N bars ago"; the 1h reduced to one line (mode, alignment, frame); TOP says
  "partial" when the counter-trend window is closed; an `Alerts:` line per instrument.
  Open: the language of the engine render (EN now, the hand brief is UA).
- **Scenario horizon — levels from 4h/D, stops from 15m/1h** (trader, 2026-09-23 09:40,
  on the first v2.1 brief: "the grid is too narrow — the position horizon is a day or two;
  4351.9 / 4346.2 → 4384.4 is a couple of hours, not a couple of days"; built the same
  day in `dailyScenarios`, test *horizon*). A scenario is a 4h/1h level or zone — the
  H4 edge, the nearest bias-side H4 rung, a 4h/1h trigger; its targets are 4h/D
  liquidity. 15m/5m structure only refines the stop inside that level (the V6
  refinement) and gives partials and alerts; it is never the scenario. An H4 anchor
  over the $ cap does not make a sweep scenario unactionable — the stop comes from the
  1h/15m LB the reclaim leaves. Open for the weekend review: the `BE:` line on a 15m
  level (22.09 MGC 4386.4) moves the stop into the zone the day-two scenario expects to
  be run — BE on the first 4h target-side level instead?
- **Intraday brief format v1** (user, 2026-09-10; built — `renderDailyMarkdown`,
  `marco daily --compact`, `briefs/daily/<date>.md`; **superseded by v2 above on
  2026-09-22** — kept for the history of the sections). Per instrument, in this order:
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

- **V8 — the reaction origin and the trap pointer** (user, 2026-09-19; **built the
  same day** — engine + Pine v11 + tests; rules restated in `docs/MARCO.md` §2.2,
  §3, §3.1, §6, §7; the case is *V8* below). The map keeps a swing that flips on any
  consumed level; the extreme of the swing an inducing move came from is that
  move's origin (`buyers_induced` / `sellers_induced`, `origin_run`). At an LB's
  birth: build-up beyond → invalid (E1); else unrefined, naming the nearest x1 swing
  when born against a live story (E1) or the intact origin when born with it / with
  none (V8), falling back to the swing; nothing → clean. **An unrefined LB now sets
  the story** unless an opposing anchor is alive (then inducement) — the E1
  `UNREFINED_LEFT` expectation flipped from "no flip" to `buy_story`; the MNQ Sep 2
  10:00 read is unchanged. `trap` marks an LB whose run took an intact origin. The
  intact origin per side is the trap pointer (`map.origins`, `trap_pointers`, the
  daily brief's "Trap pointer" line, the indicator's dashed line + label, two
  alerts); not drawn at an alive same-side LB extreme (E1 decision 1). Rejected in
  the build: putting the origin on the map as a level — the first flips read a
  running extreme that is no swing, and a phantom x1 there got run by the next bar
  and turned the V1 inducement fixture into `up_continuation`; also "flip only on
  qualified runs" — it kills V8's own gold example, where the high that induced
  buyers was x1. Pine v11 uploaded to TradingView as "Liq blocks" the same day
  (see the case for the check).

## Rule candidates

- **MTF leg layer (D + 4h)** `[CALIBRATION, user-raised, 2026-09-23 — case U2; not built]`.
  The stack reads the global W story and the *latest event* per timeframe; the
  divergence rule (MARCO.md §3.1) turns "D continuation against a live W trap" into
  `pullback` = "enter with the weekly once the daily's run is in". Nothing reads the
  **leg** itself — how far the pullback runs and where it ends — so every fresh
  with-bias 4h LB inside a counter leg reads as the trap. 6E W38–W39: W buy_story
  (LB 1.1404–1.1408) while D/4h fell from 1.16965 (9 Sep) for two weeks; the with-bias
  4h LBs 1.1495–1.14965 (Fri 18), 1.1473–1.1495 and 1.1468–1.1473 (Tue 22) all died, the
  counter LBs 1.15935–1.15975, 1.1530–1.15355, 1.1518 all held; the trader's three
  longs of 22 Sep sat in that leg. Proposal:
  1. **MTF state from liquidity only** — which side's LBs hold and which die on D/4h
     since the last HTF-side event: **WITH** (with-HTF LBs hold, the leg extends toward
     the HTF target) · **AGAINST** (with-HTF LBs born mid-leg die, counter LBs hold) ·
     **TURNING** (the leg reached the HTF zone and printed a with-HTF LB that held).
     The **turn** = the run of the leg's last counter extreme (the build-up of lower
     highs in a long HTF) with a 1h/4h close beyond.
  2. **Alignment rule.** WITH → the current stack unchanged. AGAINST → with-HTF entries
     only (a) at the HTF zone the pullback is heading to (the D/W LB, the invalidation
     area) or (b) on the retest after the turn; a with-HTF 4h LB born mid-leg is
     inducement of the leg — V1's "LBs against the story are marked, never entered",
     applied one layer down. TURNING → with-HTF entries at the zone, the turn is the
     confirmation.
  3. **MTF-continuation trades against the HTF** (U2's arrows): in a confirmed AGAINST
     leg, the run of a build-up / origin inside the leg + reclaim → entry on the retest
     of the LB it leaves (the V8 trap, mirrored), nearest leg liquidity only, flat before
     the HTF zone. Extends the Mon–Tue counter-trend allowance to any day, but only
     inside a confirmed AGAINST leg. **No [SOURCE]**: Marco does not enter counter-bias
     LBs (V1); V7's intraday/intraweek layering and our Mon–Tue allowance are the
     precedent. Needs strategy rev 4 (weekend 26–27 Sep, with the two-session windows)
     and a setup type (`mtf-continuation`).
  4. **Engine**: a leg read on D/240 (LB births and deaths per side since the last
     HTF-side event, the last counter extreme, the HTF zone ahead) → an `MTF:` line in
     the brief's Bias block and the scenario ranking keyed on it. Piloted by hand in
     `briefs/daily/2026-09-23.manual.md`.

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
| XAUUSD 15m, 30 Jul 2025 20:00–21:30 ET (case V8) | 3283.4 / 3282.9 / 3283.8 / 3285.5 / 3285.0 | nothing — 19:45's 3280.9 sits inside every pivot window | the 31 Jul 21:45 stab 3281.7 read as the LB extreme's sweep only; the LB and the story came anyway |

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

### V8 — Marco, YouTube `E2n7KMQDYIU`, reviewed 2026-09-19 — "Fix This Liquidity Mistake, Everything Will Change" (13:09)

Marco's own video, so `[SOURCE, V8]`; the row is in `docs/MARCO.md`'s source table.
Reviewed from the auto-generated transcript (396 segments, `youtube-transcript-api`,
scratchpad) plus 46 user screenshots in `tmp/Marco liq explanation mistakes/`
(filename prefix = timecode). The gold walkthrough is a *historical* chart — XAUUSD
OANDA at 3250–3460, i.e. Jul–Aug 2025 (the 4h frame at 09:05 shows the live price
4311.25 in the corner) — 1h → 30m → 15m.

**What he says.** The mistake (01:10–02:25, 06:25–07:00): after a high is run ("the
common retail trader would call [it] a BOS … it induces buyers") most traders mark the
last structural low and refuse to trade until it is run — "a pattern-based
perspective … you can actually trade above this low, but there has to be specific
things that need to occur … where is the trap occurring?" The diagram (02:26–06:25):
the pullback runs internal lows ("induces sellers — nothing for us yet", 08:29), a
rapid move up runs an internal high ("inducing buyers"), and the question is "this
low to this high — where did this reaction occur from? Look to the left-hand side"
(04:31–04:39): the move came off an internal low from the left, which is the
liquidity — "all you got to do is grab this low, drag it over" (05:04); its run traps
the induced buyers — "you don't need price below here [the structural low], you
needed price below here [the origin]" (06:19–06:21); "this is called pattern trading.
We are not doing that" (06:54). Caveats: without a trap inside the pullback the
structural low probably gets taken — "because we haven't had a trap anywhere else"
(07:50–08:12); the first reaction at the origin is not the trap — the market may "go
long again … all we have now done is induce buyers once more … as soon as those lows
are cleared, the buyers have been trapped" (05:45–06:17). Vocabulary: "trap" = the run
that catches the induced crowd *and* the LB it leaves ("we've created ourselves an LB
— this is now known as a trap", 11:36); "trading with structure" is the wrong frame
(10:38–10:50): "we've swept a high, which tells me we have taken some sort of
liquidity. Now all we need to do is wait … the price action has told us the story."
Reason for the long (10:05–10:30): "we need to have a reason to go long — a ton of
liquidity left at the highs": the trend line of falling highs, the internal highs, the
HTF external high.

**Gold, as read off the screenshots (Jul–Aug 2025 prices):**

| Frame | Level | What it is |
| --- | --- | --- |
| 1h 07:24 | ≈3250 low from the left, wicked; internal highs ≈3405, external ≈3452 | the leg's origin and the liquidity above |
| 30m 08:40–08:51 | lower low ≈3300 "induced sellers"; high ≈3346 run → "buyers induced" | the inducement pair inside the pullback |
| 30m 09:44 | zone 3290–3297 "from the left" — "we tapped into this" | the reaction origin = the internal low of the leg |
| 30m 10:58 | stab ≈3287 under the zone, below the previous daily low | the trap of the buyers |
| 15m 11:32–11:38 | build-up lows 3287–3290 → first stab ≈3285 = "an LB … a trap" | "we need to see a build-up", then the stab |
| 15m 11:50 | entry ≈3288, stop ≈3282.5 (5.2), target 3311.2 (22.9), RR 4.39 | second stab takes "this level of internal just to be safe"; stop "below the LB to the left"; T1 = the inducing spike high |
| 15m 12:29 | run to 3366–3368 | the HTF high; the 3346 line "a great partial point" |

**Mapping onto the engine.** The 15m entry is §4.2's four-candle model (stab = LB,
higher low, break → long) with §4.4's stop under the pre-existing LB; the targets are
the ladder split (the inducing spike = pullback origin, partial) and §5. The
"induces sellers → induces buyers → trap" sequence is the map's runs: minor run →
counter-side run → the run of the origin. Before this review the engine graded a
trap with an x1 swing intact beyond it `unrefined` and never let it set the story
(E1 build); V8 says the structural low is not required — a discrepancy that was
situational (inside `story_lookback` → unrefined, outside → clean), i.e. an artefact
of the 60-bar window, not of structure.

**Verdict.** Confirms: left liquidity as the reaction origin (E1's principle, now
Marco's words), build-up → stab = the trap (§6), the entry and stop mechanics (§4.2,
§4.4), the target ladder (§5, ladder split), "wait for a run, not a touch" (Principle
2), the HTF deciding whose trap matters (§3.1; "that aligns with that higher time
frame idea", 08:50), aggressive vs refined (11:00 "sometimes you take out another
level of internal"). Refines: (A) an unrefined LB sets the story — the deeper x1 is
the refined entry, not a requirement; (B) "pattern trading" has a second meaning
(§3.1); (C) the inducement sequence gives a forward-looking level — the trap pointer.
Reconciled with E1 by the anchor: a counter-side LB against a live story keeps E1's
structure test (MNQ 29 317.25 stays inducement); a same-side LB, or one with no story
to speak of, is graded by the origin (V8).

**Build (2026-09-19, all `[CALIBRATION]` on existing parameters).** Swing state in the
map, flipping on any consumed level (pokes and LB invalidations included); origin =
the extreme of the swing the inducing move came from, read at the flip
(`buyers_induced` / `sellers_induced`), `origin_run` when traded through; `left` =
build-up → (against a live story) nearest x1 swing → (with / without a story) the
intact origin → nearest x1 swing; `gradeOf` unchanged in shape; `inducement` =
(not clean or unqualified) and an opposing anchor alive; the story anchor = alive,
qualified, not invalid, not inducement; `trap` on the block and its event;
`map.origins` / `trap_pointers` exclude origins at an alive same-side LB extreme (E1
decision 1). Tests: `V8_TRAP` ×3 (pointer, the trap flips the story with 98.0 intact,
no pointer at an LB extreme); `UNREFINED_LEFT` now expects `buy_story`; all other
E1/V1/V6 fixtures and the MNQ/6B real-bar tests unchanged. Rejected: registering the
origin as a level (phantom levels; see *Approved changes*); flips only on qualified
runs (kills the gold example — the 3346 high was x1). Pine v11 mirrors it. Known
limit: with fine-grained flips a decline with bounces that run minor highs resets the
up-swing, so the origin can be a mid-leg low rather than the leg's start — the anchor
split covers the counter-side case, the same-side case names the nearest origin
(conservative in direction, aggressive in level).

**Gold 2025 replay (2026-09-19; `OANDA:XAUUSD` in bar replay at 2025-08-08, 60m/30m/15m
bars pulled from the chart, 30m seeded from 60m; ET times).** Dating from the bars:
Marco's 30m frames are Tue 29 Jul evening (price 3334), the stab under the zone is
Wed 30 Jul before FOMC (price 3308), the 15m entry is Thu 31 Jul evening and the
"fast forward" is Fri 1 Aug (NFP, high 3363.6).

- **27–29 Jul (30m).** 27 Jul 23:30 buyers induced (3340.3 run, origin 3324). 28 Jul
  09:30 the drop ran 3308.1 x2 → 10:00 bull LB 3301.8–3308.1 Q clean `trap` (it took the
  origin 3324) → `buy_story`; 15:30 the rally ran 3317.3 → buyers induced, origin
  3301.8 = the LB's bottom, so no pointer — the box says it. Marco: "induced sellers"
  (the 3301.8 low) → "buyers induced" (the 3345.5 high) → "if price now sells back off
  to trap the buyers …". The engine gave that low the status of a qualified trap and
  printed the long he calls "inducing buyers" (3308 → 3345 the same day); its box
  bottom is exactly the level he says must be run to trap them. 29 Jul 18:00:
  `up_continuation`, alive bull LB 3301.8–3308.1 TRAP, bear LB 3330.1–3334.3 inducement.
- **30 Jul (30m).** 09:30 the LB 3301.8 killed → LB 3298.4–3301.8 Q clean → 11:00
  killed → 12:30 breakdown; 14:30–15:30 the FOMC drop ran 3288.6 x1 (his zone "from
  the left" 3290–3297), 3282.7 x2 and 3274.6 x2 → breakdown 3274.6 (qualified) →
  `down_continuation`; low 3268.1. Marco: "take out another level of internal, and now
  you can maybe see price back down to the lows … we've taken previous daily low" ✓.
- **31 Jul (30m + 15m).** 01:00 the bounce ran 3298.8 → buyers induced, origin 3268.1 →
  the **trap pointer for longs 3268.1** on both frames. 03:45 the run of 3305.2 x2 → bear
  LB 3309.9–3315 → 30m `sell_story`, targets 3293.8 / 3268.1 / 3244.4 (3293.8 hit 10:30,
  3281.7 by 21:45 — the counter read of the day played, then NFP). 15m 10:30 the run
  of 3293.8 x3 → bull LB 3291.4–3293.8 Q clean → deepened → 12:15 LB 3289.7–3291.4 →
  13:00 `buy_story`, tap 3291.4 / stop 3289.2 / T1 3299.1 (RR 3.6) — **stopped at
  19:45** (low 3288.1) before the real trap: Marco's "you're not staying patient … all
  we have now done is induce buyers once more" in numbers. 19:15 the run of 3289.7 x2 →
  bull LB 3288.4–3289.7 Q clean → deepened 3288.1 → 20:30 LB 3286.6–3289.7 Q clean,
  `buy_story`; 21:30 the stab 3286.2 killed it (trade beyond the extreme), 21:45 3281.7,
  22:00 the reclaim bar (O 3283.8, C 3291.2) → LB 3281.7–3286.2 (x1) → `buy_story`: tap
  3286.2, stop 3281.3, targets 3299.1 x3 → 3311.3 → 3315. **Marco's trade on the same
  bars:** the build-up = the 19:15–20:15 lows 3288.4 / 3288.1 / 3286.8 / 3286.6 ("look
  how we had a build up"), the first stab 3286.2 ("we stabbed the low again — created
  ourselves an LB, now known as a trap"), the second stab 3281.7 ("taken out this level
  of internal just to be safe"), entry ≈3288.2 on the reclaim, stop 3283.0 — below the
  *first* LB, above the second stab's wick — target 3311.2, hit 1 Aug 08:30 (RR 4.39).
  The engine's version: entry 3286.2, stop 3281.3 (under the deepest wick, §2.3), T1
  3299.1 (RR 2.6), T2 3311.3 (RR 5.1). Same trade; his stop covers the first LB, ours
  the whole excursion.
- **1 Aug.** 08:30–09:00 the run of 3334.3 x3/x4, 3345.5 (his "buyers induced" line —
  "a great partial point") and 3349 x2; 15:30 3360.2 x3; close 3362.9.

What it says about the rules: (1) the structure matched Marco's narrative at every
stage; (2) on these bars the old rule would have read the 19:15 LB the same way —
3268.1 was already outside the 60-bar structure — so here V8 changed the pointer, not
the flip; the flip changes in the `V8_TRAP` fixture (the structural low inside the
window); (3) two calibration lessons, both built: the trap pointer expires with the
structure (`story_lookback` / `structBars`) — at 10:30 the 71-bar-old 3268.1 still
showed while the LB born then was graded clean; and the 30 Jul 20:00–21:30 shelf
3282.9–3286.8 never registered (flat neighbours — *Engine gaps*), so the 21:45 stab read
as the sweep of the LB extreme only — the LB and the story came anyway; (4) Marco's
stop sits under the *first* stab's LB, not under the deepest wick — not adopted (§2.3
stays), recorded.

### D2 — Elijah (IE), Discord, 2026-09-18 22:42 ET / 05:42 Athens Sep 19 — "EURO … a clean entry in London"

Instrument EURUSD (FOREXCOM) 15m + 5m — our `CME:6E1!`; basis on these bars: **6E is
spot plus 0.0040** (Sep-16 night low 1.14965 vs 1.14560; Sep-17 spike 1.15385 vs 1.14985).
Charts stamped Sep 18 22:34/22:40 UTC-4. The user's question: the W38 brief had 6E
**LONG (pullback)** — could we have caught this?

**His markup (spot → 6E).** 15m: the Sep-16 FOMC drop; the Sep-17 08:00–10:30 rally
running the 1.14880 (1.1528) and 1.14960 (1.1536) highs, blue arc on the spike top
1.14985 (1.15385); a rising "BUILDUP" trend line under the Sep-17 lows 1.14640 →
1.14760; the Sep-16 low 1.14560 (1.14965) extended right; a pink box 1.14760–1.14800
(1.1516–1.1520). 5m: a light-blue bear LB 1.14920–1.14940 (1.1532–1.1534) from the
spike — "DIRECT ENTRY HERE" at the Sep 18 00:00 ET Asia tap; two pink boxes (invalid
bull LBs, 1.1516–1.1520 and 1.1526–1.1528); "CONFIRMATION" = the 04:10 spike to
1.14921 (1.15321) over the 1.14880 highs and its reclaim → short **1.14877**
(1.15277), stop **1.14921** (1.15321), target **1.14561** (1.14961), hit 08:20 ET —
RR 7.2. Text: "this price action clearly shows where the liquidity in the market is"
— the build-up line and the Sep-16 low are the sell-side liquidity.

**Engine on 6E, bar replay at Fri 17:00 ET, 240/60/15/5 (60/15/5 seeded from 240),
weekly bias long, H4 grid 1.1417 (LB) ↔ 1.15975 (LB):**

| Moment (ET) | Elijah | Engine |
| --- | --- | --- |
| Sep 17 10:45, after the spike | external high run → direction short | 15m own story `sell_story` (bear LB 1.1536–1.15385, x1), targets 1.1512 / 1.15075 / **1.1498–1.14965 (LB, range extreme)** = his target; layered: **noise** against the weekly long inside the grid. 60m: `down_continuation` + **trap pointer for longs 1.14965** ("buyers induced by the 1.15235 run — their stops rest under 1.14965; its run is the trap, a reclaim there the long") |
| Sep 18 00:15, "direct entry" tap | tap of the 5m box 1.1532–1.1534 | the 6E spike 1.1532 stays under our box 1.1536–1.15385 (inner edge = swept level) — no tap printed; the 15m/5m bull LBs 1.1514 / 1.1516 graded **invalid, pocket over 1.15135 x2** = his pink boxes |
| Sep 18 04:20, "confirmation" | run of the 1.1528 highs to 1.15321, reclaim → short 1.15277, stop 1.15321 | 5m bear LB **1.15275–1.15305 = his entry**, graded invalid/inducement: the high 1.15315 (the 00:00 spike) from the left is intact — by **1 pip** on 6E (spot ran it by 1 pip); **trap pointer for shorts 1.15315** — "its run is the trap, a reclaim there the short" (= his trade, his stop 6 pips above it). 60m: the bear LBs 1.15225–1.15385 invalid, left = the leg's origin 1.15975; layered: noise |
| Sep 18 08:45, after the low run | target 1.14561 hit 08:20 | 15m + 5m **`buy_story`**: the x3 build-up 1.14965 run 08:15–08:25 and reclaimed → bull LB 1.1495–1.14965 Q clean; tap 1.14965 / stop 1.14945 / T1 1.1527 (15m) — the grid's lower edge moves to 1.1495 |
| Sep 18 15:15–16:00 | — | 1.1527 x2 run → bear LB 1.1527–1.153; the long's T1 hit (+30 pips); 15m `sell_story` = noise |

**Verdict — could we have caught it?** The *short*, as he traded it: **not by our
rules**. It is counter-bias (W38 6E long), on a Thursday (the Mon–Tue counter-trend
frame is closed), inside the H4 grid — the layered read calls every 15m/5m sell story
`noise` and the 1h grades the bear LBs invalid until the leg's origin 1.15975 is run.
The engine nevertheless *read the structure exactly*: at 04:20 the 5m bear LB
1.15275–1.15305 is his entry, the short-side trap pointer 1.15315 is his stop, the
range-extreme bull LB 1.14965 is his target. The *long* the brief waited for is the
other half of the same picture: the 1h trap pointer said from Sep 17 10:00 that the
buyers' stops rest under 1.14965 and its run is the trap; the run came 08:15–08:25
Sep 18 with the reclaim — 15m/5m `buy_story`, entry 1.14965, stop under 1.1495, T1
1.1527 hit at 15:15. His "clean entry in London" is the false move that hands us the
long (V1: "anticipate this false reaction … if there's a bullish opportunity you buy
back up"). Nothing in the journal for Sep 17–18: no daily brief was generated those
days (the last is 2026-09-15).

**Observations, no rule change.** (1) His light-blue LB 1.14920–1.14940 sits *below*
the swept level 1.14960 — a sweep-candle-body box, the second IE markup drawn that way
(Principle 4: "keep watching"; the 00:00 tap exists only under that box). (2) The
origin check is strict (`high > origin`): 6E's 1.15305 missed 1.15315 by a pip while
spot ran it by a pip — the basis decides a V8 trap at 5m granularity; Principle 2 (a
run, not a touch) says "not yet", which is what the engine said. (3) Elijah's 5m
pink boxes and our `invalid` (pocket over the x2 1.15135) coincide — the E1/V8 grade
matches his hand on the bull side too.

### U2 — user's 6E 30m markup, 2026-09-23 09:06 Athens (price 1.14655, weekly LONG, inval 1.1404)

**What the user drew.** Two arrows at bear LBs above price — "potentially very good
entries, even though against the HTF … a liquidity block, a build-up, the build-up gets
run and price goes the other way" — and three losing longs of 22 Sep, "all three against
the MTF trend, as is already visible". Asked for the MTF layer: how to read it, when it
agrees with the HTF.

**Bars (1h feed aggregated, Athens).**
- Leg: D highs 1.16965 (9 Sep) → 1.1683 → 1.1658 → 1.15975 (16) → 1.15385 (17) →
  1.15355 (21) → 1.1518 (22) → 1.1494 (23); D lows 1.16625 → … → 1.14965 (17) →
  1.1468 (22) → 1.1461 (23 05–09).
- Arrow 1 — Wed 16 Sep, 4h 09–13: high 1.15975 runs the 15 Sep 17:00 high 1.15935 and
  closes back → bear LB 1.15935–1.15975 (thin); next day 1.14965 (FOMC).
- Arrow 2 — Mon 21 Sep, 4h 13–17 (the 06–10 ET gate candle): high 1.15355 runs the equal
  highs 1.15300 / 1.15315 of 18 Sep — 1.15315 is the short-side trap pointer case D2 named —
  and closes back → bear LB 1.1530–1.15355; 1.1461 by
  23 Sep 09:00 (−89 pips).
- With-bias 4h LBs inside the leg: 1.1495–1.14965 (Fri 18) killed Tue 22 09–13;
  1.1473–1.1495 killed Tue; 1.1468–1.1473 killed Wed 23 05–09 → PENDING 1.1468.

**Our read at the time.** Weekly and daily briefs called 6E "aligned, weakest", the 4h
LB 1.1495 the trap, and every bear LB above `false` (pullback origin). The 22 Sep brief's
counter-trend short (Tuesday allowance) asked for **the run of 1.15385 x2**; the trap had
already happened on Monday at 1.1530–1.15315, 3 pips lower — requiring the structural
high when the build-up was run is pattern trading (b) by our own V8 rule.

**Verdict.** Two gaps, one layer: (1) no leg state, so mid-leg with-bias LBs read as
traps; (2) the counter-trend trigger took the structural high instead of the build-up
that was actually run. Rule candidate *MTF leg layer* above; (2) is already the V8 rule —
the counter-trend rows must apply the origin / build-up test the same way the with-bias
rows do.
