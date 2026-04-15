import { register } from '../router.js';
import { runDrawIdeas } from '../../core/draw-ideas.js';

register('draw-ideas', {
  description: 'Draw entry/target/stop rectangles for trade ideas from ideas.json',
  options: {
    file: {
      type: 'string',
      short: 'f',
      description: 'Path to ideas JSON (default: ./ideas.json)',
    },
    watchlist: {
      type: 'string',
      short: 'w',
      description: 'Name of the ideas group in ideas.json to draw (default: first listed)',
    },
    timeframe: {
      type: 'string',
      short: 't',
      description: 'Chart timeframe to draw on (default: from ideas.json defaults, or 240)',
    },
    'forward-bars': {
      type: 'string',
      description: 'How many bars to extend rectangles forward (default: 20)',
    },
    'forward-hours': {
      type: 'string',
      description: 'Rectangle width in hours — takes precedence over --forward-bars',
    },
  },
  handler: async (opts) =>
    runDrawIdeas({
      ideas_path: opts.file,
      watchlist: opts.watchlist,
      timeframe: opts.timeframe,
      forward_bars: opts['forward-bars'] != null ? Number(opts['forward-bars']) : undefined,
      forward_hours: opts['forward-hours'] != null ? Number(opts['forward-hours']) : undefined,
    }),
});