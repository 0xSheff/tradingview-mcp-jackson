import { register } from '../router.js';
import { runDrawAll } from '../../core/draw-all.js';

register('draw-all', {
  description: 'Draw FVG zones + Previous Week levels (PWH/PWL/PWO) for all watchlist symbols',
  options: {
    rules: {
      type: 'string',
      short: 'r',
      description: 'Path to rules.json (default: ./rules.json)',
    },
    watchlist: {
      type: 'string',
      short: 'w',
      description:
        'Name of the watchlist in rules.json to draw (default: first listed)',
    },
  },
  handler: async ({ rules, watchlist }) =>
    runDrawAll({ rules_path: rules, watchlist }),
});
