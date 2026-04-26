/**
 * Economic calendar fetcher.
 * Pulls ForexFactory's weekly XML feed and filters to today's high-impact
 * events for the requested currencies. The feed is unofficial — on any
 * failure this module returns { success: false, events: [] } so the
 * morning brief can render without it.
 *
 * Feed times are US Eastern (ForexFactory convention). Events are
 * converted to UTC and displayed in the target timezone (default
 * Europe/Athens).
 */

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";
const FETCH_TIMEOUT_MS = 5000;

function stripCdata(s) {
  if (!s) return "";
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (m ? m[1] : s).trim();
}

function extractField(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  if (!m) return "";
  return stripCdata(m[1]);
}

function parseEvents(xml) {
  const events = [];
  const blockRe = /<event>([\s\S]*?)<\/event>/g;
  let m;
  while ((m = blockRe.exec(xml)) !== null) {
    const b = m[1];
    events.push({
      title: extractField(b, "title"),
      currency: extractField(b, "country"),
      date: extractField(b, "date"),
      time: extractField(b, "time"),
      impact: extractField(b, "impact"),
      forecast: extractField(b, "forecast"),
      previous: extractField(b, "previous"),
    });
  }
  return events;
}

/**
 * Convert a wall-clock time in a named timezone to a UTC Date.
 * Uses Intl.DateTimeFormat to compute the zone's offset at that instant.
 */
function zonedWallTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  // Intl can emit "24" for midnight — normalize to 0
  const h = parts.hour === "24" ? 0 : +parts.hour;
  const asZone = Date.UTC(+parts.year, +parts.month - 1, +parts.day, h, +parts.minute);
  const offset = asZone - guess;
  return new Date(guess - offset);
}

/**
 * Parse feed date (MM-DD-YYYY) + time (e.g. "8:30am", "All Day", "Tentative")
 * into a UTC Date. Returns { date, isAllDay, isTentative } where date may be
 * set to 00:00 ET for all-day/tentative events.
 */
function parseEventDateTime(dateStr, timeStr) {
  const dm = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dm) return null;
  const month = +dm[1];
  const day = +dm[2];
  const year = +dm[3];

  const t = (timeStr || "").trim().toLowerCase();
  const isAllDay = t === "all day" || t === "";
  const isTentative = t === "tentative";

  let hour = 0;
  let minute = 0;
  if (!isAllDay && !isTentative) {
    const tm = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
    if (!tm) return null;
    hour = +tm[1] % 12;
    minute = +tm[2];
    if (tm[3] === "pm") hour += 12;
  }

  const utc = zonedWallTimeToUtc(year, month, day, hour, minute, "America/New_York");
  return { date: utc, isAllDay, isTentative };
}

/**
 * Format a UTC Date as HH:mm in the target timezone.
 */
function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Return the calendar date (YYYY-MM-DD) in the given timezone for `now`.
 */
function todayInZone(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Fetch the raw weekly XML once, parse, and return all events. Internal helper
 * shared by today and week filters so the network call happens at most once.
 */
async function fetchAllEvents() {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; tradingview-mcp/1.0; +https://github.com/)",
        Accept: "application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseEvents(await res.text());
  } finally {
    clearTimeout(to);
  }
}

function buildEvent(ev, parsed, timezone) {
  return {
    time_local: parsed.isAllDay
      ? "All Day"
      : parsed.isTentative
        ? "Tentative"
        : formatInZone(parsed.date, timezone),
    time_utc: parsed.date.toISOString(),
    currency: ev.currency,
    title: ev.title,
    impact: ev.impact,
    forecast: ev.forecast || null,
    previous: ev.previous || null,
  };
}

/**
 * Fetch today's high-impact events for the given currencies.
 *
 * @param {object} opts
 * @param {string[]} [opts.currencies=["USD","EUR"]]
 * @param {string}   [opts.timezone="Europe/Athens"]  Display timezone for event times.
 * @param {Date}     [opts.now=new Date()]            Override "now" (useful for tests).
 * @returns {Promise<{success:boolean, events:Array, date:string, timezone:string, error?:string}>}
 */
export async function fetchTodayHighImpact({
  currencies = ["USD", "EUR"],
  timezone = "Europe/Athens",
  now = new Date(),
} = {}) {
  const currencySet = new Set(currencies.map((c) => c.toUpperCase()));
  const today = todayInZone(now, timezone);

  let raw;
  try {
    raw = await fetchAllEvents();
  } catch (err) {
    return {
      success: false,
      error: `Calendar feed unavailable: ${err.message}`,
      events: [],
      date: today,
      timezone,
    };
  }

  const out = [];
  for (const ev of raw) {
    if (ev.impact !== "High") continue;
    if (!currencySet.has(ev.currency.toUpperCase())) continue;

    const parsed = parseEventDateTime(ev.date, ev.time);
    if (!parsed) continue;

    const localDate = todayInZone(parsed.date, timezone);
    if (localDate !== today) continue;

    out.push(buildEvent(ev, parsed, timezone));
  }

  out.sort((a, b) => a.time_utc.localeCompare(b.time_utc));

  return { success: true, events: out, date: today, timezone };
}

/**
 * Compute the Monday (YYYY-MM-DD) of the upcoming planning week, in the
 * target timezone. Saturday/Sunday → next Monday. Mon–Fri → next Monday
 * (the user is planning the *next* week, not the current one).
 */
export function nextMondayInZone(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const dow = dowMap[parts.weekday] ?? 0;
  // Days until next Monday (always strictly forward).
  const daysAhead = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const baseUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  const monUtc = new Date(baseUtc + daysAhead * 86400000);
  const y = monUtc.getUTCFullYear();
  const m = String(monUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Fetch high-impact events for Monday–Friday of the planning week
 * (the week starting at `weekStart`, default = next Monday).
 *
 * Output groups events by weekday (Mon..Fri).
 *
 * @param {object} opts
 * @param {string[]} [opts.currencies=["USD","EUR"]]
 * @param {string}   [opts.timezone="Europe/Athens"]
 * @param {string}   [opts.weekStart]   YYYY-MM-DD Monday; defaults to next Monday in zone.
 * @param {Date}     [opts.now=new Date()]
 */
export async function fetchWeekHighImpact({
  currencies = ["USD", "EUR"],
  timezone = "Europe/Athens",
  weekStart,
  now = new Date(),
} = {}) {
  const currencySet = new Set(currencies.map((c) => c.toUpperCase()));
  const monday = weekStart || nextMondayInZone(now, timezone);

  // Build the Mon..Fri date set in the target zone.
  const [y, m, d] = monday.split("-").map(Number);
  const mondayUtc = Date.UTC(y, m - 1, d);
  const weekDates = [];
  const byDay = {};
  const dowNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  for (let i = 0; i < 5; i++) {
    const dt = new Date(mondayUtc + i * 86400000);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const iso = `${yy}-${mm}-${dd}`;
    weekDates.push(iso);
    byDay[dowNames[i]] = { date: iso, events: [] };
  }
  const dateSet = new Set(weekDates);

  let raw;
  try {
    raw = await fetchAllEvents();
  } catch (err) {
    return {
      success: false,
      error: `Calendar feed unavailable: ${err.message}`,
      events: [],
      by_day: byDay,
      week_start: monday,
      timezone,
    };
  }

  const flat = [];
  for (const ev of raw) {
    if (ev.impact !== "High") continue;
    if (!currencySet.has(ev.currency.toUpperCase())) continue;

    const parsed = parseEventDateTime(ev.date, ev.time);
    if (!parsed) continue;

    const localDate = todayInZone(parsed.date, timezone);
    if (!dateSet.has(localDate)) continue;

    const item = buildEvent(ev, parsed, timezone);
    item.date_local = localDate;
    flat.push(item);

    const dayIdx = weekDates.indexOf(localDate);
    if (dayIdx >= 0) byDay[dowNames[dayIdx]].events.push(item);
  }

  flat.sort((a, b) => a.time_utc.localeCompare(b.time_utc));
  for (const day of Object.values(byDay)) {
    day.events.sort((a, b) => a.time_utc.localeCompare(b.time_utc));
  }

  return {
    success: true,
    events: flat,
    by_day: byDay,
    week_start: monday,
    timezone,
  };
}
