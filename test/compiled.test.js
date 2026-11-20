const test = require('node:test');
const assert = require('node:assert');
const { createFakeApp } = require('./fake-sheets');
const loadGas = require('./load-gas');
const g = loadGas();
const plain = v => JSON.parse(JSON.stringify(v));

const names = { exercises: { 'EX-1': 'Bench press (BB)', 'EX-2': 'Pull-ups (BW)' }, gyms: { 'GY-1': 'BYUI', 'GY-2': 'Eos' },
  workouts: { 'WO-1': 'Push', 'WO-2': 'Pull' } };
const rec = (date, ex, sets, extra = {}) => Object.assign({ tab: 'Q4 2026', date, gymId: 'GY-1', workoutId: 'WO-1',
  exerciseId: ex, unit: 'lb', notes: '', sets }, extra);
const records = [
  rec('2026-10-02', 'EX-1', ['225x8 @1-2', '225x6 a1', '215x7 p2']),
  rec('2026-11-13', 'EX-1', ['235x8', '235x6', '295 for 5 (neg)'], { gymId: 'GY-2', notes: 'S1: paused' }),
  rec('2026-11-14', 'EX-2', ['-70x8', '0x10', ''], { workoutId: 'WO-2' }),
  rec('2025-12-01', 'EX-1', ['100x5'], { unit: 'kg', tab: 'Q4 2025' }),
];
const opts = { unit: 'lb', formula: 'Epley', setCount: 3 };

test('readable sets, 1RM per set, best, notes, newest first', () => {
  const r = g.compileRecords(records, names, opts, {}, '2026-11-20');
  assert.deepStrictEqual(plain(r.headers), ['Quarter', 'Date', 'Gym', 'Workout', 'Exercise', 'Set 1', 'Set 2', 'Set 3',
    '1RM (Set 1)', '1RM (Set 2)', '1RM (Set 3)', 'Best 1RM', 'Notes']);
  assert.deepStrictEqual(plain(r.rows.map(x => x.date)), ['2026-11-14', '2026-11-13', '2026-10-02', '2025-12-01']);
  const oct = r.rows[2].values;
  assert.deepStrictEqual(plain(oct.slice(5, 8)), ['225 × 8 · RIR 1-2', '225 × 6 · +1 assisted', '215 × 7 · +2 partial']);
  assert.deepStrictEqual(plain(oct.slice(8, 12)), [285, 270, 265, 285]);
  const nov = r.rows[1].values;
  assert.strictEqual(nov[7], '⚠ 295 for 5 (neg)', 'unparseable legacy text is visible, not dropped');
  assert.strictEqual(nov[10], '');
  assert.strictEqual(nov[12], 'S1: paused');
  const pull = r.rows[0].values;
  assert.deepStrictEqual(plain(pull.slice(5, 7)), ['-70 × 8', '0 × 10']);
  assert.deepStrictEqual(plain(pull.slice(8, 10)), [0, 0], 'assisted and bodyweight 1RM are 0');
});

test('kg records convert to lb for display only', () => {
  const r = g.compileRecords(records, names, opts, {}, '2026-11-20');
  assert.strictEqual(r.rows[3].values[5], '220.5 × 5');
  const kg = g.compileRecords([records[0]], names, Object.assign({}, opts, { unit: 'kg' }), {}, '2026-11-20');
  assert.strictEqual(kg.rows[0].values[5], '102 × 8 · RIR 1-2');
  assert.strictEqual(records[3].sets[0], '100x5', 'source untouched');
});

test('filters: time frame, quarter, gym, workout, search', () => {
  const count = f => g.compileRecords(records, names, opts, f, '2026-11-20').rows.length;
  assert.strictEqual(count({ timeframe: 'This month' }), 2);
  assert.strictEqual(count({ timeframe: 'Last 3 months' }), 3);
  assert.strictEqual(count({ timeframe: 'This year' }), 3);
  assert.strictEqual(count({ timeframe: 'Q4 2025' }), 1);
  assert.strictEqual(count({ gym: 'Eos' }), 1);
  assert.strictEqual(count({ workout: 'Pull' }), 1);
  assert.strictEqual(count({ search: 'BENCH' }), 3);
  assert.strictEqual(count({ gym: 'All gyms', workout: 'All workouts', timeframe: 'All time' }), 4);
});

test('exercise panel when one exercise matches', () => {
  const r = g.compileRecords(records, names, opts, { search: 'bench', timeframe: 'This year' }, '2026-11-20');
  assert.deepStrictEqual(plain(r.panel), [['Exercise data', 'Bench press (BB)'], ['Times done', 2], ['Best 1RM', '298 lb'],
    ['Last done', '2026-11-13'], ['Strength gain in time frame', '+13 lb (+5%)']]);
  const many = g.compileRecords(records, names, opts, {}, '2026-11-20');
  assert.match(many.panel[0][1], /Search for one exercise/);
});

test('sheet: setup keeps the mockup, filters refresh, clear button, nightly trigger, refresh on Finish', () => {
  const master = [['Profile'], ['Weight system', 'Imperial'], ['Num of sets', '3']];
  const app = createFakeApp({ 'Compiled Data': [['Filter by time frame']], 'Workout Entry': [[]], Master: master });
  const gs = loadGas(app.globals);
  gs.ensureRegistryEntries('workouts', ['Push']);
  gs.ensureRegistryEntries('gyms', ['BYUI']);
  gs.ensureRegistryEntries('exercises', ['Bench press (BB)', 'Squats (BB)']);
  gs.appendRows_(gs.getOrCreateQuarterSheet('Q4 2026'), [
    ['L-1', new app.globals.Date(Date.UTC(2026, 10, 2)), 'GY-01', 'WO-01', 'EX-0001', 'lb', '', 'entry', '225x8', '225x7', '225x6'],
    ['L-2', new app.globals.Date(Date.UTC(2026, 10, 3)), 'GY-01', 'WO-01', 'EX-0002', 'lb', '', 'entry', '315x5', '', ''],
  ]);
  gs.setupCompiledData();
  const sheet = app.ss.getSheetByName('Compiled Data');
  assert.ok(app.ss.getSheetByName('Compiled Data (old mockup)'));
  assert.strictEqual(app.globals.ScriptApp.triggers.length, 1);
  gs.setupCompiledData();
  assert.strictEqual(app.globals.ScriptApp.triggers.length, 1, 'trigger not duplicated');
  assert.strictEqual(sheet.value('E4'), 'Squats (BB)');
  assert.match(sheet.value('A2'), /^Showing 2 of 2/);

  const edit = (a1, value) => { sheet.getRange(a1).setValue(value); gs.compiledOnEdit({ range: sheet.getRange(a1), value: value === true ? 'TRUE' : value }); };
  edit('H1', 'bench');
  assert.strictEqual(sheet.value('E4'), 'Bench press (BB)');
  assert.strictEqual(sheet.value('E5'), '', 'old rows cleared');
  assert.strictEqual(sheet.value('O3'), 'Exercise data'); assert.strictEqual(sheet.value('P3'), 'Bench press (BB)');
  edit('K1', true);
  assert.strictEqual(sheet.value('H1'), ''); assert.strictEqual(sheet.value('K1'), false);
  assert.match(sheet.value('A2'), /^Showing 2 of 2/);
  assert.ok(sheet.validations.B1.list.includes('Q4 2026'));

  // A workout saved from the entry form shows up after Finish workout.
  gs.setupEntryForm();
  const entry = app.ss.getSheetByName('Workout Entry');
  const eEdit = (a1, value) => { entry.getRange(a1).setValue(value); gs.entryOnEdit({ range: entry.getRange(a1), value: value === true ? 'TRUE' : value }); };
  eEdit('B1', 'BYUI');
  eEdit('A4', 'Squats (BB)');
  entry.getRange('B10:B11').setValues([[325], [5]]);
  eEdit('B18', true);
  assert.match(entry.value('A19'), /Workout saved: 1 exercises, 1 sets/, entry.value('A19'));
  assert.match(sheet.value('A2'), /^Showing 3 of 3/);
});
