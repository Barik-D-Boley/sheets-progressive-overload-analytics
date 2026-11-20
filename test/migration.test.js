const test = require('node:test');
const assert = require('node:assert');
const { createFakeApp } = require('./fake-sheets');
const loadGas = require('./load-gas');

function setup() {
  const legacy = [
    ['Push', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '', 'Pull', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '', 'Legs', 'Exercises', 'Set 1', 'Set 2', 'Set 3', '', 'Cardio // Abs', 'Exercises', 'T', 'S', 'D', '165 lbs'],
    ['12/30/25', 'Barbell bench', '205 for 3', '185 for 8', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '1/2/26', 'Stair master', '10 min', '7 speed', '41 floors'],
    ['BYUI', 'Pullups', '-70 for 7.5', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'BYUI'],
    ['', 'Mystery move', '50 for 5'],
    ['', 'Dips', '295 for 5 (neg)'],
  ];
  const master = [['Profile', '', '', 'Workouts', '', '', 'Exercises'], ['Birth date', '3/5/2004'], ['Height (in)', '69'],
    ['Current weight', '170'], [], ['Rep range', 'Custom'], ['1RM Formula', 'Epley'], ['Weight system', 'Imperial'], ['Num of sets', '3']];
  const app = createFakeApp({ 'All Data - Unorganized': legacy, Master: master });
  const g = loadGas(app.globals);
  return { app, g };
}

test('review -> preview -> import writes registries, quarter tabs, cardio, bodyweight; re-runs are blocked', () => {
  const { app, g } = setup();
  g.migrationBuildReview();
  const review = app.ss.getSheetByName('Migration Review');
  const rows = review.data.slice(1);
  assert.strictEqual(rows.length, 5);
  const mystery = rows.find(r => r[0] === 'Mystery move');
  assert.strictEqual(mystery[5], false, 'unknown names start unapproved');
  rows.forEach(r => { if (r[0] !== 'Mystery move') r[5] = true; });

  g.migrationPreview();
  const preview = app.ss.getSheetByName('Migration Preview').data;
  assert.strictEqual(preview[1][1], 3, 'ready: bench, pullups, stair master');
  g.migrationImport();

  const q4 = app.ss.getSheetByName('Q4 2025');
  assert.ok(q4 && q4.hidden, 'Q4 2025 created hidden');
  assert.deepStrictEqual(q4.data[0], ['Record ID', 'Date', 'Gym ID', 'Workout ID', 'Exercise ID', 'Unit', 'Notes', 'Source', 'Set 1', 'Set 2', 'Set 3']);
  assert.strictEqual(q4.data.length, 4, 'bench, pullups, dips (flagged) - mystery blocked');
  const bench = q4.data.find(r => r[7] === 'legacy:B2');
  assert.deepStrictEqual(bench.slice(2, 6).concat(bench.slice(8, 10)), ['GY-01', 'WO-01', bench[4], 'lb', '205x3', '185x8']);
  assert.match(bench[4], /^EX-\d{4}$/);
  assert.strictEqual(q4.data.find(r => r[7] === 'legacy:B5')[8], '295 for 5 (neg)', 'flagged cell kept verbatim');

  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(master[1][6], 'Exercise ID');
  assert.strictEqual(master[1][8], 'Equipment');
  assert.strictEqual(master[2][8], 'Barbell', 'equipment read from the name tag');
  assert.strictEqual(master[1][22], 'Cardio ID'); assert.strictEqual(master[2][23], 'Stairmaster');
  assert.ok(!master.some(r => r[7] === 'Stairmaster'), 'cardio is not in the exercise list');
  assert.strictEqual(master[2][16], 'WO-01'); assert.strictEqual(master[2][17], 'Push');
  assert.strictEqual(master[2][19], 'GY-01'); assert.strictEqual(master[2][20], 'BYUI');
  assert.strictEqual(master[8][1], '3', 'settings untouched');

  const cardio = app.ss.getSheetByName('Cardio').data;
  assert.strictEqual(cardio.length, 2);
  assert.deepStrictEqual(cardio[1].slice(3, 9), ['CA-01', 10, 7, 'level', 41, 'floors']);
  const bw = app.ss.getSheetByName('Bodyweight Log').data;
  assert.deepStrictEqual(bw[1].slice(1, 4), [165, 'lb', 'legacy:X1']);

  assert.ok(app.store.LEGACY_IMPORT_DONE);
  g.migrationImport();
  assert.strictEqual(q4.data.length, 4, 'second run does nothing');
  assert.match(app.alerts[app.alerts.length - 1][0], /already completed/);
});

test('partial-failure recovery: rewriting the same plan skips rows already present', () => {
  const { app, g } = setup();
  g.migrationBuildReview();
  app.ss.getSheetByName('Migration Review').data.slice(1).forEach(r => { r[5] = true; r[3] = r[3] || 'Mystery Move'; });
  const plan = g.buildPlanFromSheet_();
  g.writeMigrationPlan_(plan);
  const again = g.writeMigrationPlan_(plan);
  assert.strictEqual(again.lifts, 0); assert.strictEqual(again.cardio, 0); assert.strictEqual(again.bodyweights, 0);
  assert.ok(again.duplicates > 0);
  assert.strictEqual(app.ss.getSheetByName('Master').data.filter(r => r[20] === 'BYUI').length, 1, 'no duplicate registry entries');
});

test('new spellings get a suggested name and sort next to their match', () => {
  const { app, g } = setup();
  const legacy = app.ss.getSheetByName('All Data - Unorganized');
  legacy.data.push(['', 'Shoulder presses (DB)', '60 for 8'], ['', 'Pin squats (BB)', '225 for 5'], ['', 'Reverse grip curls (DB)', '30 for 10']);
  g.migrationBuildReview();
  const rows = app.ss.getSheetByName('Migration Review').data.slice(1);
  const byName = Object.fromEntries(rows.map(r => [r[0], r]));
  assert.deepStrictEqual(byName['Shoulder presses (DB)'].slice(3, 7), ['Shoulder press (DB)', 'lift', false, 'New spelling - matches an existing exercise']);
  assert.deepStrictEqual(byName['Reverse grip curls (DB)'].slice(3, 4), ['Reverse-grip curls (DB)']);
  assert.deepStrictEqual(byName['Pin squats (BB)'].slice(3, 7), ['Pin squats (BB)', 'lift', false, 'New exercise - check the name']);
  assert.deepStrictEqual(byName['Mystery move'].slice(3, 4), ['Mystery move']);
  const order = rows.map(r => r[3]);
  assert.deepStrictEqual(order, order.slice().sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0), 'sorted by approved name');

  // A tab from an earlier run with blank names gets suggestions filled in; approvals are kept.
  const review = app.ss.getSheetByName('Migration Review');
  review.data.forEach((r, i) => { if (i && r[0] === 'Pin squats (BB)') { r[3] = ''; r[6] = 'New name - choose an exercise'; } if (i && r[0] === 'Barbell bench') r[5] = true; });
  g.migrationBuildReview();
  const again = Object.fromEntries(app.ss.getSheetByName('Migration Review').data.slice(1).map(r => [r[0], r]));
  assert.strictEqual(again['Pin squats (BB)'][3], 'Pin squats (BB)');
  assert.strictEqual(again['Barbell bench'][5], true);
});
