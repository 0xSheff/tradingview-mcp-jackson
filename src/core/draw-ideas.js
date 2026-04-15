/**
 * Core logic: draw trade-idea rectangles (entry / targets / stop) on the chart.
 * Called by the CLI `draw-ideas` command.
 *
 * For each idea in ideas.json:
 *   - Switch to the idea's symbol (and timeframe).
 *   - Anchor time at the last bar; extend rectangles `forward_bars` into the future.
 *   - Entry rect: price = [entry.low, entry.high]
 *   - Target ladder: T1 band = [entry-edge, T1]; T2 band = [T1, T2]; T3 band = [T2, T3]
 *     (entry-edge = entry.low for shorts, entry.high for longs — the edge closer to targets)
 *   - Stop rect (optional): price = [stop, entry-far-edge]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as chart from './chart.js';
import * as drawing from './drawing.js';
import * as data from './data.js';

const ENTRY_STYLE = {
  backgroundColor: 'rgba(255, 193, 7, 0.08)',
  color: 'rgba(255, 193, 7, 0.7)',
  borderColor: 'rgba(255, 193, 7, 0.6)',
  linewidth: 1,
  fillBackground: true,
  transparency: 60,
};

const TARGET_STYLE = {
  backgroundColor: 'rgba(76, 175, 80, 0.08)',
  color: 'rgba(76, 175, 80, 0.7)',
  borderColor: 'rgba(76, 175, 80, 0.6)',
  linewidth: 1,
  fillBackground: true,
  transparency: 65,
};

const STOP_STYLE = {
  backgroundColor: 'rgba(244, 67, 54, 0.08)',
  color: 'rgba(244, 67, 54, 0.7)',
  borderColor: 'rgba(244, 67, 54, 0.6)',
  linewidth: 1,
  fillBackground: true,
  transparency: 60,
};

const TF_SECONDS = { W: 7 * 24 * 3600, D: 24 * 3600, '240': 4 * 3600, '60': 3600, '15': 15 * 60, '5': 5 * 60, '1': 60 };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Show ideas on 10m–1H charts (hidden on ≤5m, ≥2H, and on D/W/M).
const DEFAULT_VISIBILITY = {
  ticks: false, seconds: false, ranges: false,
  minutes: true, minutesFrom: 10, minutesTo: 59,
  hours: true, hoursFrom: 1, hoursTo: 1,
  days: false, weeks: false, months: false,
};

function fingerprint(text, price1, price2) {
  const r = (v) => (v != null ? Number(v).toFixed(4) : '');
  return `${text}|${r(price1)}|${r(price2)}`;
}

async function loadExistingFingerprints() {
  const fps = new Set();
  const { shapes } = await drawing.listDrawings();
  if (!shapes || !shapes.length) return fps;

  for (const shape of shapes) {
    try {
      const props = await drawing.getProperties({ entity_id: shape.id });
      const text = props.properties?.text || '';
      const pts = props.points || [];
      if (!text) continue;
      if (shape.name === 'rectangle' && pts.length >= 2) {
        fps.add(fingerprint(text, pts[0].price, pts[1].price));
      }
    } catch {
      /* shape disappeared mid-read, skip */
    }
  }
  return fps;
}

async function getLastBarTime() {
  const ohlcv = await data.getOhlcv({ count: 2, summary: false });
  const bars = ohlcv.bars;
  if (!bars || !bars.length) throw new Error('No OHLCV bars available to anchor time.');
  return bars[bars.length - 1].time;
}

function loadIdeas(ideasPath) {
  const resolved = ideasPath ? path.resolve(ideasPath) : path.resolve(process.cwd(), 'ideas.json');
  if (!fs.existsSync(resolved)) {
    throw new Error(`ideas file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  return { ideas_path: resolved, ...parsed };
}

/**
 * Resolve the ideas array for a given watchlist name.
 *
 * Supported `ideas` shapes in ideas.json:
 *   1. New:    "ideas": { "primary": [...], "secondary": [...] }
 *   2. Legacy: "ideas": [...]  (treated as the sole default group)
 *
 * Name lookup mirrors rules.json: exact match, then case-insensitive fallback.
 * Omit `name` to use `default_watchlist`, else the first key.
 */
function resolveIdeas(file, name) {
  const ideas = file.ideas;

  if (Array.isArray(ideas)) {
    const legacyName = 'default';
    if (name && name.toLowerCase() !== legacyName) {
      throw new Error(
        `Ideas group "${name}" not found. ideas.json uses the legacy single "ideas" array — ` +
          `migrate to an object keyed by watchlist name to use multiple groups.`,
      );
    }
    return { name: legacyName, ideas, available: [legacyName] };
  }

  if (!ideas || typeof ideas !== 'object') {
    throw new Error('ideas.json must contain an "ideas" object keyed by watchlist name, or a legacy "ideas" array.');
  }

  const keys = Object.keys(ideas);
  if (!keys.length) throw new Error('ideas.json "ideas" is empty. Add at least one named group.');

  if (!name) {
    const explicit = file.default_watchlist;
    const defaultName = explicit && Object.prototype.hasOwnProperty.call(ideas, explicit) ? explicit : keys[0];
    return { name: defaultName, ideas: Array.isArray(ideas[defaultName]) ? ideas[defaultName] : [], available: keys };
  }

  if (Object.prototype.hasOwnProperty.call(ideas, name)) {
    return { name, ideas: Array.isArray(ideas[name]) ? ideas[name] : [], available: keys };
  }
  const ci = keys.find((k) => k.toLowerCase() === name.toLowerCase());
  if (ci) return { name: ci, ideas: Array.isArray(ideas[ci]) ? ideas[ci] : [], available: keys };

  throw new Error(`Ideas group "${name}" not found in ideas.json. Available: ${keys.join(', ')}`);
}

function validateIdea(idea, i) {
  const where = `ideas[${i}]${idea.name ? ` "${idea.name}"` : ''}`;
  if (!idea.symbol) throw new Error(`${where}: missing "symbol"`);
  if (!idea.side || !['long', 'short'].includes(idea.side)) {
    throw new Error(`${where}: "side" must be "long" or "short"`);
  }
  if (!idea.entry || typeof idea.entry.low !== 'number' || typeof idea.entry.high !== 'number') {
    throw new Error(`${where}: "entry" must be { low: number, high: number }`);
  }
  if (idea.entry.low > idea.entry.high) {
    throw new Error(`${where}: entry.low must be <= entry.high`);
  }
  if (!Array.isArray(idea.targets) || !idea.targets.length) {
    throw new Error(`${where}: "targets" must be a non-empty array`);
  }
  for (let j = 0; j < idea.targets.length; j++) {
    const t = idea.targets[j];
    if (typeof t?.price !== 'number') {
      throw new Error(`${where}: targets[${j}].price must be a number`);
    }
  }
}

/**
 * Build the list of rectangles to draw for a single idea.
 * Returns [{ role, label, top, bottom, style }, ...]
 */
function buildRects(idea) {
  const { side, entry, stop, targets, name } = idea;
  const rects = [];
  const tag = name || 'idea';

  rects.push({
    role: 'entry',
    label: `ENTRY ${tag}`,
    top: entry.high,
    bottom: entry.low,
    style: ENTRY_STYLE,
  });

  // Target ladder: each band from previous level (starting at entry-edge) to target.
  // entry-edge = side closer to targets: low for short, high for long.
  const entryEdge = side === 'short' ? entry.low : entry.high;
  let prev = entryEdge;
  for (const t of targets) {
    const top = Math.max(prev, t.price);
    const bottom = Math.min(prev, t.price);
    rects.push({
      role: 'target',
      label: `${t.label || 'T'} ${tag}`,
      top,
      bottom,
      style: TARGET_STYLE,
    });
    prev = t.price;
  }

  if (typeof stop === 'number') {
    // stop zone: from stop level to entry-far-edge (the side away from targets).
    const farEdge = side === 'short' ? entry.high : entry.low;
    const top = Math.max(farEdge, stop);
    const bottom = Math.min(farEdge, stop);
    rects.push({
      role: 'stop',
      label: `STOP ${tag}`,
      top,
      bottom,
      style: STOP_STYLE,
    });
  }

  return rects;
}

async function drawIdeaRects(idea, { timeframe, forwardBars, forwardHours }, existing) {
  const tf = idea.timeframe || timeframe;
  const tfSec = TF_SECONDS[tf];
  if (!tfSec) throw new Error(`Unsupported timeframe "${tf}" (supported: W, D, 240, 60, 15, 5, 1)`);

  await chart.setTimeframe({ timeframe: tf });
  await delay(1500);

  const anchor = await getLastBarTime();
  const t1 = anchor;
  // forward_hours (when set) takes precedence over forward_bars — time-denominated width
  // stays stable across timeframes, which matters for thin on-chart footprints.
  const widthSec = forwardHours != null ? forwardHours * 3600 : forwardBars * tfSec;
  const t2 = anchor + widthSec;

  const rects = buildRects(idea);
  const drawn = [];
  const visibility = idea.visibility || DEFAULT_VISIBILITY;

  for (const r of rects) {
    const fp = fingerprint(r.label, r.top, r.bottom);
    if (existing.has(fp)) {
      drawn.push({ ...r, skipped: true });
      continue;
    }
    const result = await drawing.drawShape({
      shape: 'rectangle',
      point: { time: t1, price: r.top },
      point2: { time: t2, price: r.bottom },
      overrides: JSON.stringify(r.style),
      text: r.label,
    });
    if (result.entity_id && visibility) {
      try {
        await drawing.setIntervalVisibility({ entity_id: result.entity_id, visibility });
      } catch {
        /* visibility is best-effort; don't fail the draw */
      }
    }
    drawn.push({ role: r.role, label: r.label, top: r.top, bottom: r.bottom, entity_id: result.entity_id });
    existing.add(fp);
    await delay(250);
  }

  return drawn;
}

/**
 * Main entry point — draw all ideas from ideas.json.
 */
export async function runDrawIdeas({ ideas_path, watchlist, timeframe, forward_bars, forward_hours } = {}) {
  let file;
  try {
    file = loadIdeas(ideas_path);
  } catch (err) {
    return { success: false, error: err.message };
  }

  let resolvedName;
  let ideas;
  let available;
  try {
    ({ name: resolvedName, ideas, available } = resolveIdeas(file, watchlist));
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!ideas.length) {
    return { success: false, error: `Ideas group "${resolvedName}" in ${file.ideas_path} is empty.` };
  }

  const tf = timeframe || file.defaults?.timeframe || '240';
  const fwd = Number(forward_bars ?? file.defaults?.forward_bars ?? 20);
  const fwdHoursRaw = forward_hours ?? file.defaults?.forward_hours;
  const fwdHours = fwdHoursRaw != null ? Number(fwdHoursRaw) : null;

  for (let i = 0; i < ideas.length; i++) {
    try {
      validateIdea(ideas[i], i);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  const report = [];
  for (const idea of ideas) {
    await chart.setSymbol({ symbol: idea.symbol });
    await delay(2500);

    const existing = await loadExistingFingerprints();
    let shapes;
    try {
      shapes = await drawIdeaRects(idea, { timeframe: tf, forwardBars: fwd, forwardHours: fwdHours }, existing);
    } catch (err) {
      report.push({ symbol: idea.symbol, name: idea.name, error: err.message });
      continue;
    }
    const skipped = shapes.filter((s) => s.skipped).length;
    report.push({
      symbol: idea.symbol,
      name: idea.name,
      side: idea.side,
      timeframe: idea.timeframe || tf,
      shapes,
      drawn: shapes.length - skipped,
      skipped,
    });
  }

  const totalDrawn = report.reduce((s, e) => s + (e.drawn || 0), 0);
  const totalSkipped = report.reduce((s, e) => s + (e.skipped || 0), 0);

  return {
    success: true,
    ideas_path: file.ideas_path,
    watchlist: { name: resolvedName, available },
    timeframe: tf,
    forward_bars: fwd,
    forward_hours: fwdHours,
    ideas_count: ideas.length,
    total_drawn: totalDrawn,
    total_skipped: totalSkipped,
    report,
  };
}