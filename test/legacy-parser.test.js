const test = require('node:test');
const assert = require('node:assert');
const g = require('./load-gas')();

// Mirrors the real legacy layout: early rows use one column spacing, later rows shift right.
const header = ['Push', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '', 'Pull', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '',
  'Legs', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '', 'Cardio // Abs', 'Exercises', 'Set 1 // Time', 'Set 2 // Speed', 'Set 3 // Dist.', '165 lbs'];
const grid = [
  header,
  ['9/22/25', 'Barbell bench', '205 for 3', '185 for 8', '', '', '9/26/25', 'Cable rows', '60 for 10', '', '', '', '', '', '', '', '', '', '3/6/26', 'Treadmill (15°)', '30 min', '3 mph', '1.5 miles', '374 cal'],
  ['BYUI', 'Pullups', '-70 for 7.5', '', '', '', 'BYUI', 'Dumbell curls', '30 for 9', '', '', '', '', '', '', '', '', '', 'BYUI'],
  ['Deload', 'Dips', '0 for 10', '', '', '', '', 'Hammer curls', '40 for 7+1'],
  [],
  ['6/15/26', 'Bench press (BB)', '225 for 6', '', '', '', '', '6/16/26', 'Pull-ups', '35 for 11', '', '', '', '', '6/17/26', 'Leg press', '5*45+25 for 12'],
  ['Lodge', 'Lateral raises (DB)', '30 for 10.5', '', '', '', '', '5/9/26, Eos', 'Cable rows', '90 for 11', '', '', '', '', 'Lodge', 'Nordic hamstring'],
];

test('parses both layouts, gyms, notes, calories, bodyweight', () => {
  const p = g.parseLegacyGrid(grid, { today: '2026-11-20' });
  const by = Object.fromEntries(p.entries.map(e => [e.ref, e]));
  assert.strictEqual(by.B2.date, '2025-09-22'); assert.strictEqual(by.B2.gym, 'BYUI');
  assert.strictEqual(by.B3.legacyName, 'Pullups'); assert.strictEqual(by.B3.gym, 'BYUI');
  assert.deepStrictEqual([...by.B4.sessionNotes], ['Deload']);
  assert.strictEqual(by.T2.gym, 'BYUI', 'lone gym cell under the cardio date');
  assert.strictEqual(by.T2.calories, 374);
  assert.strictEqual(by.I6.block, 'Pull'); assert.strictEqual(by.I6.date, '2026-06-16');
  assert.strictEqual(by.P6.block, 'Legs'); assert.strictEqual(by.P6.gym, 'Lodge');
  assert.strictEqual(by.P7.legacyName, 'Nordic hamstring'); assert.strictEqual(by.P7.cells.length, 0);
  assert.strictEqual(by.I7.date, '2026-05-09', 'combined "date, gym" anchor'); assert.strictEqual(by.I7.gym, 'Eos');
  assert.ok(by.I7.dateIssue, 'earlier than the previous Pull date');
  assert.deepStrictEqual([...p.bodyweights.map(b => b.weight)], [165]);
  assert.strictEqual(p.flags.length, 0);
});

test('unweightedName applies only when every set has 0 load', () => {
  const p = g.parseLegacyGrid([header,
    ['8/1/26', 'Hanging leg raises', '0 for 10', '0 for 5'],
    ['', 'Hanging leg raises', '5 for 12', '0 for 10'],
  ], { today: '2026-11-20' });
  const map = { 'hanging leg raises': { name: 'Hanging leg raises (DB)', unweightedName: 'Hanging leg raises (BW)', type: 'lift' } };
  const plan = g.buildMigrationPlan(p, map, {});
  assert.deepStrictEqual(plan.lifts.map(l => l.exercise).join('|'), 'Hanging leg raises (BW)|Hanging leg raises (DB)');
});

test('future dates are reported', () => {
  const p = g.parseLegacyGrid([header, ['8/27/27', 'Dips', '0 for 10']], { today: '2026-11-20' });
  assert.match(p.entries[0].dateIssue, /future/);
});

test('plan statuses: ready, flagged (kept verbatim), blocked, skipped, cardio', () => {
  const p = g.parseLegacyGrid(grid.concat([['', 'Mystery move', '50 for 5'], ['', 'Abs', ''], ['', 'Dips', '295 for 5 (neg)']]), { today: '2026-11-20' });
  const map = {};
  for (const [k, name, type] of [['barbell bench', 'Bench Press (BB)'], ['pullups', 'Pull-Ups'], ['dips', 'Dips'], ['cable rows', 'Seated Cable Rows'],
    ['dumbell curls', 'Dumbbell Curls'], ['hammer curls', 'Hammer Curls (DB)'], ['bench press (bb)', 'Bench Press (BB)'], ['pull-ups', 'Pull-Ups'],
    ['leg press', 'PL Leg Press'], ['lateral raises (db)', 'Lateral Raises (DB)'], ['nordic hamstring', 'Nordic Hamstring Curls'],
    ['treadmill (15°)', 'Treadmill (15° Incline)', 'cardio'], ['abs', '', 'skip']]) map[k] = { name, type: type || 'lift' };
  const plan = g.buildMigrationPlan(p, map, { unit: 'lb' });
  const lift = ref => plan.lifts.find(l => l.ref === ref);
  assert.deepStrictEqual([...lift('B2').sets], ['205x3', '185x8']);
  assert.deepStrictEqual([...lift('H4').sets], ['40x7 a1']);
  assert.deepStrictEqual([...lift('P6').sets], ['5*45+25x12']);
  assert.strictEqual(lift('P7'), undefined, 'no sets recorded -> skipped');
  assert.ok(plan.issues.some(i => i.status === 'skipped' && i.ref === 'P7'));
  const neg = plan.lifts.find(l => l.sets[0] === '295x0 a5');
  assert.strictEqual(neg.status, 'ready');
  assert.match(neg.notes, /Legacy: S1 "295 for 5 \(neg\)" \(negatives \(assisted up\)\)/);
  assert.ok(plan.issues.some(i => i.status === 'blocked' && /Mystery move/.test(i.message)));
  assert.ok(plan.issues.some(i => i.status === 'blocked' && i.ref === 'I7'));
  assert.strictEqual(plan.counts.skipped, 2, 'Abs (skip) and Nordic hamstring (no sets)');
  assert.strictEqual(plan.cardio[0].durationMin, 30); assert.strictEqual(plan.cardio[0].calories, 374);
  assert.strictEqual(plan.bodyweights[0].date, '2025-09-22');
});
