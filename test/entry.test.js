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
  assert.strictEqual(sheet.getRange('C1').getNote(), 'entry-form-v2');
  const master = app.ss.getSheetByName('Master').data;
  const routineRow = master.find(r => r[26] === 'Push');
  assert.deepStrictEqual(routineRow.slice(27, 30), ['Push', 'Bench press (BB)', 'Lateral raises (DB)'], 'seeded from last session order');
  assert.deepStrictEqual(master[1].slice(26, 29), ['Routine', 'Workout', 'Exercise 1']);
  assert.ok(master.some(r => r[0] === 'Target RIR'), 'missing settings appended');
  assert.ok(sheet.hiddenRows.has(24) && sheet.hiddenRows.has(35), 'cardio and new-exercise blocks hidden');
  assert.strictEqual(sheet.getRange('B11').getValue(), '');
});

test('a workout: last/goal/warm-up, set-by-set entry, save on move, ✓ in dropdown, finish', () => {
  const { app, g, sheet, edit, type } = setup();
  edit('B2', 'BYUI');
  edit('B3', 'Push');
  assert.strictEqual(sheet.value('B4'), 'Bench press (BB)');
  assert.strictEqual(sheet.value('A4'), 'Exercise (1 of 2)');
  assert.deepStrictEqual(['A1', 'A2', 'A3'].map(a => sheet.value(a)), ['Date', 'Gym', 'Routine'], 'labels in column A');
  assert.strictEqual(sheet.value('A6'), 'SET 1 of 3');
  assert.strictEqual(sheet.value('A7'), 'Last · 11/13/26 BYUI', 'same gym preferred, with the year');
  assert.strictEqual(sheet.value('B7'), '275 x 6 @1-2');
  assert.strictEqual(sheet.value('B8'), '275x6  (+1 rep on set 2)', 'last: 275x6, 275x5, 265x6 -> set 2 is weakest');
  assert.strictEqual(sheet.value('B9'), '225×1 · 185×2 · 135×4 · 95×6 · 45×8');

  type(275, 7, { rir: '1-2', note: 'paused' });
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
  assert.strictEqual(sheet.value('B4'), 'Lateral raises (DB)', 'moved to the next exercise');
  assert.match(sheet.value('A19'), /Saved Bench press/);
  const options = sheet.validations.B4.list;
  assert.ok(options.includes('✓ Bench press (BB)'), 'done exercises are checked in the dropdown');
  assert.ok(options.includes('Hanging leg raises (DB)') && options.includes('+ New exercise…'));

  // Back reopens the saved exercise; Next rewrites the same record instead of adding one.
  edit('B16', true);
  assert.strictEqual(sheet.value('B4'), '✓ Bench press (BB)');
  assert.strictEqual(sheet.value('A6'), 'SET 3 of 3');
  type(265, 8, { rir: '0' });
  edit('B17', true);
  assert.strictEqual(q.data.filter(r => r[4] === 'EX-0001').length, 3, 'still one new bench record');
  assert.strictEqual(q.data.find(r => r[0] === saved[0])[10], '265x8 @0');

  // Jump to an exercise outside the routine; all-zero hanging leg raises save as the BW variant.
  edit('B4', 'Hanging leg raises (DB)');
  assert.strictEqual(sheet.value('A4'), 'Exercise (3 of 3)');
  for (const reps of [12, 10, 8]) { type(0, reps); edit('B17', true); }
  const hlr = q.data.find(r => r[4] === 'EX-0004');
  assert.ok(hlr, 'saved as Hanging leg raises (BW)');

  edit('B18', true);
  assert.match(sheet.value('A19'), /Workout saved: 2 exercises, 6 sets/);
  assert.strictEqual(sheet.value('B4'), '');
});

test('setup notes are saved with the exercise; new exercise creator formats the name', () => {
  const { app, sheet, edit, type } = setup();
  edit('B3', 'Push');
  edit('B5', 'Bench pins 28, seat 2');
  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(master[2][13], 'Bench pins 28, seat 2');

  edit('B4', '+ New exercise…');
  assert.ok(!sheet.hiddenRows.has(34) && sheet.hiddenRows.has(10), 'new-exercise block shown, lifting hidden');
  edit('B34', 'incline bench press');
  edit('B35', 'Smith machine');
  assert.strictEqual(sheet.value('B39'), 'Incline bench press (Smith)');
  sheet.getRange('B37').setValue(true);
  edit('B40', true);
  assert.strictEqual(sheet.value('B4'), 'Incline bench press (Smith)');
  const row = app.ss.getSheetByName('Master').data.find(r => r[7] === 'Incline bench press (Smith)');
  assert.deepStrictEqual(row.slice(8, 13), ['Smith machine', '', '', true, true]);
  assert.strictEqual(sheet.value('A6'), 'SET 1 of 3');
  assert.strictEqual(sheet.value('B7'), 'First time');
});

test('cardio logs to the Cardio tab with units from the last time', () => {
  const { app, sheet, edit } = setup();
  edit('B2', 'Eos');
  edit('B20', true);
  assert.ok(!sheet.hiddenRows.has(24));
  edit('B24', 'Treadmill (15°)');
  assert.strictEqual(sheet.value('C26'), 'mph');
  sheet.getRange('B25:B29').setValues([[30], [3.1], [1.6], [350], ['']]);
  edit('B30', true);
  const cardio = app.ss.getSheetByName('Cardio').data;
  assert.deepStrictEqual(cardio[1].slice(2, 12), ['GY-02', 'CA-01', 30, 3.1, 'mph', 1.6, 'mi', 350, '', 'entry']);
  assert.ok(sheet.hiddenRows.has(24), 'back to lifting');
});

test('an existing routines table in the old layout is converted, and routines record their workout', () => {
  const master = [['Profile'], ['Weight system', 'Imperial'], ['Num of sets', '1']];
  const app = createFakeApp({ 'Workout Entry': [[]], Master: master });
  const g = loadGas(app.globals);
  g.ensureRegistryEntries('workouts', ['Push']);
  g.ensureRegistryEntries('exercises', ['Bench press (BB)', 'Dips (BW)']);
  const m = app.ss.getSheetByName('Master');
  m.getRange(1, 27).setValue('Routines (edit to change a workout template)');
  m.getRange(2, 27, 1, 3).setValues([['Workout', 'Exercise 1', 'Exercise 2']]);
  m.getRange(3, 27, 2, 3).setValues([['Push', 'Bench press (BB)', 'Dips (BW)'], ['Cardio/Abs', 'Dips (BW)', '']]);
  g.setupEntryForm();
  assert.deepStrictEqual(m.getRange(2, 27, 3, 4).getValues(), [
    ['Routine', 'Workout', 'Exercise 1', 'Exercise 2'],
    ['Push', 'Push', 'Bench press (BB)', 'Dips (BW)'],
    ['Cardio/Abs', 'Cardio/Abs', 'Dips (BW)', '']]);

  m.getRange(5, 27, 1, 3).setValues([['Push Day 2', 'Push', 'Dips (BW)']]);
  const sheet = app.ss.getSheetByName('Workout Entry');
  const edit = (a1, value) => { sheet.getRange(a1).setValue(value); g.entryOnEdit({ range: sheet.getRange(a1), value: value === true ? 'TRUE' : value }); };
  edit('B2', 'BYUI');
  edit('B3', 'Push Day 2');
  assert.strictEqual(sheet.value('B4'), 'Dips (BW)');
  if (!sheet.hiddenRows.has(45)) edit('B47', true); // dismiss the weigh-in prompt
  sheet.getRange('B10:B11').setValues([[0], [12]]);
  edit('B17', true);
  const q = app.ss.getSheetByName('Q4 2026').data;
  assert.strictEqual(q[1][3], 'WO-01', 'saved under the Push workout, not a new "Push Day 2" workout');
});

test('free weights use every gym; machines use the current gym first (Same Gym Only)', () => {
  const { app, g, sheet, edit } = setup();
  const ids = g.ensureRegistryEntries('exercises', ['Pec flys (Machine)'], () => ['Machine', '', '', true, false, '', '']);
  const pec = ids['pec flys (machine)'];
  g.appendRows_(app.ss.getSheetByName('Q4 2026'), [
    ['L-p1', new app.globals.Date(Date.UTC(2026, 10, 12)), 'GY-02', 'WO-01', pec, 'lb', '', 'entry', '150x10', '150x9', '150x8'],
    ['L-p2', new app.globals.Date(Date.UTC(2026, 10, 15)), 'GY-01', 'WO-01', pec, 'lb', '', 'entry', '200x10', '200x9', '200x8'],
  ]);
  g.setupEntryForm(); // fills the Same Gym Only boxes from equipment
  const master = app.ss.getSheetByName('Master').data;
  const flag = name => master.find(r => r[7] === name)[15];
  assert.strictEqual(flag('Bench press (BB)'), false);
  assert.strictEqual(flag('Pec flys (Machine)'), true);

  edit('B2', 'Eos');
  edit('B3', 'Push');
  if (!sheet.hiddenRows.has(45)) edit('B47', true);
  assert.strictEqual(sheet.value('A7'), 'Last · 11/13/26 BYUI', 'bench (BB): latest session at any gym');
  edit('B4', 'Pec flys (Machine)');
  assert.strictEqual(sheet.value('A7'), 'Last · 11/12/26 Eos', 'machine: this gym only');
  assert.match(sheet.value('B8'), /^150x/, 'goal based on this gym');
  edit('B2', 'BYUI');
  assert.strictEqual(sheet.value('A7'), 'Last · 11/15/26 BYUI');

  // Unchecking the box makes a machine compare across gyms.
  const row = master.findIndex(r => r[7] === 'Pec flys (Machine)');
  master[row][15] = false;
  edit('B2', 'Eos');
  assert.strictEqual(sheet.value('A7'), 'Last · 11/15/26 BYUI');
});

test('exercise and cardio lists stay sorted A-Z; IDs and row data move together', () => {
  const { app, g, sheet, edit } = setup();
  const master = app.ss.getSheetByName('Master').data;
  const names = () => master.slice(2).map(r => r[7]).filter(Boolean);
  assert.deepStrictEqual(names(), ['Bench press (BB)', 'Hanging leg raises (BW)', 'Hanging leg raises (DB)', 'Lateral raises (DB)']);
  const bench = master.find(r => r[7] === 'Bench press (BB)');
  assert.strictEqual(bench[6], 'EX-0001'); assert.strictEqual(bench[12], true, 'warm-up box moved with its row');

  edit('B4', '+ New exercise…');
  edit('B34', 'face pulls'); edit('B35', 'Cable');
  edit('B40', true);
  assert.deepStrictEqual(names(), ['Bench press (BB)', 'Face pulls (Cable)', 'Hanging leg raises (BW)', 'Hanging leg raises (DB)', 'Lateral raises (DB)']);
  assert.strictEqual(master.find(r => r[7] === 'Face pulls (Cable)')[6], 'EX-0005', 'new exercise keeps the next ID');

  g.ensureRegistryEntries('cardio', ['Walk', 'Stairmaster', 'Treadmill (15%)'], () => [true]);
  assert.deepStrictEqual(master.slice(2).map(r => r[23]).filter(Boolean), ['Stairmaster', 'Treadmill (15%)', 'Walk']);
});

test('a name typed straight into Master gets the next ID, defaults, and a sorted place', () => {
  const { app, g } = setup();
  const m = app.ss.getSheetByName('Master');
  const last = m.getLastRow();
  m.getRange(last + 1, 8).setValue('Cable crossovers (Cable)'); // Name column only (H)
  g.registryOnEdit({ range: m.getRange(last + 1, 8) });
  const row = m.data.find(r => r[7] === 'Cable crossovers (Cable)');
  assert.deepStrictEqual(row.slice(6, 9), ['EX-0005', 'Cable crossovers (Cable)', 'Cable']);
  assert.deepStrictEqual([row[11], row[12], row[15]], [true, false, true], 'Active, Warm-up off, Same Gym Only for cables');
  assert.strictEqual(m.data.slice(2).map(r => r[7]).filter(Boolean)[1], 'Cable crossovers (Cable)', 'sorted into place');
  assert.strictEqual(g.registryOnEdit({ range: m.getRange(1, 1) }), false, 'other Master edits are ignored');
  const benchRow = m.data.findIndex(r => r[7] === 'Bench press (BB)') + 1;
  m.getRange(benchRow, 8).setValue('Zercher squats (BB)');
  g.registryOnEdit({ range: m.getRange(benchRow, 8) });
  const list = m.data.slice(2).map(r => r[7]).filter(Boolean);
  assert.strictEqual(list[list.length - 1], 'Zercher squats (BB)', 'a rename re-sorts');
  assert.strictEqual(m.data.find(r => r[7] === 'Zercher squats (BB)')[6], 'EX-0001', 'and keeps its ID');

  m.getRange(m.getLastRow() + 1, 24).setValue('Rowing machine'); // Cardio name column (X)
  g.registryOnEdit({ range: m.getRange(m.getLastRow(), 24) });
  assert.ok(m.data.some(r => r[22] === 'CA-01' && r[23] === 'Rowing machine' && r[24] === true));
});
