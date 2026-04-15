#!/usr/bin/env node
/**
 * Summarize a `tv brief` JSON dump into a compact human-readable view:
 *   last 3 OHLC per timeframe, naked fractals, FVG/S&D zones, study values.
 *
 * Usage:
 *   node scripts/summarize-brief.mjs path/to/brief.json
 *   tv brief --watchlist primary | node scripts/summarize-brief.mjs -
 */
import fs from 'node:fs';

async function readInput(arg) {
  if (!arg || arg === '-') {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  }
  return fs.readFileSync(arg, 'utf8');
}

const raw = await readInput(process.argv[2]);
const j = JSON.parse(raw);
const symbols = j.symbols_scanned || j.symbols || [];

for (const s of symbols) {
  console.log('\n===', s.symbol, '===');
  if (s.quote?.last_price != null) console.log('last_price:', s.quote.last_price);
  for (const k of ['weekly', 'daily', 'h4', 'h1']) {
    const v = s[k];
    if (!v) continue;
    console.log(`--- ${k} ---`);
    if (v.bars?.length) {
      const last3 = v.bars.slice(-3).map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close }));
      console.log('last3 OHLC:', JSON.stringify(last3));
    }
    if (v.naked_fractals) console.log('naked_fractals:', JSON.stringify(v.naked_fractals));
    if (v.fvg_zones?.length) console.log('fvg_zones:', JSON.stringify(v.fvg_zones));
    if (v.sd_zones?.length) console.log('sd_zones:', JSON.stringify(v.sd_zones));
    if (v.study_values) console.log('study_values:', JSON.stringify(v.study_values));
  }
}
