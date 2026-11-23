const test = require('node:test');
const assert = require('node:assert');
const g = require('./load-gas')();

const plain = v => JSON.parse(JSON.stringify(v));
const session = (...sets) => ({ sets: sets.map(([loadValue, reps, rir]) => ({ loadValue, reps, rir: rir === undefined ? null : rir })) });
const dated = (date, ...sets) => Object.assign(session(...sets), { date });
const base = { 'load increment': 5, 'stall threshold (sessions)': 3, 'top set range': '90-93%', 'start of week': 'Monday' };
const bb = g.progressionSettings(base, '', { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2' });

test('warm-up ladder matches the 275 example and skips steps within 10%', () => {
  assert.strictEqual(g.formatWarmup(g.warmupLadder(275, 'lb')), '45×8 · 95×6 · 135×4 · 185×2 · 225×1');
  assert.strictEqual(g.formatWarmup(g.warmupLadder(235, 'lb')), '45×6 · 95×4 · 135×2 · 185×1');
  assert.deepStrictEqual(plain(g.warmupLadder(0, 'lb')), []);
  assert.strictEqual(g.formatWarmup(g.warmupLadder(100, 'kg')), '20×6 · 40×4 · 60×2 · 80×1');
});

test('RIR ranges', () => {
  assert.strictEqual(g.rirLow('1-2'), 1); assert.strictEqual(g.rirHigh('1-2'), 2);
  assert.strictEqual(g.rirLow('5+'), 5); assert.strictEqual(g.rirHigh('5+'), Infinity);
  assert.strictEqual(g.rirLow(''), null);
});

test('no history -> no goals', () => {
  const r = g.computeGoals([], 3, bb);
  assert.deepStrictEqual(plain(r.goals), [null, null, null]);
});

test('double progression: +1 rep on the weakest set', () => {
  const r = g.computeGoals([session([200, 10, '1-2'], [200, 9, '1-2'], [200, 8, '0'])], 3, bb);
  assert.deepStrictEqual(plain(r.goals), [{ load: 200, reps: 10 }, { load: 200, reps: 9 }, { load: 200, reps: 9 }]);
});

test('double progression: top of range on every set -> +increment, reps reset', () => {
  const r = g.computeGoals([session([200, 12, '1-2'], [200, 12, '1-2'], [200, 12, '3-4'])], 3, bb);
  assert.deepStrictEqual(plain(r.goals), [{ load: 205, reps: 8 }, { load: 205, reps: 8 }, { load: 205, reps: 8 }]);
  const notEnoughReserve = g.computeGoals([session([200, 12, '0'], [200, 12, '1-2'])], 2, bb);
  assert.strictEqual(notEnoughReserve.goals[0].load, 200);
});

test('stall: no 1RM gain over 3 sessions -> 10% reset', () => {
  const hist = [session([200, 8]), session([200, 8]), session([200, 8]), session([200, 9])];
  const r = g.computeGoals(hist, 2, bb);
  assert.match(r.reason, /reset/);
  assert.deepStrictEqual(plain(r.goals), [{ load: 180, reps: 8 }, { load: 180, reps: 8 }]);
});

test('the rep range decides the top of the range and the reset reps', () => {
  const pl = g.progressionSettings(base, '', { name: 'Powerlifting', min: 3, max: 6, targetRir: '1-2' });
  const up = g.computeGoals([session([300, 6, '1-2'], [300, 6, '1-2'])], 2, pl);
  assert.deepStrictEqual(plain(up.goals), [{ load: 305, reps: 3 }, { load: 305, reps: 3 }]);
  const custom = g.progressionSettings(base, '2.5', { name: 'Strength-hypertrophy', min: 5, max: 8, targetRir: '0' });
  assert.deepStrictEqual([custom.repMin, custom.repMax, custom.targetRir, custom.increment], [5, 8, '0', 2.5]);
  const r = g.computeGoals([session([100, 8, '0'], [100, 8, '0'])], 2, custom);
  assert.deepStrictEqual(plain(r.goals[0]), { load: 102.5, reps: 5 });
});

test('top set: heaviest load in the increment inside the % range, reps from the formula', () => {
  const ps = g.progressionSettings(base, '', { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2' }, true);
  // 1RM of 225x10 (Epley) = 300 -> 270-279 -> 275; 300 = 275 x (1 + r/30) -> r = 2.7 -> 2
  assert.deepStrictEqual(plain(g.topSetGoal(300, ps)), { load: 275, reps: 2, top: true });
  const narrow = Object.assign({}, ps, { topPctMin: 0.91, topPctMax: 0.92, increment: 10 }); // 273-276: no 10-lb step
  assert.strictEqual(g.topSetGoal(300, narrow).load, 270, 'nearest step to the middle (274.5)');
  assert.deepStrictEqual(plain(g.parsePercentRange_('90-93%')), [0.9, 0.93]);
  assert.deepStrictEqual(plain(g.parsePercentRange_('85%')), [0.85, 0.85]);
  assert.deepStrictEqual(plain(g.parsePercentRange_('')), [0.9, 0.93]);
});

test('top set only on the first session of the week (Monday start); later sessions skip it', () => {
  const ps = g.progressionSettings(base, '', { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2' }, true);
  const hist = [dated('2026-11-19', [225, 10, '1-2'], [225, 10, '1-2'], [225, 9, '1-2'])]; // Thursday last week
  const monday = g.computeGoals(hist, 3, ps, { date: '2026-11-23' });
  // Working sets 2-3 follow last week's sets 1-2 (that session had no top set: set 1 was not heavier).
  assert.deepStrictEqual(plain(monday.goals), [{ load: 275, reps: 2, top: true }, { load: 225, reps: 11 }, { load: 225, reps: 10 }]);
  assert.match(monday.reason, /^Set 1: top set 90-93% of 1RM 300 · \+1 rep on set 2$/);
  // Thursday, after Monday's session (set 1 was the top set): no top set, and Monday's top set is not a working set.
  const withMonday = [dated('2026-11-23', [275, 2, '1-2'], [225, 10, '1-2'], [225, 10, '1-2'])].concat(hist);
  const thursday = g.computeGoals(withMonday, 3, ps, { date: '2026-11-26' });
  assert.ok(thursday.goals.every(x => !x.top));
  assert.deepStrictEqual(plain(thursday.goals.map(x => x.load)), [225, 225, 225]);
  assert.strictEqual(g.weekStartIso_('2026-11-29', 1), '2026-11-23', 'Sunday belongs to the week that started Monday');
  assert.strictEqual(g.weekStartIso_('2026-11-29', 0), '2026-11-29', 'Sunday start');
  const off = g.computeGoals(hist, 3, bb, { date: '2026-11-23' });
  assert.ok(off.goals.every(x => !x.top), 'exercises without Top Set never get one');
});

test('RIR values that Sheets turned into dates are read back as text', () => {
  assert.strictEqual(g.normalizeRir(new Date(2026, 0, 2)), '1-2');
  assert.strictEqual(g.normalizeRir(new Date(2026, 2, 4)), '3-4');
  assert.strictEqual(g.normalizeRir('5+'), '5+');
  assert.strictEqual(g.normalizeRir(0), '0');
  assert.strictEqual(g.progressionSettings({}, '', { name: 'X', min: 8, max: 12, targetRir: new Date(2026, 0, 2) }).targetRir, '1-2');
});
