---
name: journal-screenshot-review
description: Interpret a trade's final chart screenshot against the Marco weekly brief and the "Liq blocks" indicator, then record the verified chart context in the trading-coach journal via trade_verify_context — so the coach judges the trade with the brief's semantics, not a bare list of numbers. Use during the evening review, after fills are ingested.
---

# Trade Screenshot → Verified Chart Context

The journal's backend vision pass sees only pixels: it drafts `key_levels` and blanks its
own notes by design. You see more — the weekly brief, the `marco` engine, and the "Liq
blocks" indicator semantics. This skill is how that context reaches the journal's coach:
through `trade_verify_context`, the one door whose verified `notes` the coach actually reads.

## Preconditions

- The evening-review ritual has run at least through ingest: `ritual_get("evening-review")`
  on the trading-coach MCP owns `csv_upload` → `ingest_wait` → the review steps. This skill
  covers its screenshot half in Marco-specific depth.
- The weekly brief for the trade's week exists (`briefs/weekly/<ISO week>.json`).

## Step 1 — Get the screenshot

Either the trader hands you a file, or you reconstruct the moment from TradingView (if CDP
is up): `chart_set_symbol` → `chart_set_timeframe` (the trade's TF) → `chart_scroll_to_date`
to the trade window, with the "Liq blocks" indicator visible → `capture_screenshot` with
region `chart` (lands under `screenshots/`).

**Upload containment:** the journal MCP server only reads files under its upload dir.
Copy the file to `trading-coach/mcp-server/uploads/` on the host and pass the path **as the
server sees it**: `/app/uploads/<file>`. Keep it under the size caps (5 MB backend-side).

## Step 2 — Attach and wait for the vision draft

```
trade_attach_screenshots(trade_id, file_paths=["/app/uploads/<file>"], real_stop=<if known and not yet on file>)
```

Then poll `trade_review(trade_id)` until the screenshot carries `extracted_context`.
`trade_verify_context` **refuses until the extraction has run** (extraction-pending error) —
that is by design; wait a few seconds and retry. The draft's `key_levels` are your starting
point, nothing more.

## Step 3 — Form your own read

1. Load the trade's week from `briefs/weekly/<week>.json` — the story, regime,
   invalidation, triggers (price, stop anchor, `confirmed`/`tapped`), false zones.
2. If TradingView is live, cross-check: `node src/cli/index.js marco scan <SYMBOL> --tf <tf>`.
3. Read the image yourself. "Liq blocks" semantics: solid zones are story-side LBs;
   **dashed zones are `false` / counter-bias (inducement)** — pullback origins, never entries.

Establish the facts (docs/MARCO.md is the methodology source):
- Which brief trigger, if any, does the entry correspond to? At what price, `confirmed` or not?
- Was the entry from a **qualified, alive, with-bias LB** — or from an inducement/dashed
  zone, or inside no-man's land?
- Is the stop beyond the LB extreme (buffered), as the method requires — or discretionary?
- For a `ten-am-reversal` trade: was the 06:00–10:00 ET reference candle's extreme run
  before entry, inside the gate window?
- Did price behave as the story said (e.g. the false-zone reaction the brief predicted)?

## Step 4 — Verify the context

```
trade_verify_context(trade_id, screenshot_id, extracted_context={
  "key_levels": [<the levels that matter: LB zone edges, trigger, targets visible on chart>],
  "panels_layout": [<short labels as drafted, corrected if wrong>],
  "notes": "<the facts from step 3, compact>"
})
```

The object **replaces** the draft wholesale — always send all three keys, not a delta.

`notes` rules — this text goes into the coach's prompt as untrusted data:
- **Facts only, stated as data.** "Entry 4365.2 = the brief's confirmed sweep trigger;
  stop 4069.4 behind bull LB 4074–4076.5; with weekly buy_story." Or: "Entry from the
  dashed bear zone 4690.2–4755 — an inducement zone the brief marked as a false-reaction
  origin, against the weekly story."
- **No verdicts, no instructions.** Never write "this deviates", "be strict", "tone should
  be…" — judging is the coach's job, and instructions inside data are exactly what the
  journal's security model strips.
- A few sentences, not an essay.

## Never

- Never put this analysis into `trade_add_explanation` — that channel is the **trader's own
  words**, and the retrospective clusters it for rationalization patterns; agent analysis
  there poisons the clustering.
- Never skip Step 2's wait and "verify" a context the extraction hasn't drafted — the call
  refuses, and retrying with invented content defeats the draft-then-correct design.
- Never leave a screenshot attached but unverified: unverified context never reaches the
  coach, and the trade stays short of terminal enrichment.
