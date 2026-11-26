const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const loadGas = require('./load-gas');
const { createFakeApp } = require('./fake-sheets');

const g = loadGas();
const root = path.join(__dirname, '..');

test('compareVersions orders numerically, not as text', () => {
  assert.strictEqual(g.compareVersions('2.10.0', '2.9.9'), 1);
  assert.strictEqual(g.compareVersions('2.0.0', '2.0.1'), -1);
  assert.strictEqual(g.compareVersions('2.0', '2.0.0'), 0);
  assert.strictEqual(g.compareVersions('v3', '2.99.99'), 1);
  assert.strictEqual(g.compareVersions('garbage', '2.0.0'), 0);
});

test('updateStatus flags only newer published versions', () => {
  const newer = g.updateStatus('2.0.0', { version: '2.1.0', released: '2027-01-05', notes: 'Activity grid', url: 'https://example.com' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(newer)), { current: '2.0.0', latest: '2.1.0', updateAvailable: true,
    released: '2027-01-05', notes: ['Activity grid'], url: 'https://example.com' });
  assert.strictEqual(g.updateStatus('2.1.0', { version: '2.0.0' }).updateAvailable, false);
  assert.strictEqual(g.updateStatus('2.0.0', { version: '2.0.0' }).updateAvailable, false);
  const none = g.updateStatus('2.0.0', null);
  assert.strictEqual(none.updateAvailable, false);
  assert.strictEqual(none.latest, '');
});

test('APP_VERSION matches version.json and package.json', () => {
  assert.strictEqual(require(path.join(root, 'version.json')).version, g.APP_VERSION);
  assert.strictEqual(require(path.join(root, 'package.json')).version, g.APP_VERSION);
});

function withFetch(response) {
  const app = createFakeApp({ Master: [['Profile']] });
  const store = {};
  let fetches = 0;
  const globals = Object.assign({}, app.globals, {
    CacheService: { getScriptCache: () => ({ get: k => store[k] || null, put: (k, v) => { store[k] = v; } }) },
    UrlFetchApp: { fetch: () => { fetches++; if (response instanceof Error) throw response; return response; } },
  });
  return { g: loadGas(globals), fetches: () => fetches };
}
const reply = (code, body) => ({ getResponseCode: () => code, getContentText: () => body });

test('webAppUpdateStatus reads the published version once, then uses the cache', () => {
  const { g: s, fetches } = withFetch(reply(200, JSON.stringify({ version: '9.0.0', notes: ['Big one'] })));
  const key = s.webAppKey_();
  const u = s.webAppUpdateStatus(key);
  assert.strictEqual(u.updateAvailable, true);
  assert.strictEqual(u.latest, '9.0.0');
  s.webAppUpdateStatus(key);
  assert.strictEqual(fetches(), 1);
  assert.throws(() => s.webAppUpdateStatus('wrong'), /Not authorized/);
});

test('a failed check reports no update instead of an error', () => {
  for (const r of [reply(404, 'Not found'), reply(200, 'not json'), reply(200, '{}'), new Error('offline')]) {
    const { g: s } = withFetch(r);
    const u = s.webAppUpdateStatus(s.webAppKey_());
    assert.strictEqual(u.updateAvailable, false);
    assert.strictEqual(u.current, s.APP_VERSION);
  }
});

test('webAppLoad includes the version', () => {
  const app = createFakeApp({ Master: [['Profile'], ['Weight system', 'Imperial']] });
  const s = loadGas(app.globals);
  assert.strictEqual(s.webAppLoad(s.webAppKey_()).version, s.APP_VERSION);
});
