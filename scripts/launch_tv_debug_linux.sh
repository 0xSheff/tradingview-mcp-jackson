#!/bin/bash
# Launch TradingView Desktop on Linux with Chrome DevTools Protocol enabled
# Usage: ./scripts/launch_tv_debug_linux.sh [port]

PORT="${1:-9222}"

# Auto-detect TradingView install location
APP=""
LOCATIONS=(
  "/opt/TradingView/tradingview"
  "/opt/TradingView/TradingView"
  "$HOME/.local/share/TradingView/TradingView"
  "/usr/bin/tradingview"
  "/usr/local/bin/tradingview"
  "/snap/tradingview/current/tradingview"
  "/var/lib/flatpak/app/com.tradingview.TradingView/current/active/files/bin/tradingview"
  "$HOME/.local/share/flatpak/app/com.tradingview.TradingView/current/active/files/bin/tradingview"
)

for loc in "${LOCATIONS[@]}"; do
  if [ -f "$loc" ] && [ -x "$loc" ]; then
    APP="$loc"
    break
  fi
done

# Fallback: which / whereis
if [ -z "$APP" ]; then
  APP=$(which tradingview 2>/dev/null || which TradingView 2>/dev/null)
fi

# Fallback: find in common dirs
if [ -z "$APP" ]; then
  APP=$(find /opt /usr/local /snap "$HOME/.local" -name "tradingview" -o -name "TradingView" -type f -executable 2>/dev/null | head -1)
fi

if [ -z "$APP" ] || [ ! -f "$APP" ]; then
  echo "Error: TradingView not found."
  echo "Checked: /opt/TradingView, ~/.local/share/TradingView, snap, flatpak, PATH"
  echo ""
  echo "If installed elsewhere, run manually:"
  echo "  /path/to/tradingview --remote-debugging-port=$PORT"
  exit 1
fi

# Kill any existing TradingView (match the binary path so we never kill the caller)
pkill -f "^$APP" 2>/dev/null
sleep 1

echo "Found TradingView at: $APP"
echo "Launching with --remote-debugging-port=$PORT ..."

# Launch from an explicit allowlist environment rather than inheriting this shell's.
# When the script runs from an editor terminal or an AI agent's shell, the parent
# leaks variables that break TradingView:
#   * Electron editors (VS Code, Cursor) export ELECTRON_RUN_AS_NODE=1. TradingView
#     is Electron too, so it boots as plain Node and exits with
#     "bad option: --remote-debugging-port".
#   * A snap-packaged editor exports its whole snap runtime (GSETTINGS_SCHEMA_DIR,
#     XDG_DATA_DIRS, GTK/GIO module paths pointing into /snap/<editor>/...).
#     TradingView then segfaults in GTK while reading those GSettings schemas.
# Several variables cause this independently, so an allowlist is used instead of
# unsetting known offenders one by one.
ALLOW=(HOME USER LOGNAME SHELL LANG LANGUAGE LC_ALL LC_TIME TZ
       DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_RUNTIME_DIR XDG_SESSION_TYPE
       XDG_CURRENT_DESKTOP XDG_SESSION_DESKTOP DBUS_SESSION_BUS_ADDRESS
       http_proxy https_proxy no_proxy HTTP_PROXY HTTPS_PROXY NO_PROXY)

ENV_ARGS=()
for v in "${ALLOW[@]}"; do
  [ -n "${!v}" ] && ENV_ARGS+=("$v=${!v}")
done

# Drop snap entries from PATH.
CLEAN_PATH=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/snap/' | paste -sd: -)
ENV_ARGS+=("PATH=${CLEAN_PATH:-/usr/local/bin:/usr/bin:/bin}")

# Snaps stash the pre-snap XDG_DATA_DIRS in XDG_DATA_DIRS_<NAME>_SNAP_ORIG; prefer
# that, and fall back to the current value only when it is snap-free.
XDG_ORIG=""
for v in $(compgen -v | grep '^XDG_DATA_DIRS_.*_SNAP_ORIG$'); do XDG_ORIG="${!v}"; break; done
if [ -z "$XDG_ORIG" ] && [[ "$XDG_DATA_DIRS" != */snap/* ]]; then XDG_ORIG="$XDG_DATA_DIRS"; fi
[ -n "$XDG_ORIG" ] && ENV_ARGS+=("XDG_DATA_DIRS=$XDG_ORIG")

# setsid detaches the app from this shell so it outlives the terminal/agent session.
setsid env -i "${ENV_ARGS[@]}" "$APP" --remote-debugging-port=$PORT >/dev/null 2>&1 &
TV_PID=$!
echo "PID: $TV_PID"

# Wait for CDP to be ready
echo "Waiting for CDP..."
for i in $(seq 1 15); do
  if curl -s "http://localhost:$PORT/json/version" > /dev/null 2>&1; then
    echo "CDP ready at http://localhost:$PORT"
    curl -s "http://localhost:$PORT/json/version" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$PORT/json/version"
    exit 0
  fi
  sleep 1
done

echo "Warning: CDP not responding after 15s. TradingView may still be loading."
