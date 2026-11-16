// Bounded HTTP smoke against a disposable local API with >20 visible jobs.
// k6 run -e API=http://127.0.0.1:28049 tests/load/cursor-smoke.js
import { browse } from './capacity.js';
export const options = {
  scenarios: {
    cursor_smoke: {
      executor: 'shared-iterations', vus: 1, iterations: 3,
      maxDuration: '30s', gracefulStop: '0s',
    },
  },
  thresholds: {
    checks: ['rate==1'], http_req_failed: ['rate==0'],
    'http_reqs{route:list_cursor}': ['count>0'],
  },
};
export default browse;
