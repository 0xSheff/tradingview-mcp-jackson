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

Either the trader hands you a file, or you take it from TradingView (CDP up) with the "Liq
blocks" indicator visible: `chart_set_symbol` → `chart_set_timeframe` (symbol resets the TF)
→ load history (`ui_scroll(direction="left", amount=4000)` a few times on 5m — the chart holds
~300 bars and `chart_set_visible_range` silently snaps back when the history is not loaded)
→ `chart_set_visible_range(from, to)` → `ui_keyboard(key="s", modifiers=["ctrl","alt"])`.
TradingView's own snapshot keeps both axes and the symbol/TF header; `capture_screenshot`
crops the axes (`chart`) or keeps the UI chrome (`full`). The PNG lands in the trader's
Downloads as `<SYM>_<date>_<time>_<hash>.png` — take the newest and move it out.

Two images per trade is the norm: the entry TF (5m, the window around entry → exit) and the
1h context (the week to date). Read the stop and target from the trader's position tool:
`draw_list` → `draw_get_properties(entity_id)` gives the entry anchor, `stopLevel` and
`profitLevel` in ticks (MNQ 0.25, MGC 0.1, 6E 0.00005).

## Step 2 — Upload, attach, wait for the vision draft

The bytes travel out of band (ADR-0047): mint a handle, PUT the file, hand the handle over.

```
upload_url_create(purpose="trade_screenshot", filename="<name>.png", content_type="image/png", size_bytes=<n>)
# curl -X PUT -H "Content-Type: image/png" --data-binary @<file> "<upload_url>"   → 204
trade_attach_screenshots(trade_id, upload_ids=[...], real_stop=<if known and not yet on file>)
```

The URL is single-use and expires in minutes — mint it when you are about to send.
Then poll `trade_review(trade_id)` until each screenshot carries `extracted_context`.
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
- **A bullet list of facts, never prose** (trader feedback 2026-09-12: the first W37 notes
  were paragraphs and unreadable). Fixed order, one line each, `·` between fields, drop what
  is empty:

  ```
  - <TF> · <dates> · axis Athens (UTC+3) · <W/D story = regime> · inval <level> intact
  - plan: <the rung this entry maps to, or the nearest one> · stop · targets · <plan wording that matters>
  - before entry: <the event — sweep / reclaim / tap — with time (Z) and level>
  - entry: <side price order-type time> · <where in the zone>
  - stop: <price> (<position tool | stop fill>) · <what it sits beyond> · <pts> · $<risk>
  - target: <price> (<source>)
  - after entry: <the highs/lows that matter, with times — T1 taken? stop threatened?>
  - exit: <type price time> · <fills: partial or not>
  - result: <pts · $ · R>
  ```

- **Facts only, stated as data.** No verdicts, no instructions — never "this deviates", "be
  strict", "tone should be…": judging is the coach's job, and instructions inside data are
  exactly what the journal's security model strips.
- Every number the review will need appears here once; adjectives do not.

## Never

- Never put this analysis into `trade_add_explanation` — that channel is the **trader's own
  words**, and the retrospective clusters it for rationalization patterns; agent analysis
  there poisons the clustering.
- Never skip Step 2's wait and "verify" a context the extraction hasn't drafted — the call
  refuses, and retrying with invented content defeats the draft-then-correct design.
- Never leave a screenshot attached but unverified: unverified context never reaches the
  coach, and the trade stays short of terminal enrichment.
