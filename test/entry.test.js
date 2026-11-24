const test = require('node:test');
const assert = require('node:assert');
const { createFakeApp } = require('./fake-sheets');
const loadGas = require('./load-gas');

function setup() {
  const master = [['Profile', '', '', 'Workouts', '', '', 'Exercises'], ['Birth date', '3/5/2004'], ['Height (in)', '69'],
    ['Current weight', '170'], [], ['Rep range', 'Bodybuilding'], ['1RM Formula', 'Epley'], ['Weight system', 'Imperial'], ['Num of sets', '3']];
  const app = createFakeApp({ 'Workout Entry': [['Workout', '', '', '', '', 'Design philosophy']], Master: master });
  const g = loadGas(app.globals);
  // Registries and history as the migration would leave them.
  g.ensureRegistryEntries('workouts', ['Push']);
  g.ensureRegistryEntries('gyms', ['BYUI', 'Eos']);
  const ex = g.ensureRegistryEntries('exercises', ['Bench press (BB)', 'Lateral raises (DB)', 'Hanging leg raises (DB)', 'Hanging leg raises (BW)'],
    name => [g.equipmentFromName(name), '', '', true, name === 'Bench press (BB)', '', '']);
  const q = g.getOrCreateQuarterSheet('Q4 2026');
  g.appendRows_(q, [
    ['L-old1', new app.globals.Date(Date.UTC(2026, 10, 10)), 'GY-02', 'WO-01', ex['bench press (bb)'], 'lb', '', 'entry', '265x8 @1-2', '265x7', '255x8'],
    ['L-old2', new app.globals.Date(Date.UTC(2026, 10, 13)), 'GY-01', 'WO-01', ex['bench press (bb)'], 'lb', '', 'entry', '275x6 @1-2', '275x5', '265x6'],
    ['L-old3', new app.globals.Date(Date.UTC(2026, 10, 13)), 'GY-01', 'WO-01', ex['lateral raises (db)'], 'lb', '', 'entry', '30x12', '30x11', '30x10'],
  ]);
  g.setupEntryForm();
  const sheet = app.ss.getSheetByName('Workout Entry');
  const edit = (a1, value) => {
    sheet.getRange(a1).setValue(value);
    return g.entryOnEdit({ range: sheet.getRange(a1), value: value === true ? 'TRUE' : value, source: app.ss });
  };
  const type = (weight, reps, extra = {}) => sheet.getRange('B10:B15').setValues([[weight], [reps], [extra.assisted || ''],
    [extra.partial || ''], [extra.rir || ''], [extra.note || '']]);
  return { app, g, sheet, edit, type, ex };
}

test('setup keeps the mockup, seeds the routine, and builds the form', () => {
  const { app, sheet } = setup();
  assert.ok(app.ss.getSheetByName('Workout Entry (old mockup)'), 'old tab renamed, not deleted');
  assert.strictEqual(sheet.getRange('C1').getNote(), 'entry-form-v1');
  const master = app.ss.getSheetByName('Master').data;
  const routineRow = master.find(r => r[26] === 'Push');
  assert.deepStrictEqual(routineRow.slice(27, 29), ['Bench press (BB)', 'Lateral raises (DB)'], 'seeded from last session order');
  assert.ok(master.some(r => r[0] === 'Target RIR'), 'missing settings appended');
  assert.ok(sheet.hiddenRows.has(22) && sheet.hiddenRows.has(33), 'cardio and new-exercise blocks hidden');
  assert.strictEqual(sheet.getRange('B11').getValue(), '');
});

test('a workout: last/goal/warm-up, set-by-set entry, save on move, ✓ in dropdown, finish', () => {
  const { app, g, sheet, edit, type } = setup();
  edit('B1', 'BYUI');
  edit('A2', 'Push');
  assert.strictEqual(sheet.value('A4'), 'Bench press (BB)');
  assert.strictEqual(sheet.value('A6'), 'SET 1 of 3');
  assert.strictEqual(sheet.value('A7'), 'Last · 11/13 BYUI', 'same gym preferred');
  assert.strictEqual(sheet.value('B7'), '275 x 6 @1-2');
  assert.strictEqual(sheet.value('B8'), '275x6  (+1 rep on set 2)', 'last: 275x6, 275x5, 265x6 -> set 2 is weakest');
  assert.strictEqual(sheet.value('B9'), '225×1 · 185×2 · 135×4 · 95×6 · 45×8');

  type(275, 7, { rir: new app.globals.Date(2026, 0, 2), note: 'paused' }); // Sheets stores "1-2" as Jan 2
  edit('B17', true);
  assert.strictEqual(sheet.value('B17'), false, 'button unchecked');
  assert.strictEqual(sheet.value('A6'), 'SET 2 of 3');
  assert.strictEqual(sheet.value('B10'), 275, 'weight carried to the next set');
  assert.strictEqual(sheet.value('B9'), '', 'warm-up only on set 1');

  type(275, '', {});
  edit('B17', true);
  assert.match(sheet.value('A19'), /reps/, 'invalid set is reported');
  assert.strictEqual(sheet.value('B10'), 275, 'form kept after a failed set');

  type(275, 6, { assisted: 1 });
  edit('B17', true);
  type(265, 7, { partial: 2, rir: '0' });
  edit('B17', true);

  const q = app.ss.getSheetByName('Q4 2026');
  const saved = q.data.find(r => r[7] === 'entry' && r[0] !== 'L-old1' && r[0] !== 'L-old2' && r[0] !== 'L-old3');
  assert.deepStrictEqual(saved.slice(2, 11), ['GY-01', 'WO-01', 'EX-0001', 'lb', 'S1: paused', 'entry', '275x7 @1-2', '275x6 a1', '265x7 p2 @0']);
  assert.strictEqual(sheet.value('A4'), 'Lateral raises (DB)', 'moved to the next exercise');
  assert.match(sheet.value('A19'), /Saved Bench press/);
  const options = sheet.validations.A4.list;
  assert.ok(options.includes('✓ Bench press (BB)'), 'done exercises are checked in the dropdown');
  assert.ok(options.includes('Hanging leg raises (DB)') && options.includes('+ New exercise…'));

  // Back reopens the saved exercise; Next rewrites the same record instead of adding one.
  edit('B16', true);
  assert.strictEqual(sheet.value('A4'), '✓ Bench press (BB)');
  assert.strictEqual(sheet.value('A6'), 'SET 3 of 3');
  type(265, 8, { rir: '0' });
  edit('B17', true);
  assert.strictEqual(q.data.filter(r => r[4] === 'EX-0001').length, 3, 'still one new bench record');
  assert.strictEqual(q.data.find(r => r[0] === saved[0])[10], '265x8 @0');

  // Jump to an exercise outside the routine; all-zero hanging leg raises save as the BW variant.
  edit('A4', 'Hanging leg raises (DB)');
  assert.strictEqual(sheet.value('B2'), 'Exercise 3 of 3');
  for (const reps of [12, 10, 8]) { type(0, reps); edit('B17', true); }
  const hlr = q.data.find(r => r[4] === 'EX-0004');
  assert.ok(hlr, 'saved as Hanging leg raises (BW)');

  edit('B18', true);
  assert.match(sheet.value('A19'), /Workout saved: 2 exercises, 6 sets/);
  assert.strictEqual(sheet.value('A4'), '');
});

test('setup notes are saved with the exercise; new exercise creator formats the name', () => {
  const { app, sheet, edit, type } = setup();
  edit('A2', 'Push');
  edit('B5', 'Bench pins 28, seat 2');
  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(master[2][13], 'Bench pins 28, seat 2');

  edit('A4', '+ New exercise…');
  assert.ok(!sheet.hiddenRows.has(32) && sheet.hiddenRows.has(10), 'new-exercise block shown, lifting hidden');
  edit('B32', 'incline bench press');
  edit('B33', 'Smith machine');
  assert.strictEqual(sheet.value('B37'), 'Incline bench press (Smith)');
  sheet.getRange('B35').setValue(true);
  edit('B38', true);
  assert.strictEqual(sheet.value('A4'), 'Incline bench press (Smith)');
  const row = app.ss.getSheetByName('Master').data.find(r => r[7] === 'Incline bench press (Smith)');
  assert.deepStrictEqual(row.slice(8, 13), ['Smith machine', '', '', true, true]);
  assert.strictEqual(sheet.value('A6'), 'SET 1 of 3');
  assert.strictEqual(sheet.value('B7'), 'First time');
});

test('cardio logs to the Cardio tab with units from the last time', () => {
  const { app, sheet, edit } = setup();
  edit('B1', 'Eos');
  edit('B3', true);
  assert.ok(!sheet.hiddenRows.has(22));
  edit('B22', 'Treadmill (15°)');
  assert.strictEqual(sheet.value('C24'), 'mph');
  sheet.getRange('B23:B27').setValues([[30], [3.1], [1.6], [350], ['']]);
  edit('B28', true);
  const cardio = app.ss.getSheetByName('Cardio').data;
  assert.deepStrictEqual(cardio[1].slice(2, 12), ['GY-02', 'CA-01', 30, 3.1, 'mph', 1.6, 'mi', 350, '', 'entry']);
  assert.ok(sheet.hiddenRows.has(22), 'back to lifting');
});
