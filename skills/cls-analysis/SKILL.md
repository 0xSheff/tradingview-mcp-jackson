---
name: cls-analysis
description: Deep CLS (Candle Liquidity Sweep) breakdown of one symbol — W/D reads, draw the CLS range/levels on the chart, screenshot, and write Model 1 / Model 2 scenarios. Use after the CLS brief flags a symbol, or when the user asks for a CLS read of an instrument.
---

# CLS Deep-Dive Workflow

Full methodology: `docs/CLS.md`. This is a **CLS-only** analysis — do not mix
in FVG, fractals, EMAs or any other methodology. DXY is bias-only: translate
its read into a 6E (or other FX) plan.

## Step 1: Get the data

1. Run the scan for the symbol (CLI, preferred — one call returns both TFs):
   `node src/cli/index.js cls scan <SYMBOL>`
   (Windows bash: `/c/nvm4w/nodejs/node.exe src/cli/index.js cls scan <SYMBOL>`)
2. If TradingView is not running (exit code 2), launch it first:
   `scripts/launch_tv_debug.bat`, then retry.

The scan returns, per timeframe (W and D): the CLS candle range, the signal
classification, Model 1 levels / Model 2 zone when armed, a live (developing
candle) read, the consecutive-candle run, and the liquidity map.

## Step 2: Interpret (per docs/CLS.md)

- `M1_SHORT` / `M1_LONG` — sweep confirmed. Reversal toward 50% of the CLS
  range; invalidation at the sweep extreme.
- `ACCEPTANCE_UP` / `ACCEPTANCE_DOWN` — continuation. Model 2: wait for the
  pullback into the 61.8–80% reload zone; invalidation at the leg origin.
- `DOUBLE_SWEEP` / `INSIDE` — no signal. Say so; do not invent a setup.
- `live` fields describe the developing candle — label them "developing,
  not confirmed until close".
- Filters: 3+ same-direction daily closes → no fresh entries in that
  direction (wait for the pullback); W vs D conflict → reduced confidence.

## Step 3: Draw the setup on the chart

Set the chart first: `chart_set_symbol`, `chart_set_timeframe` (use the TF
with the active signal; default "D").

Draw with `draw_shape`:
1. **CLS range** — `rectangle` from the CLS candle high to low, spanning
   from the CLS candle's time to ~5 bars into the future.
2. **M1 target** — `horizontal_line` at the 50% level (label "M1 tgt 50%").
3. **M2 reload zone** — `rectangle` between `zone_from` and `zone_to`
   (label "M2 reload 61.8–80%") when Model 2 is armed.
4. **Invalidation** — `horizontal_line` at the invalidation price
   (label "INV").
5. Optional: `text` marker "sweep" at the sweep extreme.

Then `capture_screenshot` (region "chart"). Clean up your drawings with
`draw_clear` only if the user asks — otherwise leave them for the session.

## Step 4: Report

Compact block, CLS terms only:

```
**SYMBOL @ price**
- W: <signal> · <levels>
- D: <signal> · <levels>
- Liquidity: ↑ <nearest highs / EQH> ↓ <nearest lows / EQL>
- Filter: <consecutive run / W-D conflict / none>
- CLS bias: <LONG/SHORT/NO TRADE> — plan: <model, entry zone, inv, target>
```

Then two scenario paragraphs:
- **Primary** — the armed model: entry condition (never the first touch of
  a level; wait for the sweep and displacement on H4/H1), invalidation,
  target, and what confirms it.
- **Alternate** — what flips the read (e.g. developing candle closes
  outside the range → acceptance instead of sweep).

If no model is armed on either TF: state "no CLS setup — range building"
and name the level whose sweep would arm one.
