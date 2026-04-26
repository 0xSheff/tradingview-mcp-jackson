/**
 * Morning brief preflight.
 * Verifies that the chart has all required indicators ATTACHED and VISIBLE
 * (hidden indicators return empty data, so we probe for both), and that
 * today's economic calendar feed is reachable. Runs before the watchlist
 * scan so the user can fix issues without waiting through the scan first.
 */
import * as chart from "./chart.js";
import * as data from "./data.js";
import { fetchTodayHighImpact, fetchWeekHighImpact } from "./calendar.js";

/**
 * Required indicators for the brief, with substring matchers for name
 * detection. `probe` selects which kind of data check confirms usability:
 *   - "values":    study must appear in getStudyValues() with non-empty values
 *   - "labels":    indicator must produce pine labels (getPineLabels with filter)
 */
const REQUIRED_INDICATORS = [
  {
    key: "fvg",
    label: "Fair Value Gap (FVG)",
    match: ["fair value", "fvg"],
    probe: "values",
    used_for: "FVG zones on M/W/D/H4/H1",
  },
  {
    key: "fractals",
    label: "0x Fractals Advanced",
    match: ["0x fractals", "fractals advanced"],
    probe: "labels",
    filter: "0x Fractals",
    used_for: "Naked fractal liquidity levels + H4/H1 POIs",
  },
  {
    key: "atr",
    label: "Average True Range (ATR)",
    match: ["average true range", "atr"],
    probe: "values",
    used_for: "D/H4/H1 ATR sizing",
  },
];

function nameMatches(name, patterns) {
  const n = (name || "").toLowerCase();
  return patterns.some((p) => n.includes(p));
}

async function checkIndicators() {
  let studies = [];
  try {
    const state = await chart.getState();
    studies = state.studies || [];
  } catch (err) {
    return {
      ok: false,
      error: `Could not read chart state: ${err.message}`,
      checks: [],
    };
  }

  // Data probes — one call each, re-used across required indicators.
  const [values, fractalLabels] = await Promise.all([
    data.getStudyValues().then((r) => r.studies || []).catch(() => []),
    data
      .getPineLabels({ study_filter: "0x Fractals", max_labels: 5 })
      .then((r) => r.studies || [])
      .catch(() => []),
  ]);

  const checks = REQUIRED_INDICATORS.map((req) => {
    const attached = studies.some((s) => nameMatches(s.name, req.match));

    let usable = false;
    if (req.probe === "values") {
      usable = values.some(
        (s) =>
          nameMatches(s.name, req.match) &&
          s.values &&
          Object.keys(s.values).length > 0,
      );
    } else if (req.probe === "labels") {
      usable = fractalLabels.some((s) => (s.labels || []).length > 0);
    }

    let status;
    if (!attached) status = "missing";
    else if (!usable) status = "hidden_or_broken";
    else status = "ok";

    return {
      key: req.key,
      label: req.label,
      used_for: req.used_for,
      attached,
      usable,
      status,
    };
  });

  return { ok: checks.every((c) => c.status === "ok"), checks };
}

async function checkCalendar(calendarCfg, mode = "today") {
  const currencies = calendarCfg.currencies || ["USD", "EUR"];
  const timezone = calendarCfg.timezone || "Europe/Athens";
  if (mode === "week") {
    const result = await fetchWeekHighImpact({ currencies, timezone });
    return {
      ok: result.success,
      mode: "week",
      currencies,
      timezone,
      week_start: result.week_start,
      event_count: result.events.length,
      error: result.error || null,
      _events: result.events,
      _by_day: result.by_day,
      _success: result.success,
    };
  }
  const result = await fetchTodayHighImpact({ currencies, timezone });
  return {
    ok: result.success,
    mode: "today",
    currencies,
    timezone,
    date: result.date,
    event_count: result.events.length,
    error: result.error || null,
    // Pass the events through so the brief doesn't need to refetch.
    _events: result.events,
    _success: result.success,
  };
}

/**
 * Run all preflight checks. Returns aggregated result plus a human-readable
 * issues list the model can surface to the user.
 */
export async function runPreflight({ rules, calendarMode = "today" } = {}) {
  const calendarCfg = (rules && rules.calendar) || {};

  const [indicators, calendar] = await Promise.all([
    checkIndicators(),
    checkCalendar(calendarCfg, calendarMode),
  ]);

  const issues = [];

  for (const c of indicators.checks) {
    if (c.status === "missing") {
      issues.push({
        severity: "blocker",
        component: "indicator",
        key: c.key,
        message: `${c.label} is NOT attached to the chart. Needed for: ${c.used_for}.`,
        fix_hint: `Add the "${c.label}" indicator to your chart, then retry.`,
      });
    } else if (c.status === "hidden_or_broken") {
      issues.push({
        severity: "blocker",
        component: "indicator",
        key: c.key,
        message: `${c.label} is attached but not producing data (likely hidden). Needed for: ${c.used_for}.`,
        fix_hint: `Click the eye icon on "${c.label}" in the chart's indicator list to re-enable it, then retry.`,
      });
    }
  }
  if (indicators.error) {
    issues.push({
      severity: "blocker",
      component: "chart",
      message: indicators.error,
      fix_hint:
        "Make sure TradingView Desktop is running with --remote-debugging-port=9222 (scripts/launch_tv_debug.bat).",
    });
  }

  if (!calendar.ok) {
    issues.push({
      severity: "warning",
      component: "calendar",
      message: `Economic calendar feed unavailable: ${calendar.error}.`,
      fix_hint:
        "Proceed without calendar (brief still works) or wait and retry. Calendar is advisory — it does not block analysis.",
    });
  }

  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");

  // Any issue (blocker OR warning) pauses the brief so the user can decide
  // before the scan runs. Severity still shapes the message framing.
  return {
    ok: issues.length === 0,
    indicators,
    calendar,
    issues,
    blocker_count: blockers.length,
    warning_count: warnings.length,
  };
}

/**
 * Instruction block rendered when preflight fails. The model must surface
 * this to the user and await their decision before any scan runs.
 */
export function buildPreflightInstruction(preflight, briefName = "morning_brief") {
  const lines = [
    "PREFLIGHT FAILED — do NOT proceed with the watchlist scan.",
    "",
    "Report the issues below to the user exactly, then ASK what they want to do.",
    "",
    "Acceptable replies and required next actions:",
    `  - "fixed" / "retry" / "go" → call ${briefName} again (preflight will re-run).`,
    `  - "continue" / "skip" / "proceed anyway" → call ${briefName} again with skip_preflight: true.`,
    '  - "abort" / "cancel" → stop; do nothing else.',
    "",
    `Do NOT call ${briefName} again until the user has explicitly chosen one of these options.`,
    "",
    "Issues:",
  ];
  for (const iss of preflight.issues) {
    const tag = iss.severity === "blocker" ? "[BLOCKER]" : "[WARNING]";
    lines.push(`  ${tag} ${iss.message}`);
    lines.push(`           Fix: ${iss.fix_hint}`);
  }
  if (preflight.warning_count > 0 && preflight.blocker_count === 0) {
    lines.push("");
    lines.push(
      "Only warnings were raised — the user may reasonably choose to continue.",
    );
  }
  return lines.join("\n");
}
