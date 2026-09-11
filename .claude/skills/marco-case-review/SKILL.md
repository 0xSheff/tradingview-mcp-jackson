---
name: marco-case-review
description: Review a Marco / Inter Equity case (a Discord or Instagram post, or the user's own chart markup) against docs/MARCO.md — decode it, reproduce it with the engine on the same bars, log it in docs/MARCO-CASES.md, and turn any disagreement into a tagged rule candidate. Use whenever the user pastes an IE post or asks "did I mark this right?".
---

# Marco case review

The user studies Marco Accettone's liquidity-block method and collects cases from the
Inter Equity Discord and Instagram, plus their own markups. Each case is evidence for
or against a rule in `docs/MARCO.md`. The output of this skill is a case entry in
`docs/MARCO-CASES.md` and, when warranted, a rule candidate — never a silent change
to the rulebook or the engine.

## Before the first case of a session

1. Read `AGENTS.md`, then `docs/MARCO.md` in full — the section numbers, the
   `[SOURCE]` / `[CALIBRATION]` tags and the §6 parameter table are the vocabulary.
2. Read `docs/MARCO-CASES.md` — *Principles*, *Approved changes*, *Rule candidates*
   and *Engine gaps* say what has already been settled, so it is not re-argued.
3. Check the latest weekly brief for the instrument: `briefs/weekly/<ISO week>.md`
   (gitignored; regenerate with `marco weekly` if missing and TradingView is up).
4. For a case about the current day, run the morning brief first —
   `node src/cli/index.js marco daily --compact` — and compare the user's markup
   with its H4 grid and scenarios in `briefs/daily/<date>.md`. A contract roll is
   detected against the previous run's basis; the first run after a roll with no
   stored basis takes `--shift SYMBOL=offset` (the constant bar-to-bar difference).

## Per case

1. **Facts first.** Instrument (map FX spot to the CME contract in `watchlists.json`:
   GBPUSD → 6B, EURUSD → 6E), timeframes shown, post time in ET *and* Athens (Discord
   shows the user's local time, Athens = UTC+3 summer / UTC+2 winter), every line and
   box with its price, and which lines *end* at a sweep (consumed) versus *extend
   forward* (intact). Do not read numbers off pixels finer than the chart allows —
   on a 2000-px screenshot one pip is ~20 px; anything within 1–2 pips is a tie.
2. **Decode the text** in the method's own terms: which §-rule it illustrates, what
   the author calls enticing/false/noise, and which timeframe carries the story.
3. **Reproduce with the engine on the same bars.**
   - `node src/cli/index.js marco scan <SYMBOL> --tf 240 --tf 60` (add `--tf 15`,
     `--tf 5` for LTF posts; no `--compact` when the build-up records are needed).
   - Raw bars when a swing or tap count is in doubt: set the chart to the symbol and
     timeframe (`chart_set_symbol` / `chart_set_timeframe`), then
     `node src/cli/index.js ohlcv -n 300 > <scratchpad>/<sym>_<tf>.json` and compute
     strict pivots (`pivot_len` 3: strictly beyond on the left, beyond-or-equal on the
     right), ATR14, `eq_tolerance` (0.25 ATR) and `respect_tolerance` (0.75 ATR) by
     hand. Print the bars in ET with volume — Sunday-night bars are thin and the user
     asks about them.
   - **Restore the chart afterwards** (the user works on it): note the symbol and
     timeframe from `chart_get_state` before changing anything and put them back.
4. **Compare the author's hand with the engine.** Agreement → the case confirms a
   rule; cite the § and tag. Disagreement → decide which side the *sources* support,
   not which is more convenient: a moderator's chart (Elijah etc.) is evidence about
   practice, only Marco's words are `[SOURCE]`. Known engine gaps (shelves of
   near-equal lows, non-pivot HTF bar extremes) are listed in the cases file — add the
   example to the table instead of re-describing the gap.
5. **Outcome.** If the post is hours or days old, pull what price did afterwards
   (5m/30m buckets are enough) and say whether the author's read played out.
6. **Log it** in `docs/MARCO-CASES.md` under *Cases* with the next id (`D#`, `IG#`,
   `U#`): date/time, instrument, pictures, engine read, outcome, verdict, candidates.
   Numbers, not adjectives. Corrections the user makes to *your* read are logged too
   (marked as such) — they are the most valuable lines in the file.
7. **Rule changes go through the front door.** A new principle → *Principles*. A
   change the user asked for → *Approved changes (not built yet)*. Your own proposal →
   *Rule candidates* with `[CALIBRATION]` and the parameters it reuses. `docs/MARCO.md`
   and `src/core/marco.js` / the Pine script change only when the user says build it,
   and then both implementations together (§7).

## Reading discipline (what the cases keep teaching)

- The read is nested: W/D sets direction; H4 is the grid (nearest untaken liquidity
  each side, tap counts, alive LB zones); H1 scenarios live inside the grid and never
  leave it. Price leaving the grid is an H4 event, not an H1 scenario.
- We wait for a **run** of a level, not a touch. Respect / run + reclaim / run without
  reclaim are the three outcomes; the LB is what a run leaves.
- Tap counts outrank distance. A shelf of near-equal HTF lows is a build-up even when
  no bar is a strict swing.
- A counter-bias LB is a pullback origin, not a magnet; a swept level is nothing. Never
  quote an LB zone bottom as liquidity.
- A bias-side LB sitting within `respect_tolerance` above an intact build-up is inside
  the pocket: its tap is inducement, the run of the build-up is the entry (candidate
  rule; the `eq_tolerance` tier is already in the engine).
- Box edges: sweep extreme ↔ swept level; full-height traversal = dead. No bodies,
  no wicks.

## Rendering answers to the user

Ukrainian, compact. Per instrument: global reminder (bias, big targets, invalidation)
→ H4 grid → "what we wait for" → scenarios A/B/C/D with ready answers (grid breaks
are "grid redraws", not scenarios) → 1h conditions per scenario → timing (NY session,
the 10 a.m. gate). Tables for bar-level evidence; every number we chose stays
`[CALIBRATION]`.
