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

  let xml;
  try {
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
      xml = await res.text();
    } finally {
      clearTimeout(to);
    }
  } catch (err) {
    return {
      success: false,
      error: `Calendar feed unavailable: ${err.message}`,
      events: [],
      date: today,
      timezone,
    };
  }

  const raw = parseEvents(xml);
  const out = [];
  for (const ev of raw) {
    if (ev.impact !== "High") continue;
    if (!currencySet.has(ev.currency.toUpperCase())) continue;

    const parsed = parseEventDateTime(ev.date, ev.time);
    if (!parsed) continue;

    const localDate = todayInZone(parsed.date, timezone);
    if (localDate !== today) continue;

    out.push({
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
    });
  }

  // Sort by UTC time; all-day/tentative items still sort by their ET anchor
  out.sort((a, b) => a.time_utc.localeCompare(b.time_utc));

  return { success: true, events: out, date: today, timezone };
}
