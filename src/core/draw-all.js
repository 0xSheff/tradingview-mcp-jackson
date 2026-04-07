/**
 * Core logic: draw FVG rectangles + Previous Week levels on the chart.
 * Called by the CLI `draw-all` command and by draw_fvg_pois.mjs.
 */
import * as chart from './chart.js';
import * as drawing from './drawing.js';
import * as data from './data.js';
import { loadRules } from './config.js';

const BULL_STYLE = {
  backgroundColor: 'rgba(76, 175, 80, 0.25)',
  color: 'rgba(76, 175, 80, 0.6)',
  borderColor: 'rgba(76, 175, 80, 0.5)',
  linewidth: 1,
  fillBackground: true,
  transparency: 60,
};

const BEAR_STYLE = {
  backgroundColor: 'rgba(244, 67, 54, 0.25)',
  color: 'rgba(244, 67, 54, 0.6)',
  borderColor: 'rgba(244, 67, 54, 0.5)',
  linewidth: 1,
  fillBackground: true,
  transparency: 60,
};

const PW_LINE_STYLE = {
  linecolor: 'rgba(100, 181, 246, 0.8)',
  linewidth: 1,
  linestyle: 2,
  showLabel: true,
  showPrice: true,
  textcolor: 'rgba(100, 181, 246, 0.9)',
};

const delay = ms => new Promise(r => setTimeout(r, ms));
const TF_SECONDS = { 'W': 7*24*3600, 'D': 24*3600, '240': 4*3600, '60': 3600 };
const TF_LABELS  = { 'W': 'W FVG', 'D': 'D FVG', '240': 'H4 FVG', '60': 'H1 FVG' };
const TIMEFRAMES = ['W', 'D', '240', '60'];

/**
 * Build a fingerprint for a drawing: "text|price1|price2" (prices rounded to 2dp).
 * Used to detect duplicates so we don't redraw the same level/zone.
 */
function fingerprint(text, price1, price2) {
  const r = (v) => v != null ? Number(v).toFixed(2) : '';
  return `${text}|${r(price1)}|${r(price2)}`;
}

/**
 * Load all existing drawings and return a Set of fingerprints.
 * For rectangles: fp = "text|point1.price|point2.price"
 * For trend_lines: fp = "text|point1.price|"  (both points same price)
 */
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
      } else if (shape.name === 'trend_line' && pts.length >= 1) {
        fps.add(fingerprint(text, pts[0].price, ''));
      }
    } catch { /* shape disappeared mid-read, skip */ }
  }
  return fps;
}

async function getFvgData(tf) {
  await chart.setTimeframe({ timeframe: tf });
  await delay(2000);

  let sv = await data.getStudyValues();
  let fvgStudy = sv.studies.find(s => s.name.toLowerCase().includes('fair value'));
  if (!fvgStudy) {
    await delay(2000);
    sv = await data.getStudyValues();
    fvgStudy = sv.studies.find(s => s.name.toLowerCase().includes('fair value'));
  }
  if (!fvgStudy) return null;

  const parse = (v) => v ? parseFloat(String(v).replace(/,/g, '')) : null;
  const vals = fvgStudy.values;

  return {
    bull: {
      top:  parse(vals['Bull FVG Top']),
      bot:  parse(vals['Bull FVG Bot']),
      time: parse(vals['Bull FVG Time']),
    },
    bear: {
      top:  parse(vals['Bear FVG Top']),
      bot:  parse(vals['Bear FVG Bot']),
      time: parse(vals['Bear FVG Time']),
    },
  };
}

async function getPreviousWeekData() {
  await chart.setTimeframe({ timeframe: 'W' });
  await delay(2500);

  const ohlcv = await data.getOhlcv({ count: 5, summary: false });
  const bars = ohlcv.bars;
  if (!bars || bars.length < 2) return null;

  const prev = bars[bars.length - 2];
  return {
    open:  prev.open,
    high:  prev.high,
    low:   prev.low,
    close: prev.close,
    time:  prev.time,
  };
}

async function drawPrevWeekLines(pw, existing) {
  const twoWeeks = 2 * 7 * 24 * 3600;
  const t1 = pw.time;
  const t2 = t1 + twoWeeks;
  const drawn = [];

  const lines = [
    { price: pw.high,  label: 'PWH' },
    { price: pw.low,   label: 'PWL' },
    { price: pw.open,  label: 'PWO' },
  ];

  for (const { price, label } of lines) {
    const fp = fingerprint(label, price, '');
    if (existing.has(fp)) {
      drawn.push({ label, price, skipped: true });
      continue;
    }

    const result = await drawing.drawShape({
      shape: 'trend_line',
      point:  { time: t1, price },
      point2: { time: t2, price },
      overrides: JSON.stringify(PW_LINE_STYLE),
      text: label,
    });
    drawn.push({ label, price, entity_id: result.entity_id });
    existing.add(fp);
    await delay(300);
  }

  return drawn;
}

async function drawFvgs(existing) {
  let drawn = 0;
  const results = [];

  for (const tf of TIMEFRAMES) {
    const fvg = await getFvgData(tf);
    if (!fvg) continue;

    const tfSec = TF_SECONDS[tf];

    for (const [type, z] of [['bull', fvg.bull], ['bear', fvg.bear]]) {
      if (!z.top || !z.bot || !z.time) continue;

      const t1 = Math.round(z.time / 1000);
      const t2 = t1 + 8 * tfSec;

      const label = TF_LABELS[tf];
      const fp = fingerprint(label, z.top, z.bot);
      if (existing.has(fp)) {
        results.push({ tf, type, top: z.top, bot: z.bot, skipped: true });
        continue;
      }

      const style = type === 'bull' ? BULL_STYLE : BEAR_STYLE;
      const result = await drawing.drawShape({
        shape: 'rectangle',
        point:  { time: t1, price: z.top },
        point2: { time: t2, price: z.bot },
        overrides: JSON.stringify(style),
        text: label,
      });
      drawn++;
      results.push({ tf, type, top: z.top, bot: z.bot, entity_id: result.entity_id });
      existing.add(fp);
      await delay(300);
    }
  }

  return { count: drawn, results };
}

/**
 * Main entry point — draw FVGs and PW lines for all watchlist symbols.
 */
export async function runDrawAll({ rules_path } = {}) {
  const { rules } = loadRules(rules_path);
  const symbols = rules.watchlist ?? [];

  if (!symbols.length) {
    return { success: false, error: 'No symbols in rules.watchlist' };
  }

  const report = [];

  for (const symbol of symbols) {
    await chart.setSymbol({ symbol });
    await delay(2500);

    const entry = { symbol, pw_lines: [], fvg_zones: [], skipped: 0 };

    // Snapshot existing drawings once per symbol to detect duplicates
    const existing = await loadExistingFingerprints();

    // Previous Week levels
    const pw = await getPreviousWeekData();
    if (pw) {
      entry.pw_lines = await drawPrevWeekLines(pw, existing);
    }

    // FVG rectangles
    const fvg = await drawFvgs(existing);
    entry.fvg_zones = fvg.results;

    entry.skipped = [...entry.pw_lines, ...entry.fvg_zones].filter(d => d.skipped).length;

    report.push(entry);
  }

  const totalPw      = report.reduce((s, e) => s + e.pw_lines.filter(d => !d.skipped).length, 0);
  const totalFvg     = report.reduce((s, e) => s + e.fvg_zones.filter(d => !d.skipped).length, 0);
  const totalSkipped = report.reduce((s, e) => s + e.skipped, 0);

  return {
    success: true,
    symbols_drawn: report.length,
    total_pw_lines: totalPw,
    total_fvg_zones: totalFvg,
    total_skipped: totalSkipped,
    report,
  };
}
