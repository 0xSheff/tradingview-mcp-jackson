# TradingView MCP — Claude Instructions

68 tools for reading and controlling a live TradingView Desktop chart via CDP (port 9222).

## Decision Tree — Which Tool When

### "What's on my chart right now?"
1. `chart_get_state` → symbol, timeframe, chart type, list of all indicators with entity IDs
2. `data_get_study_values` → current numeric values from all visible indicators (RSI, MACD, BBands, EMAs, etc.)
3. `quote_get` → real-time price, OHLC, volume for current symbol

### "What levels/lines/labels are showing?"
Custom Pine indicators draw with `line.new()`, `label.new()`, `table.new()`, `box.new()`. These are invisible to normal data tools. Use:

1. `data_get_pine_lines` → horizontal price levels drawn by indicators (deduplicated, sorted high→low)
2. `data_get_pine_labels` → text annotations with prices (e.g., "PDH 24550", "Bias Long ✓")
3. `data_get_pine_tables` → table data formatted as rows (e.g., session stats, analytics dashboards)
4. `data_get_pine_boxes` → price zones / ranges as {high, low} pairs

Use `study_filter` parameter to target a specific indicator by name substring (e.g., `study_filter: "Profiler"`).

### "Give me price data"
- `data_get_ohlcv` with `summary: true` → compact stats (high, low, range, change%, avg volume, last 5 bars)
- `data_get_ohlcv` without summary → all bars (use `count` to limit, default 100)
- `quote_get` → single latest price snapshot

### "Analyze my chart" (full report workflow)
1. `quote_get` → current price
2. `data_get_study_values` → all indicator readings
3. `data_get_pine_lines` → key price levels from custom indicators
4. `data_get_pine_labels` → labeled levels with context (e.g., "Settlement", "ASN O/U")
5. `data_get_pine_tables` → session stats, analytics tables
6. `data_get_ohlcv` with `summary: true` → price action summary
7. `capture_screenshot` → visual confirmation

### "Change the chart"
- `chart_set_symbol` → switch ticker (e.g., "AAPL", "ES1!", "NYMEX:CL1!")
- `chart_set_timeframe` → switch resolution (e.g., "1", "5", "15", "60", "D", "W")
- `chart_set_type` → switch chart style (Candles, HeikinAshi, Line, Area, Renko, etc.)
- `chart_manage_indicator` → add or remove studies (use full name: "Relative Strength Index", not "RSI")
- `chart_scroll_to_date` → jump to a date (ISO format: "2025-01-15")
- `chart_set_visible_range` → zoom to exact date range (unix timestamps)

### "Work on Pine Script"
1. `pine_set_source` → inject code into editor
2. `pine_smart_compile` → compile with auto-detection + error check
3. `pine_get_errors` → read compilation errors
4. `pine_get_console` → read log.info() output
5. `pine_get_source` → read current code back (WARNING: can be very large for complex scripts)
6. `pine_save` → save to TradingView cloud
7. `pine_new` → create blank indicator/strategy/library
8. `pine_open` → load a saved script by name

### "Practice trading with replay"
1. `replay_start` with `date: "2025-03-01"` → enter replay mode
2. `replay_step` → advance one bar
3. `replay_autoplay` → auto-advance (set speed with `speed` param in ms)
4. `replay_trade` with `action: "buy"/"sell"/"close"` → execute trades
5. `replay_status` → check position, P&L, current date
6. `replay_stop` → return to realtime

### "Screen multiple symbols"
- `batch_run` with `symbols: ["ES1!", "NQ1!", "YM1!"]` and `action: "screenshot"` or `"get_ohlcv"`

### "Draw on the chart"
- `draw_shape` → horizontal_line, trend_line, rectangle, text (pass point + optional point2)
- `draw_list` → see what's drawn
- `draw_remove_one` → remove by ID
- `draw_clear` → remove all

### "Manage alerts"
- `alert_create` → set price alert (condition: "crossing", "greater_than", "less_than")
- `alert_list` → view active alerts
- `alert_delete` → remove alerts

### "Navigate the UI"
- `ui_open_panel` → open/close pine-editor, strategy-tester, watchlist, alerts, trading
- `ui_click` → click buttons by aria-label, text, or data-name
- `layout_switch` → load a saved layout by name
- `ui_fullscreen` → toggle fullscreen
- `capture_screenshot` → take a screenshot (regions: "full", "chart", "strategy_tester")

### "TradingView isn't running"
- `tv_launch` → auto-detect and launch TradingView with CDP on Mac/Win/Linux
- `tv_health_check` → verify connection is working

## Environment Notes

This project runs on Linux (Ubuntu). It previously ran on Windows only; the Windows
notes are kept at the end of this section for reference.

- **Node.js:** installed via nvm — `node` / `npm` / `npx` work directly in the agent
  shell. The absolute path is `/home/vadym/.nvm/versions/node/v22.22.2/bin/node`; use it
  in MCP configs and anywhere the process may not inherit the nvm shell setup.
- **TradingView Desktop:** `/opt/TradingView/tradingview` (deb install, also on PATH as
  `/usr/bin/tradingview`).

### Launching TradingView (CDP)

The MCP server and CLI talk to TradingView Desktop over Chrome DevTools Protocol on
`localhost:9222`. If TradingView is not running, **all scan/data tools fail** with
"CDP connection failed."

**Before any chart-reading workflow (morning brief, batch scan), check CDP
and launch if needed:**

```bash
# 1. Check if CDP is up
curl -s http://localhost:9222/json/version

# 2. If not running, launch (the script blocks until CDP is ready)
scripts/launch_tv_debug_linux.sh

# 3. Verify
curl -s http://localhost:9222/json/version
```

`tv_launch` (MCP) and `node src/cli/index.js launch` do the same thing in-process.

#### Never launch TradingView with a plain `tradingview --remote-debugging-port=9222`

Launching it directly from an agent shell or an editor terminal fails, in two different
ways, because of variables the parent process leaks. Both are handled inside
`scripts/launch_tv_debug_linux.sh` and `launch()` in `src/core/health.js` — use those
rather than calling the binary yourself.

1. **`ELECTRON_RUN_AS_NODE=1`** — exported by Electron-based editors (VS Code, Cursor)
   into every child process. TradingView is Electron too, so it starts as plain Node and
   exits with `bad option: --remote-debugging-port`.
2. **Snap runtime leakage** — when the editor is a snap (e.g. `snap install code`), it
   exports its own snap runtime. `GSETTINGS_SCHEMA_DIR` and `XDG_DATA_DIRS` point into
   `/snap/<editor>/...` and TradingView **segfaults** in GTK while reading those GSettings
   schemas. Several variables trigger this independently, so both launch paths build the
   child environment from an **allowlist** instead of unsetting offenders one by one.

If you must launch by hand, go through a clean environment:

```bash
setsid env -i HOME="$HOME" USER="$USER" PATH=/usr/bin:/bin DISPLAY="$DISPLAY" \
  WAYLAND_DISPLAY="$WAYLAND_DISPLAY" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
  XDG_SESSION_TYPE="$XDG_SESSION_TYPE" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  XAUTHORITY="$XAUTHORITY" \
  /opt/TradingView/tradingview --remote-debugging-port=9222 &
```

Note also that `pkill -f TradingView` from an agent shell can match — and kill — the
agent's own shell, since the repo path contains the string. Match the binary path
instead: `pkill -f '^/opt/TradingView/tradingview'`.

### Running the CLI

```bash
node src/cli/index.js brief          # morning brief
node src/cli/index.js session get    # get saved session
node src/cli/index.js status         # CDP health check
```

### MCP config

`.mcp.json` in the repo root (gitignored) registers the server for this project:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "/home/vadym/.nvm/versions/node/v22.22.2/bin/node",
      "args": ["/home/vadym/projects/tradingview-mcp-jackson/src/server.js"]
    }
  }
}
```

### Windows notes (previous environment)

The bash shell AI agents used on Windows did **not** inherit the Windows system PATH, so
commands needed full paths: `C:\nvm4w\nodejs\node.exe`, `npm.cmd`, `npx.cmd`. The Codex
sandbox could also fail to traverse the nvm4w symlink, making `node` invisible to the
agent even though it worked in the user's PowerShell; the fix was to rerun outside the
sandbox rather than reinstall Node. TradingView was launched via
`scripts/launch_tv_debug.bat`.


## Agent Git & Version Control Rules

1. **Never commit or push automatically.** Always prepare or stage your work, then STOP and ask the user to review. The user prefers to review and execute all `git commit` and `git push` commands manually.

2. Always work in the main repository, not in session one.

## Context Management Rules

These tools can return large payloads. Follow these rules to avoid context bloat:

1. **Always use `summary: true` on `data_get_ohlcv`** unless you specifically need individual bars
2. **Always use `study_filter`** on pine tools when you know which indicator you want — don't scan all studies unnecessarily
3. **Never use `verbose: true`** on pine tools unless the user specifically asks for raw drawing data with IDs/colors
4. **Avoid calling `pine_get_source`** on complex scripts — it can return 200KB+. Only read if you need to edit the code.
5. **Avoid calling `data_get_indicator`** on protected/encrypted indicators — their inputs are encoded blobs. Use `data_get_study_values` instead for current values.
6. **Use `capture_screenshot`** for visual context instead of pulling large datasets — a screenshot is ~300KB but gives you the full visual picture
7. **Call `chart_get_state` once** at the start to get entity IDs, then reference them — don't re-call repeatedly
8. **Cap your OHLCV requests** — `count: 20` for quick analysis, `count: 100` for deeper work, `count: 500` only when specifically needed

### Output Size Estimates (compact mode)
| Tool | Typical Output |
|------|---------------|
| `quote_get` | ~200 bytes |
| `data_get_study_values` | ~500 bytes (all indicators) |
| `data_get_pine_lines` | ~1-3 KB per study (deduplicated levels) |
| `data_get_pine_labels` | ~2-5 KB per study (capped at 50) |
| `data_get_pine_tables` | ~1-4 KB per study (formatted rows) |
| `data_get_pine_boxes` | ~1-2 KB per study (deduplicated zones) |
| `data_get_ohlcv` (summary) | ~500 bytes |
| `data_get_ohlcv` (100 bars) | ~8 KB |
| `capture_screenshot` | ~300 bytes (returns file path, not image data) |

## Tool Conventions

- All tools return `{ success: true/false, ... }`
- Entity IDs (from `chart_get_state`) are session-specific — don't cache across sessions
- Pine indicators must be **visible** on chart for pine graphics tools to read their data
- `chart_manage_indicator` requires **full indicator names**: "Relative Strength Index" not "RSI", "Moving Average Exponential" not "EMA", "Bollinger Bands" not "BB"
- Screenshots save to `screenshots/` directory with timestamps
- OHLCV capped at 500 bars, trades at 20 per request
- Pine labels capped at 50 per study by default (pass `max_labels` to override)

## Architecture

```
Claude Code ←→ MCP Server (stdio) ←→ CDP (localhost:9222) ←→ TradingView Desktop (Electron)
```

Pine graphics path: `study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById`
