---
name: journal-weekly-plan
description: Turn the Marco weekly brief into a locked weekly plan in the trading-coach journal — one setup per with-bias instrument, brief context carried into each setup so the coach can judge execution against it. Use at the start of the trading week, after `marco weekly` has run.
---

# Weekly Brief → Journal Weekly Plan

You are carrying the Marco weekly bias brief into the trading-coach journal as the week's
locked plan. The brief is the analysis; the journal plan is the commitment the coach will
judge every trade against. The whole point of this skill is that the brief's context
(story, regime, invalidation, trigger quality, false zones) must **arrive inside the plan**,
because the journal's coach cannot read this repo's files.

## Preconditions

- The trading-coach stack is up (`trading-coach` MCP server on `http://localhost:8080/mcp`,
  registered in this repo's `.mcp.json`). If tools fail with "backend unreachable", the
  journal's docker compose `full` profile is not running.
- A fresh weekly brief exists. If not, generate it (TradingView must be running with CDP):
  `node src/cli/index.js marco weekly --compact` — writes `briefs/weekly/<ISO week>.md` + `.json`.

## Step 1 — Read the brief (the JSON, not the md)

Read `briefs/weekly/<ISO week>.json`. Per symbol it carries: `bias` (`bias_word`, `regime`,
`weekly`/`daily` story reads, `targets`, `primary_target`, `invalidation`, `note`),
`triggers` per timeframe (each with `kind`, `side`, `trigger`, `stop_anchor`, `stop`,
`target`, `rr`, `confirmed`, `tapped`, `note`), and the false-reaction zones.

## Step 2 — Follow the journal's own ritual

Call `ritual_get("morning-plan")` on the trading-coach MCP and follow it. It owns the plan
lifecycle: `context_get_active` → the existing-plan check → `plan_start` → setups → the
trader's explicit go → `plan_lock`, plus the known potholes (e.g. a weekly draft being
invisible to `plan_get_active` after Monday). Do not re-derive that sequence here; this
skill only adds the brief→setup mapping below.

The target strategy is **Marco Liquidity Blocks**. Only plan for it if its context shows an
active (or upcoming) sprint.

## Step 3 — Map brief entries to setups

**Which symbols become setups:**
- Only symbols with a directional verdict (`bias_word` long/short) and regime `aligned` or
  `pullback`. A `no_bias` symbol gets **no setup** — no-man's land is not planned.
- Inducement / false-reaction zones **never** become setups. They travel only as a caveat
  in the notes (they forecast the false pullback reaction, they are not entries).
- Only instruments in the sprint's `focus_instruments`.

**Symbol mapping:** journal instrument = the brief symbol minus exchange prefix and
contract suffix: `CME_MINI:MNQ1!` → `MNQ`, `COMEX_MINI:MGC1!` → `MGC`, `CME:6E1!` → `6E`.

**One setup per instrument + direction** (the ritual's own rule: several levels in one
direction on one instrument are one setup with several `key_levels`, not one setup per
trigger). Propose the mapping to the trader; do not silently pick a subset of triggers.

**Field mapping:**
- `direction` — the brief's `bias_word`.
- `key_levels` — the trigger prices the trader agrees to act on (sweep triggers, tap-zone
  inner edges). Check the entry-side invariant before writing: at least one key level
  strictly on the entry side of T1 (long → below T1, short → above T1).
- `targets` — the brief's targets, nearest first, at most 3, `primary_target` included.
- `setup_type` — `tap` trigger → `lb-zone-tap`; `sweep` trigger → `sweep-trigger`. When
  one setup carries both kinds, ask the trader which model names the thesis.
  `ten-am-reversal` is an intraday timing model — it never comes from the weekly brief;
  intraday additions during the week go through `plan_add_addendum`, not a second plan.
- `planned_size` — **ask the trader**. Never take it from the brief; it is not there.
- `planned_r` — from the chosen trigger's `rr` only if the trader confirms it.

**`setup_description` — the brief context, rendered deterministically.** This is the one
field the coach reads that the structured fields cannot carry. One compact template, same
order every time; do not restate instrument, direction, key levels, targets or size:

```
brief <ISO week>: weekly=<mode>, daily=<mode>, regime=<regime> — <one-line verdict note>;
invalidation: <rule> <level>. Trigger(s): <kind> <price> (<confirmed xN|unconfirmed><, tapped>),
stop <stop> behind LB <bot>–<top>, RR <rr>. False zones (pullback origins, never entries):
<zone>; <zone>. <thin-zone / refine-on-lower-TF note if the brief carries one>
```

Example (from 2026-W36 MNQ):

```
brief 2026-W36: weekly=buy_story, daily=sell_story, regime=pullback — daily bearish trap
against a live weekly buy story is inducement, the weekly leads; invalidation: weekly close
below 27200. Trigger: sweep below 28313 (unconfirmed), stop 27182.89 behind LB 27200–27409,
RR 2.47. False zones (pullback origins, never entries): 29655.75–29707.25; 30076.75–30339.75 Q.
```

## Step 4 — Summary, go, lock

Per the ritual: table every setup, get the trader's explicit go, then `plan_lock`. The
lock is irreversible for the period; mid-week changes are addenda.

## Never

- Never invent a required field the brief does not carry (`planned_size` above all) — ask.
- Never author a setup from an inducement zone, a `false` (dashed) zone, or a no-bias symbol.
- Never paste the whole brief into `setup_description` — the template line is the cap;
  the coach's prompt budget is shared with everything else it reads.
