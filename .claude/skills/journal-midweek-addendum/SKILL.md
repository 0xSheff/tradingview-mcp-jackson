---
name: journal-midweek-addendum
description: Mid-week re-read of a locked Marco plan — rescan the lower timeframes, decide which locked rungs are still alive, and write only what the lock does not already carry as a plan_add_addendum. Use when the trader asks whether the weekend setups still hold, or wants intraday options during a locked week.
---

# Mid-Week Re-Read → Addendum

The weekly plan is locked; it cannot be edited. Anything that changes mid-week arrives as an
addendum. The job of this skill is **not** to re-plan the week — it is to establish which of
the locked rungs survived, and to add only the rungs the lock does not already carry.

Use it when the trader asks "чи ще дійсні наші сетапи", or wants tighter intraday entries
during a locked week. The weekend plan itself is [[journal-weekly-plan]].

## Preconditions

- A locked plan covering today. `plan_get_active(strategy)` — **read `trading_day` and
  `period_end` before calling it today's plan**; it can be dated ahead.
- TradingView running with CDP (`tv_health_check`).
- Endpoint for the journal comes from `.mcp.json`, not from memory. If a write fails with
  "Unable to connect", check the host is up (`tailscale status`) before retrying — it has
  gone offline mid-session, and a check that passes can still be stale by the time the write
  lands. Save the payload to the scratchpad so a retry costs nothing.

## Step 1 — Establish the clock

Get the real time and derive both zones: the trader is Europe/Athens; the gates are ET.
`TZ=` is unreliable in this Git Bash, so compute the offset rather than trusting `TZ=... date`.

Three things depend on it:
- **Day of week.** `early-week-counter-trend` setups are Mon–Tue only. On Wednesday or later
  they are expired by rule, whether or not their trigger fired.
- **The 10am H4 gate** (06:00–10:00 ET reference candle, 10:00–14:00 ET entry window). While
  it reads `forming`, the `ten-am-reversal` model is unavailable — say so rather than
  guessing. Once `active`, it names which side is open and the systematic target.
- **Elapsed time since the last scan.** A scan more than ~30 min old is stale intraday; the
  levels move. Re-scan rather than reasoning from the earlier numbers.

## Step 2 — Rescan, lower timeframes first

```
node src/cli/index.js marco brief --compact --tf 3 --tf 5 --tf 15   # then --tf 60 separately
```

Write to the scratchpad and extract; the raw payload is 60–90 KB and does not belong in
context. Per symbol and timeframe read: `story`, `draw`, `triggers` (with `stop`, `rr`,
`confirmed`), `intact_above` / `intact_below` with touch counts, and the `h4` block.

Then pull the actual bars for anything you intend to claim happened —
`chart_set_symbol` → `chart_set_timeframe` → `data_get_ohlcv`. Do not infer a fill or a
sweep from `bars_ago`; read the high/low.

> `quote_get` ignores its `symbol` argument and returns the current chart symbol. Set the
> chart first. `batch_run` is broken (see [[multi-symbol-scan]]) — loop symbols manually.

## Step 3 — Classify every locked rung

For each `key_level` in the locked plan, assign exactly one verdict and say which:

- **Alive** — untouched, stop anchor still valid, still within the risk cap.
- **Dead** — the zone was traded through, or its replacement LB is flagged `inducement`.
  An inducement zone is never an entry, even when the engine prints a trigger on it.
- **Played out** — the trigger fired and the targets were taken. Report the move and whether
  it was traded (`trades_list`); a missing trade is the trader's decision — report it, ask,
  never call it a bug.
- **Expired** — `early-week-counter-trend` past Tuesday.

Then check the weekly bias and invalidation are still intact. If the weekly story flipped,
this is not an addendum — stop and tell the trader the lock's premise is gone.

## Step 4 — Add only what is new

The test for including a rung: **would the addendum say something the lock does not already
say?** If the only surviving rung is already in the locked `key_levels`, the symbol gets no
addendum entry — say so instead of duplicating it. (2026-09-09: MNQ was dropped for exactly
this reason once its 5m rung died.)

Per candidate rung, before proposing it:
- Compute the dollar risk at minimum size: `(entry − stop) × tick value`. MNQ $2/pt,
  MGC $10/pt, 6E $12.50 per 0.0001. Over the strategy's per-trade cap → the rung is
  **untakeable as anchored**: refine on a lower-TF LB or pass. Never resize the stop.
- Sanity-check the stop against the model, not just the number. A stop that sits a couple of
  ticks under the swept low is a `tap` stop; a `sweep+reclaim` stop goes beyond the run
  extreme with a buffer. Mismatching them produces an R figure that only a limit order could
  have earned — this is the 2026-09-09 6E error.

Ask the trader for `planned_size` — never infer it. Confirm the rung selection too when your
re-read drops or replaces anything he previously approved.

Check the invariant before writing: at least one `key_level` strictly on the entry side of
T1 (long → below, short → above).

## Step 5 — Write

`plan_add_addendum(plan_id, items=[...])`. `setup_description` uses the compact line-list
format from [[journal-weekly-plan]] — K-indexed rungs, entry model on every line, one closing
sentence of context. Put the primary rung's RR in `planned_r`.

Targets get re-set when the locked ones have been taken; say in the closing sentence that
this replaces a played-out ladder, so the retro can tell the two apart.

## Never

- Never enter or propose an inducement / dashed zone, however good the printed RR.
- Never short into a live weekly buy story (or vice versa) because a lower timeframe flipped
  — that is the pullback the bias predicts, and it is how the entry arrives.
- Never quote an R figure from an entry/stop pair the methodology would not have produced.
- Never rewrite the locked plan's setups to match the new read; the lock is the record of
  what was committed, and the retro needs the difference.
