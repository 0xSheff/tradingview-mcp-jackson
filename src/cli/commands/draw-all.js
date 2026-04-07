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
  },
  handler: async ({ rules }) => runDrawAll({ rules_path: rules }),
});
