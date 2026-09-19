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
blocks" indicator visible. Take it **in bar replay, parked one bar after the trade closed**
(trader's request 2026-09-18): later trades on the same chart never make it into the image,
the closed trade is always the last thing on the right, and "Liq blocks" is recomputed as of
that moment — the zones look as they did when the trade was taken, not with hindsight.

1. `chart_set_symbol` → `chart_set_timeframe("5")` (symbol resets the TF).
2. `replay_start(date = <open of the bar that contains the exit> + 2 × TF)`, ISO **with time**
   — e.g. exit 19:33Z on 5m → exit bar 19:30 → `date: "2026-09-16T19:40:00Z"`. The playhead
   lands one second before the requested moment, so the last bar on the chart is the one
   *after* the exit bar. Equivalent: `replay_start(+1 × TF)` then one `replay_step`.
   `replay_step`'s own reply still shows the old date — read the real one with
   `replay_status`. Replay loads its own history; no `ui_scroll` dance is needed.
3. `chart_set_visible_range(from = <window start>, to = <anything ≥ playhead>)` — in replay
   `to` is clamped to the playhead, so the exit bar + 1 sits at the right edge.
4. `ui_keyboard(key="s", modifiers=["ctrl","alt"])`. TradingView's own snapshot keeps both
   axes and the symbol/TF header; `capture_screenshot` crops the axes (`chart`) or keeps the
   UI chrome (`full`). The PNG lands in the trader's Downloads as
   `<SYM>_<date>_<time>_<hash>.png` — take the newest and move it out.
5. For the 1h context: `chart_set_timeframe("60")` **while still in replay** — the playhead
   stays put and the last 1h bar is the partial hour as of that moment. Set the range to the
   last ~10 days, snapshot again.
6. `replay_stop` — always, even if a step failed. Replay mode is `AllCharts`: it freezes every
   pane of the layout until stopped.

Known cosmetics: a translucent "Replay" watermark sits in the middle of the image; it is drawn
on the canvas and stays. Verified on MNQ 5m and 60, 2026-09-18.

Without replay (a trade still open, or replay unavailable for the symbol/TF): load history
first (`ui_scroll(direction="left", amount=4000)` a few times on 5m — the chart holds ~300
bars and `chart_set_visible_range` silently snaps back when the history is not loaded), then
set the range and snapshot as above.

Two images per trade is the norm: the entry TF (5m, ~20 h before the exit ≈ 240 bars — the
previous session's H4 gate candle and the origin levels must be in the frame) and the 1h context
(~10 days ≈ 240 bars; replay clamps to its loaded history). Trader feedback 2026-09-22: the earlier
~10 h / ~5 day windows were "not enough context" — never narrower than this. Read the stop and target from the trader's position tool:
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

- Never leave replay running after the snapshot — the layout stays frozen on the replay date
  for every pane; `replay_stop` is part of Step 1, not an afterthought.
- Never put this analysis into `trade_add_explanation` — that channel is the **trader's own
  words**, and the retrospective clusters it for rationalization patterns; agent analysis
  there poisons the clustering.
- Never skip Step 2's wait and "verify" a context the extraction hasn't drafted — the call
  refuses, and retrying with invented content defeats the draft-then-correct design.
- Never leave a screenshot attached but unverified: unverified context never reaches the
  coach, and the trade stays short of terminal enrichment.
