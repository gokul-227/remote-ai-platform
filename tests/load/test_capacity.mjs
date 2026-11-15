import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = readFileSync(new URL('./capacity.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export /g, '');
function harness(env = {}) {
  const urls = [], checks = [];
  let count = 0;
  const context = vm.createContext({ __ENV: env, Set, Math, Date,
    Trend: function () { this.add = () => {}; }, sleep() {}, group(_, fn) { fn(); },
    check(r, predicates) { for (const [name, fn] of Object.entries(predicates)) checks.push([name, fn(r)]); },
    http: { get(url) {
      urls.push(url);
      if (url.includes('limit=20')) {
        count++;
        return { status: 200, headers: count === 1 ? {'X-Next-Cursor': 'date,id+value'} : {},
          json: () => [{id: count === 1 ? 'a' : (env.DUPLICATE ? 'a' : 'b')}] };
      }
      return {status: 200};
    } },
  });
  vm.runInContext(source, context);
  return {context, urls, checks};
}
test('cursor is encoded, followed, and reset at exhaustion', () => {
  const h = harness();
  vm.runInContext('browse(); browse(); browse()', h.context);
  assert(h.urls.some(u => u.includes('after=date%2Cid%2Bvalue')));
  assert.equal(h.urls.filter(u => u.includes('jobs?limit=20')).length, 2);
  assert(h.checks.every(([, passed]) => passed));
  assert.equal(vm.runInContext('options.thresholds.checks[0]', h.context), 'rate==1');
});
test('duplicate cursor rows fail a semantic check', () => {
  const h = harness({DUPLICATE: true});
  vm.runInContext('browse(); browse()', h.context);
  assert(h.checks.some(([name, passed]) => name === 'cursor no duplicate jobs' && !passed));
});
test('remote load targets are rejected before any requests', () => {
  assert.throws(() => harness({API: 'https://example.com'}), /loopback/);
});
