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

- The trading-coach stack is up. The endpoint lives in this repo's `.mcp.json` — as of
  2026-09-09 it is the Tailscale host `http://vadym-mach-wx9.taild8603c.ts.net:8080/mcp`,
  not localhost; read `.mcp.json` rather than assuming. If tools fail with "backend
  unreachable", the journal's docker compose `full` profile is not running; if they fail
  with "Unable to connect", check the host is online first (`tailscale status`) — it has
  flapped mid-session before.
- A fresh weekly brief exists. If not, generate it (TradingView must be running with CDP):
  `node src/cli/index.js marco weekly --compact` — writes `briefs/weekly/<ISO week>.md` + `.json`.

## Step 1 — Read the brief (the JSON, not the md)

Read `briefs/weekly/<ISO week>.json`. Per symbol it carries **two layers**:

- `bias` — the **global** layer (weekly → daily): `bias_word`, `regime`, `stale`,
  `weekly`/`daily` story reads, `targets` (the big draws, annotated `atr_weeks` — usually
  beyond one week), `primary_target`, `invalidation`, `note`.
- `intraweek` — the **week's** layer: `phase` (`aligned` | `pullback` | `no_local_story`),
  `local_regime`, `local_read`, `targets` (up to three **clusters** of reachable D/4h
  liquidity: `price` = near edge, `far`, `touches`, `atr_weeks`), `ladder` (the full cluster
  list), `primary_target`, `counter_trend` (up to two triggers against the bias on 60m) and
  `counter_trend_note`.
- `triggers` per timeframe (240, 60), with the bias: `kind`, `side`, `trigger`, `stop_anchor`,
  `stop`, `target`, `rr`, `targets` (the rungs from the first beyond the entry to the one that
  clears the min RR), `confirmed`, `tapped`, `note` (thin zone, "target moved to", "refine the
  stop on a lower-TF LB").
- `false_reactions` per timeframe — counter-bias zones (pullback origins).

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
  `pullback`. A `no_bias` symbol gets **no setup** — no-man's land is not planned. A
  `stale` bias (`weekly_only` / `daily_only` off an old trap) gets no setup unless the trader
  asks for it.
- Inducement / false-reaction zones **never** become with-bias setups. They travel as a caveat
  in the notes (they forecast the false pullback reaction). The only way a counter-bias zone
  enters the plan is an **early-week counter-trend** setup (below), and only from the brief's
  `intraweek.counter_trend` list.
- Only instruments in the sprint's `focus_instruments`.

**Symbol mapping:** journal instrument = the brief symbol minus exchange prefix and
contract suffix: `CME_MINI:MNQ1!` → `MNQ`, `COMEX_MINI:MGC1!` → `MGC`, `CME:6E1!` → `6E`.

**One setup per instrument + direction** (the ritual's own rule: several levels in one
direction on one instrument are one setup with several `key_levels`, not one setup per
trigger). Propose the mapping to the trader; do not silently pick a subset of triggers.

**Field mapping (with-bias setups):**
- `direction` — the brief's `bias_word`.
- `key_levels` — the trigger prices the trader agrees to act on (sweep triggers, tap-zone
  inner edges), nearest first; the trader may add lower-TF pocket levels he reads himself
  (W37: MNQ 29484.75 / 29453 ahead of the 1h zone). Check the entry-side invariant before
  writing: at least one key level strictly on the entry side of T1 (long → below T1, short →
  above T1).
- `targets` — the **intraweek** clusters' near edges (`intraweek.targets[].price`), nearest
  first, at most 3. The global `bias.targets` never go into `targets` — they are the final
  draw for trailing and belong in the description ("global 5752.3 ≈5.2w = final draw only").
  When the trader's chosen trigger carries a stepped ladder (`targets.length > 1`), say so in
  the description; the plan's T1 stays the nearest cluster.
- `setup_type` — `tap` trigger → `lb-zone-tap`; `sweep` trigger → `sweep-trigger`. When
  one setup carries both kinds, ask the trader which model names the thesis.
  `ten-am-reversal` is an intraday timing model — it never comes from the weekly brief;
  intraday additions during the week go through `plan_add_addendum`, not a second plan.
- `planned_size` — **ask the trader**. Never take it from the brief; it is not there.
- `planned_r` — from the chosen trigger's `rr` only if the trader confirms it.

**Early-week counter-trend setups** (`intraweek.counter_trend`, strategy rev 2):
- Propose them separately and only with the trader's explicit go; he deletes freely.
- `direction` = against `bias_word`; `setup_type` = `early-week-counter-trend`;
  `key_levels` = the trigger (prefer the **run of the pocket's far edge** with a reclaim over
  a tap of the inner zone — a tap that does not take the far edge is inducement into the
  pocket); `targets` = the nearest with-bias liquidity only (usually the with-bias entry
  zone). Description states: Mon–Tue intraday only, nearest target only, flat before the
  with-bias zone, never held against the global bias, occupies a concurrent slot.
- Skip it when the brief's own draw says the counter-bias zone holds intact build-up (the
  6E W37 case: shorting into x2 fuel above is shorting with the sellers).

**`setup_description` — a compact line list, never prose.** This is the one field the coach
reads that the structured fields cannot carry: the stop (no field exists for it), the entry
model per rung, the $ risk, the RR, the invalidation, the no-entry zones. Write it as short
scannable lines, one per rung, so the trader can place an order without reading a paragraph.
Do not restate instrument, direction, key levels, targets or size — `K1/K2/K3` are positional
indexes into `key_levels`, which is what keeps the levels out of the text.

```
<weekly mode>/<regime> · inval <level> <Wclose|Dclose>
K1 <tap|sweep+reclaim> · stop <price> · $<risk> · RR <n>
K2 <tap|sweep+reclaim> · stop <price> · $<risk> · RR <n>
skip <level> <model> — $<risk> > cap
no-entry <zone> · <zone>
global <levels> (≈<Nw>) = final draw only
<one short sentence of context>
```

Example (2026-W37 MGC; invalidation is 4016 per the brief — the 4036.5 that appeared in the
old prose example and in the W37 locked plan was wrong):

```
buy_story/aligned · inval 4016 Wclose
K1 tap · stop 4409.1 · $537 > cap — refine on 15m
K2 tap · stop 4325.1 · $400 — refine on 15m
no-entry 4521.5–4543.7 Q · 4672.4–4680.6 · 4690–4697.7
global 5007.8 (≈2.1w) · 5752.3 (≈5.2w) = final draw only
Week targets ≈0.3w / 0.9w; weekly and daily agree, every move against the bias is false.
```

Rules that make the list work:

- **The entry model goes on every rung line.** `tap` means a resting limit into the zone,
  stop beyond the zone extreme; `sweep+reclaim` means wait for the run of the level *and* the
  reclaim, stop beyond the run extreme. Never let the two blur — on 2026-09-09 a 6E setup was
  typed `sweep-trigger` but carried a tap-style stop 2.7 ticks under the low, and the
  resulting R figure was a fiction that only a limit order would have earned.
- **Put the primary rung's RR in `planned_r`**, not only in the text — it is a real field.
- **One closing sentence of context**, and only one: why this bias, what changed. Deeper
  reasoning belongs in the chat with the trader, not in the journal.

## Step 4 — Summary, go, lock

Per the ritual: table every setup, get the trader's explicit go, then `plan_lock`. The
lock is irreversible for the period; mid-week changes are addenda.

## Potholes

- The trader edits the draft in the web UI (:5173) while you work: a setup that is "gone"
  was most likely deleted by him — re-read with `plan_get`, report the difference, ask; never
  diagnose a server bug or re-add it.
- There is no edit verb: a change is `plan_remove_setup` + `plan_add_setup`. Remove **one at
  a time** and re-read between calls.
- `early-week-counter-trend` is accepted by `plan_add_setup` even when the sprint's
  `acceptable_setups` lists only the three older types (W37); how the coach judges such a
  match is still to be seen.

## Never

- Never invent a required field the brief does not carry (`planned_size` above all) — ask.
- Never author a with-bias setup from an inducement zone, a `false` (dashed) zone, a stale
  bias, or a no-bias symbol.
- Never put the global targets into `targets` — they are the yardstick the week cannot meet
  (W36: 6E 1.21155 ≈535 pips from the entry).
- Never paste the whole brief into `setup_description`, and never revert to prose — the line
  list is the cap; the coach's prompt budget is shared with everything else it reads.
