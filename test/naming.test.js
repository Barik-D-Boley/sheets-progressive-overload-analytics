const test = require('node:test');
const assert = require('node:assert');
const g = require('./load-gas')();

test('default format: sentence-case movement, capitalized equipment tag and detail', () => {
  const f = p => g.formatExerciseName(p);
  assert.strictEqual(f({ movement: 'BENCH PRESS', equipment: 'Barbell' }), 'Bench press (BB)');
  assert.strictEqual(f({ movement: 'tricep pushdowns', equipment: 'Cable', detail: 'rope' }), 'Tricep pushdowns (Cable, Rope)');
  assert.strictEqual(f({ movement: 'romanian deadlifts', equipment: 'DB' }), 'Romanian deadlifts (DB)');
  assert.strictEqual(f({ movement: 'decline press', equipment: 'plate-loaded' }), 'Decline press (PL)');
  assert.strictEqual(f({ movement: 'pull-ups', equipment: 'Bodyweight' }), 'Pull-ups (BW)');
  assert.strictEqual(f({ movement: 'treadmill', detail: '15°' }), 'Treadmill (15°)');
  assert.strictEqual(f({ movement: 'walk' }), 'Walk');
  assert.throws(() => f({ movement: 'x', equipment: 'Kettlebell' }), /Unknown equipment/);
});

test('format is configurable', () => {
  const custom = { template: '{details} {movement}', templateNoDetails: '{movement}', detailSeparator: ' ',
    equipmentTags: { Barbell: 'Barbell', Kettlebell: 'KB' }, properNouns: [] };
  assert.strictEqual(g.formatExerciseName({ movement: 'swings', equipment: 'Kettlebell' }, custom), 'KB Swings');
  assert.strictEqual(g.formatExerciseName({ movement: 'squats', equipment: 'Barbell' }, custom), 'Barbell Squats');
});

test('equipment is read back from a formatted name', () => {
  assert.strictEqual(g.equipmentFromName('Tricep pushdowns (Cable, Rope)'), 'Cable');
  assert.strictEqual(g.equipmentFromName('Bench press (PL)'), 'Plate-loaded');
  assert.strictEqual(g.equipmentFromName('Treadmill (15°)'), '');
});

test('suggested names match existing exercises across spelling differences', () => {
  const known = ['Shoulder press (DB)', 'Chest-supported rows (PL)', 'Reverse-grip curls (DB)', 'Ab crunches (Cable)'];
  const sg = n => g.suggestExerciseName(n, known).name;
  assert.strictEqual(sg('Shoulder presses (DB)'), 'Shoulder press (DB)');
  assert.strictEqual(sg('Chest supported rows (PL)'), 'Chest-supported rows (PL)');
  assert.strictEqual(sg('reverse grip curls (db)'), 'Reverse-grip curls (DB)');
  assert.strictEqual(sg('Ab crunch (cable)'), 'Ab crunches (Cable)');
  assert.strictEqual(sg('Decline pec flys (cable)'), 'Decline pec flys (Cable)');
  assert.strictEqual(g.suggestExerciseName('Pin squats (BB)', known).matched, false);
});
