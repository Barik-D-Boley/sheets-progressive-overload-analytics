const test = require('node:test');
const assert = require('node:assert');
const g = require('./load-gas')();

test('evaluates plate expressions, keeping them as written', () => {
  assert.strictEqual(g.evalLoadExpr('2*45+25'), 115);
  assert.strictEqual(g.evalLoadExpr('45*2+25'), 115);
  assert.strictEqual(g.evalLoadExpr('17.5+2.5*4'), 27.5);
  assert.strictEqual(g.evalLoadExpr('-70'), -70);
  assert.strictEqual(g.evalLoadExpr('85(?)'), null);
});

test('packed set cells round-trip', () => {
  const set = { load: '2*45+25', reps: 10, assisted: 1, partial: 2, rir: 1, rpe: null };
  const text = g.formatSetCell(set);
  assert.strictEqual(text, '2*45+25x10 a1 p2 @1');
  const back = g.parseSetCell(text);
  assert.deepStrictEqual({ ...back }, { load: '2*45+25', loadValue: 115, reps: 10, assisted: 1, partial: 2, rir: 1, rpe: null });
  assert.strictEqual(g.parseSetCell('-70x7.5').loadValue, -70);
  assert.strictEqual(g.parseSetCell('185x6 @rpe8').rpe, 8);
  assert.strictEqual(g.parseSetCell('295 for 5 (neg)'), null);
  assert.strictEqual(g.parseSetCell(''), null);
});

test('legacy set cells: +N assisted, negatives, unsure weights, reversed numbers, unknown reps', () => {
  const set = t => ({ ...g.parseLegacySetCell(t).set });
  assert.deepStrictEqual(set('120 for 10+1'), { load: '120', loadValue: 120, reps: 10, assisted: 1, partial: 0, rir: null, rpe: null });
  assert.strictEqual(g.parseLegacySetCell('-80 for 7.5').set.reps, 7.5);
  assert.strictEqual(g.parseLegacySetCell('2*45+25 for 14').set.load, '2*45+25');
  assert.strictEqual(g.formatSetCell(g.parseLegacySetCell('295 for 5 (neg)').set), '295x0 a5');
  assert.strictEqual(g.parseLegacySetCell('295 for 5 (neg)').note, 'negatives (assisted up)');
  assert.strictEqual(g.formatSetCell(g.parseLegacySetCell('85(?) for 10').set), '85x10');
  assert.strictEqual(g.parseLegacySetCell('85(?) for 10').note, 'unsure weight');
  assert.strictEqual(g.formatSetCell(g.parseLegacySetCell('12 for -24').set), '-24x12');
  assert.strictEqual(g.parseLegacySetCell('45*2+25 for ?').ignore, 'reps unknown');
  assert.strictEqual(g.parseLegacySetCell('3*45+25').ignore, 'reps unknown');
  assert.ok(g.parseLegacySetCell('315 for 26 sec').flag, 'timed holds stay flagged');
  assert.ok(g.parseLegacySetCell('banana').flag);
});

test('legacy cardio cells', () => {
  const c = g.parseLegacyCardioCells(['1 hour 30 min', '3.7 mph', '5.61 miles']);
  assert.strictEqual(c.durationMin, 90); assert.strictEqual(c.speed, 3.7); assert.strictEqual(c.distanceUnit, 'mi');
  const s = g.parseLegacyCardioCells(['10 min', '7 speed', '41 floors']);
  assert.strictEqual(s.speedUnit, 'level'); assert.strictEqual(s.distance, 41); assert.strictEqual(s.distanceUnit, 'floors');
  const even = g.parseLegacyCardioCells(['12 min', '6/7 speed', '47 floors']);
  assert.strictEqual(even.flags.length, 0); assert.strictEqual(even.speed, 6.5); assert.strictEqual(even.durationMin, 12);
  const split = g.parseLegacyCardioCells(['10/2 min', '7/9 speed', '66 floors']);
  assert.strictEqual(split.durationMin, 12); assert.strictEqual(split.speed, 7.33); assert.strictEqual(split.speedUnit, 'level');
  assert.strictEqual(g.parseLegacyCardioCells(['fast']).flags.length, 1);
});

test('1RM: Epley default, 12-rep cap, assisted loads are 0, display rounding', () => {
  assert.strictEqual(g.estimateOneRepMax(200, 1), 200);
  assert.strictEqual(g.estimateOneRepMax(100, 15), g.estimateOneRepMax(100, 12));
  assert.strictEqual(g.estimateOneRepMax(-70, 8), 0);
  assert.ok(Math.abs(g.estimateOneRepMax(100, 10, 'Brzycki') - 133.33) < 0.01);
  assert.throws(() => g.estimateOneRepMax(100, 5, 'Nope'));
  assert.strictEqual(g.formatOneRepMax(57.26), 57.3);
  assert.strictEqual(g.formatOneRepMax(233.4), 233);
});

test('quarter tab names', () => {
  assert.strictEqual(g.quarterTabName('2026-03-31'), 'Q1 2026');
  assert.strictEqual(g.quarterTabName('2026-11-20'), 'Q4 2026');
});
