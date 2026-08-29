---
name: chris-analysis
description: ChrisFX breaker-block read of one symbol — find the graded A++/A+/A/B breakers on 5m/15m, draw the zone, FVG, invalidation and POC on the chart, screenshot, and write the entry/stop/target plan. Use when the user asks for a ChrisFX or breaker-block read of an instrument.
---

# ChrisFX Breaker Block Workflow

Full methodology: `docs/CHRISFX.md`. This is a **ChrisFX-only** analysis — do
not mix in CLS, EMAs, RSI, or any other framework. The grade is the headline:
everything else in the report explains or executes it.

## Step 1: Get the data

1. Run the scan (CLI, preferred — one call covers both timeframes):
   `node src/cli/index.js chris scan <SYMBOL>`
   (Windows bash: `/c/nvm4w/nodejs/node.exe src/cli/index.js chris scan <SYMBOL>`)
2. If TradingView is not running (exit code 2), launch it first:
   `scripts/launch_tv_debug.bat`, then retry.
3. Add `--tf 5 --tf 15` to override the timeframes, `--compact` for a
   report-ready payload.

The scan returns, per timeframe: every valid breaker block with its grade, the
liquidity level that was grabbed and how, the breaker zone, the overlapping
FVG, the point of invalidation, all three stop variants, and the liquidity map.

## Step 2: Interpret (per docs/CHRISFX.md)

Read the grade first, then justify it from the fields:

- **A++** — `characteristic_1: body_close_beyond`, `characteristic_2: true`,
  no modifiers. Maximum manipulation: the grab looked like a clean BOS and the
  breaker candle topped (or bottomed) the whole leg.
- **A+** — body grab, but either the breaker was not the leg extreme, or a
  modifier fired (`non_impulsive_grab`, `delayed_reversal`).
- **A** — `wick_only` grab of a level that had just formed (`freshness: fresh`).
- **B** — `wick_only` grab of a level that had been sitting there
  (`freshness: aged`).

Status tells you whether it is still tradable: `PENDING` (never retested — the
one you want), `ACTIVE` (price inside the zone right now), `TESTED` (already
reacted from), `INVALIDATED` (point of invalidation broken — ignore it).

Never present a setup that failed the FVG gate; the scanner has already dropped
those. If nothing comes back, say "no valid breaker" and name the nearest
untaken level whose grab would create one.

## Step 3: POC refinement (optional, approximate)

If `entries.poc` is null the footprint step was not applied — say so, and quote
the zone edge as the entry.

To apply it: add `scripts/chrisfx_poc.pine` to the chart (`pine_new` →
`pine_set_source` → `pine_smart_compile`, or add the saved "ChrisFX POC" study
via `chart_manage_indicator`), then re-run the scan. State plainly in the
report that the POC is a **lower-timeframe volume approximation, not exchange
bid/ask footprint**.

## Step 4: Draw the setup on the chart

Set the chart first: `chart_set_symbol`, `chart_set_timeframe` (the TF the
setup was found on).

Draw with `draw_shape`:
1. **Breaker zone** — `rectangle` from `breaker.zone_high` to
   `breaker.zone_low`, from the breaker candle's time extended ~40 bars right
   (label "<grade> breaker").
2. **FVG** — `rectangle` over `fvg.low`–`fvg.high` (label "FVG").
3. **Liquidity level** — `horizontal_line` at `liquidity.level`
   (label "liq grabbed").
4. **Invalidation** — `horizontal_line` at `invalidation` (label "INV").
5. **Entry** — `horizontal_line` at `entries.poc ?? entries.zone_edge`.

Then `capture_screenshot` (region "chart"). Leave the drawings for the session;
only `draw_clear` if the user asks.

## Step 5: Report

Compact block, ChrisFX terms only:

```
**SYMBOL @ price** — <GRADE> <long/short> on <TF> · <status>
- Grab: <body/wick> of <level> · <impulsive?> · reversal in <n> bars · level was <fresh/aged>
- Why <grade>: <char 1> + <char 2> <+ modifiers>
- Zone: <low>–<high> · FVG overlap <x%>
- Entry: <price> (<poc|zone edge>) · Stops: POC <x> / zone <y> / invalidation <z>
- Targets: <2R> / <3R> / opposing liquidity <price>  [our addition — not in the source]
- Risk: $<n> on the author's 50k prop scale
- Liquidity: ↑ <nearest untaken highs> ↓ <nearest untaken lows>
```

Then two short paragraphs:

- **Primary** — the trade: what has to happen for the entry to trigger (price
  retraces into the zone; the author does not require a confirmation candle),
  which stop variant you would take and why, and what invalidates it.
- **Caveats** — always name the ones that apply: the source defines **no
  targets** (ours), **no HTF bias filter**, and POC is approximate when used.

If several grades are present, lead with the highest and mention the rest in
one line. If everything is `INVALIDATED`, say so rather than presenting a dead
setup as live.
