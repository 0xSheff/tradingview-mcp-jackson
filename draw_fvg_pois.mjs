#!/usr/bin/env node
/**
 * Standalone script: draw FVG zones + PW lines for all watchlist symbols.
 * Same as `tv draw-all` but runnable directly with node.
 */
import { runDrawAll } from './src/core/draw-all.js';

const result = await runDrawAll();
console.log(JSON.stringify(result, null, 2));
if (!result.success) process.exit(1);
