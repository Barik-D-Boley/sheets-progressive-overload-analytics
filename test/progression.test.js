const test = require('node:test');
const assert = require('node:assert');
const g = require('./load-gas')();

const plain = v => JSON.parse(JSON.stringify(v));
const session = (...sets) => ({ sets: sets.map(([loadValue, reps, rir]) => ({ loadValue, reps, rir: rir === undefined ? null : rir })) });
const bb = g.progressionSettings({ 'rep range': 'Bodybuilding', 'target rir': '1-2', 'load increment': 5, 'stall threshold (sessions)': 3 });

test('warm-up ladder matches the 275 example and skips steps within 10%', () => {
  assert.strictEqual(g.formatWarmup(g.warmupLadder(275, 'lb')), '225×1 · 185×2 · 135×4 · 95×6 · 45×8');
  assert.strictEqual(g.formatWarmup(g.warmupLadder(235, 'lb')), '185×1 · 135×2 · 95×4 · 45×6');
  assert.deepStrictEqual(plain(g.warmupLadder(0, 'lb')), []);
  assert.strictEqual(g.formatWarmup(g.warmupLadder(100, 'kg')), '80×1 · 60×2 · 40×4 · 20×6');
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

test('powerlifting: % of best 1RM, +increment when sets were easy', () => {
  const pl = g.progressionSettings({ 'rep range': 'Powerlifting', 'strength goal': '90-93%', 'target rir': '1-2', 'load increment': 5 });
  const r = g.computeGoals([session([300, 3, '1-2'])], 3, pl);
  assert.deepStrictEqual(plain(r.goals[0]), { load: 295, reps: 3 }); // 1RM 330 x 90% = 297 -> 295
  const easy = g.computeGoals([session([300, 3, '3-4'], [300, 3, '5+'])], 3, pl);
  assert.strictEqual(easy.goals[0].load, 300);
});
