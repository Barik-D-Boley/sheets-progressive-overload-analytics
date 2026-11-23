const test = require('node:test');
const assert = require('node:assert');
const { createFakeApp } = require('./fake-sheets');
const loadGas = require('./load-gas');

function setup() {
  const master = [['Profile'], ['Weight system', 'Imperial'], ['Num of sets', '3'], ['Rep range', 'Bodybuilding']];
  const app = createFakeApp({ Master: master });
  const g = loadGas(app.globals);
  g.ensureRegistryEntries('workouts', ['Push']);
  g.ensureRegistryEntries('gyms', ['BYUI', 'Eos']);
  const ids = g.ensureRegistryEntries('exercises', ['Bench press (BB)', 'Pec flys (Machine)', 'Dips (BW)', 'Lying leg raises (DB)', 'Lying leg raises (BW)'],
    name => [g.equipmentFromName(name), '', '', true, name === 'Bench press (BB)', 'pins 28', '', g.isGymSpecificEquipment(g.equipmentFromName(name))]);
  const m = app.ss.getSheetByName('Master');
  m.getRange(1, 30).setValue('Routines');
  m.getRange(2, 30, 1, 5).setValues([['Routine', 'Workout', 'Active', 'Exercise 1', 'Exercise 2']]);
  m.getRange(3, 30, 3, 5).setValues([['Push Day 1', 'Push', true, 'Bench press (BB)', 'Pec flys (Machine)'], ['Custom', 'Custom', true, '', ''],
    ['Old Push', 'Push', false, 'Dips (BW)', '']]);
  const q = g.getOrCreateQuarterSheet('Q4 2026');
  const D = (d) => new app.globals.Date(Date.UTC(2026, 10, d));
  g.appendRows_(q, [
    ['L-a', D(10), 'GY-02', 'WO-01', ids['bench press (bb)'], 'lb', '', 'entry', '265x8', '265x7', '255x8'],
    ['L-b', D(13), 'GY-01', 'WO-01', ids['bench press (bb)'], 'lb', '', 'entry', '275x6 @1-2', '275x5', '265x6'],
    ['L-c', D(12), 'GY-02', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '150x10', '150x9', '150x8'],
    ['L-d', D(15), 'GY-01', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '200x10', '200x9', '200x8'],
  ]);
  return { app, g, ids, q, key: g.webAppKey_() };
}

test('load returns everything the page needs', () => {
  const { g, key } = setup();
  const d = JSON.parse(JSON.stringify(g.webAppLoad(key, key)));
  assert.strictEqual(d.unit, 'lb'); assert.strictEqual(d.setCount, 3);
  assert.deepStrictEqual(d.rirOptions, ['0', '1-2', '3-4', '5+']);
  assert.deepStrictEqual(d.gyms, ['BYUI', 'Eos']);
  assert.deepStrictEqual(d.routines, [{ name: 'Push Day 1', workout: 'Push', active: true, exercises: ['Bench press (BB)', 'Pec flys (Machine)'] },
    { name: 'Custom', workout: 'Custom', active: true, exercises: [] }, { name: 'Old Push', workout: 'Push', active: false, exercises: ['Dips (BW)'] }]);
  const bench = d.exercises.find(e => e.name === 'Bench press (BB)');
  assert.deepStrictEqual([bench.warmup, bench.setup, bench.sameGym], [true, 'pins 28', false]);
  assert.strictEqual(d.exercises.find(e => e.name === 'Pec flys (Machine)').sameGym, true);
  assert.strictEqual(d.bodyweight.needsWeighIn, true);
});

test('views: per-set last and goal, same gym for machines, warm-up, one read of the tabs', () => {
  const { g, ids, key } = setup();
  let reads = 0;
  const orig = g.getHistories_;
  g.getHistories_ = list => { reads++; return orig(list); };
  const v = JSON.parse(JSON.stringify(g.webAppExerciseViews(key, [{ id: ids['bench press (bb)'] }, { id: ids['pec flys (machine)'] }], 'Eos')));
  assert.strictEqual(reads, 1);
  const bench = v[ids['bench press (bb)']];
  assert.deepStrictEqual([bench.lastDate, bench.lastGym], ['2026-11-13', 'BYUI'], 'free weight: any gym');
  assert.deepStrictEqual(bench.sets[1].last, { load: '275', reps: 5, assisted: 0, partial: 0, rir: '' });
  assert.deepStrictEqual(bench.sets[0].last.rir, '1-2');
  assert.deepStrictEqual(bench.sets[1].goal, { load: 275, reps: 6 });
  assert.ok(bench.warmup.length > 0);
  const pec = v[ids['pec flys (machine)']];
  assert.deepStrictEqual([pec.lastDate, pec.lastGym, pec.sets[0].goal.load], ['2026-11-12', 'Eos', 150], 'machine: this gym');
});

test('save creates, rewrites in place, applies the BW variant, and deletes when emptied', () => {
  const { g, ids, q, key } = setup();
  const base = { date: '2026-11-20', gym: 'BYUI', workout: 'Push', exerciseId: ids['bench press (bb)'] };
  const r1 = g.webAppSaveExercise(key, Object.assign({}, base, { sets: [{ weight: '275', reps: '7', rir: '1-2', note: 'paused' }, { weight: '275', reps: '6' }, {}] }));
  const row = () => q.data.find(r => r[0] === r1.recordId);
  assert.deepStrictEqual(row().slice(2, 10), ['GY-01', 'WO-01', ids['bench press (bb)'], 'lb', 'S1: paused', 'app', '275x7 @1-2', '275x6']);
  const r2 = g.webAppSaveExercise(key, Object.assign({}, base, { recordId: r1.recordId, tab: r1.tab, sets: [{ weight: '280', reps: '6' }] }));
  assert.strictEqual(r2.recordId, r1.recordId);
  assert.strictEqual(q.data.filter(r => r[0] === r1.recordId).length, 1);
  assert.strictEqual(row()[8], '280x6');
  assert.throws(() => g.webAppSaveExercise(key, Object.assign({}, base, { sets: [{ weight: '', reps: '5' }] })), /Set 1: Enter a weight/);
  const lying = g.webAppSaveExercise(key, Object.assign({}, base, { exerciseId: ids['lying leg raises (db)'], sets: [{ weight: '0', reps: '12' }] }));
  assert.strictEqual(lying.exerciseId, ids['lying leg raises (bw)']);
  const gone = g.webAppSaveExercise(key, Object.assign({}, base, { recordId: r1.recordId, tab: r1.tab, sets: [{}, {}, {}] }));
  assert.strictEqual(gone.deleted, true);
  assert.strictEqual(q.data.filter(r => r[0] === r1.recordId).length, 0);
});

test('cardio, bodyweight, setup notes', () => {
  const { app, g, ids, key } = setup();
  g.webAppSaveCardio(key, { date: '2026-11-20', gym: 'BYUI', activity: 'Treadmill (15%)', duration: '30', speed: '3.1', speedUnit: 'mph', distance: '1.6', distanceUnit: 'mi', calories: '', notes: '' });
  assert.deepStrictEqual(app.ss.getSheetByName('Cardio').data[1].slice(2, 12), ['GY-01', 'CA-01', 30, 3.1, 'mph', 1.6, 'mi', '', '', 'app']);
  assert.throws(() => g.webAppSaveCardio(key, { activity: 'Walk' }), /at least the duration/);
  assert.strictEqual(g.webAppSaveBodyweight(key, { weight: '172.4', date: '2026-11-20' }).weight, 172.4);
  assert.strictEqual(g.webAppLoad(key, key).bodyweight.needsWeighIn, false);
  g.webAppSaveSetupNotes(key, ids['bench press (bb)'], 'seat 3');
  assert.strictEqual(g.webAppLoad(key, key).exercises.find(e => e.name === 'Bench press (BB)').setup, 'seat 3');
});

test('the app needs the key from its link; the Health link still works with its own token', () => {
  const { app, g, key } = setup();
  assert.strictEqual(g.doGet({ parameter: { key } }).name, 'ui/app');
  assert.match(g.doGet({ parameter: {} }).html, /missing its key/);
  assert.match(g.doGet({ parameter: { key: 'wrong' } }).html, /missing its key/);
  assert.throws(() => g.webAppLoad('wrong'), /Not authorized/);
  assert.throws(() => g.webAppSaveExercise('', {}), /Not authorized/);
  app.store.APPLE_HEALTH_TOKEN = 'secret';
  const res = g.doGet({ parameter: { token: 'secret', weight: '170', date: '2026-11-20' } });
  assert.match(res.text, /"ok":true/);
});

test('Open phone app asks for the deployment URL once, then shows the link with the key', () => {
  const { app, g, key } = setup();
  app.promptReplies.push('  https://script.google.com/macros/s/AKfycbzw_DB4f-Mq/exec  ');
  g.showWebAppLink();
  assert.strictEqual(app.store.WEBAPP_URL, 'https://script.google.com/macros/s/AKfycbzw_DB4f-Mq/exec');
  assert.ok(app.dialogs.pop().includes('https://script.google.com/macros/s/AKfycbzw_DB4f-Mq/exec?key=' + key));
  g.showWebAppLink();
  assert.strictEqual(app.promptReplies.length, 0, 'not asked again');
  app.promptReplies.push('https://example.com/nope');
  g.resetWebAppLink();
  assert.notStrictEqual(app.store.WEBAPP_KEY, key, 'reset replaces the key');
  g.showWebAppLink();
  assert.match(app.alerts.pop()[0], /does not look like a web app URL/);
});

test('settings: read with types, save known fields; rep range from the table', () => {
  const { app, g, key } = setup();
  const fields = JSON.parse(JSON.stringify(g.webAppGetSettings(key)));
  const f = label => fields.find(x => x.label === label);
  assert.deepStrictEqual([f('Default rep range').value, f('Default rep range').options], ['Bodybuilding', ['Bodybuilding', 'Powerlifting']]);
  assert.deepStrictEqual([f('Start of week').value, f('Top set range').value], ['Monday', '90-93%']);
  assert.ok(!f('Rep range') && !f('Target RIR') && !f('Strength goal'), 'old settings are gone');
  assert.deepStrictEqual(f('1RM Formula').options.slice(0, 2), ['Epley', 'Brzycki']);
  g.webAppSaveSettings(key, { 'Default rep range': 'Powerlifting', 'Top set range': '88 - 92', 'Load increment': '2.5', 'Bogus': 'x' });
  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(master.find(r => r[0] === 'Default rep range')[1], 'Powerlifting');
  assert.strictEqual(master.find(r => r[0] === 'Top set range')[1], '88-92%');
  assert.strictEqual(master.find(r => r[0] === 'Load increment')[1], 2.5);
  assert.ok(!master.some(r => r[0] === 'Bogus'));
  assert.throws(() => g.webAppSaveSettings(key, { 'Default rep range': 'Yoga' }), /from the list/);
  assert.throws(() => g.webAppSaveSettings(key, { 'Start of week': 'Funday' }), /from the list/);
  assert.throws(() => g.webAppSaveSettings(key, { 'Num of sets': 'three' }), /must be a number/);
});

test('old Rep range / Custom / Target RIR / Strength goal settings move into the rep-range table', () => {
  const master = [['Profile'], ['Rep range', 'Custom'], ['Custom rep min', 6], ['Custom rep max', 10], ['Target RIR', '0'],
    ['Strength goal', '85-90%'], ['Weight system', 'Imperial']];
  const app = createFakeApp({ Master: master });
  const g = loadGas(app.globals);
  const ranges = JSON.parse(JSON.stringify(g.readRepRanges_()));
  assert.deepStrictEqual(ranges, [
    { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2', builtIn: true },
    { name: 'Powerlifting', min: 3, max: 6, targetRir: '1-2', builtIn: true },
    { name: 'Custom', min: 6, max: 10, targetRir: '0', builtIn: false }]);
  const m = app.ss.getSheetByName('Master').data;
  assert.ok(!m.some(r => ['Rep range', 'Custom rep min', 'Custom rep max', 'Target RIR', 'Strength goal'].includes(r[0])), 'old rows cleared');
  const s = g.readSettings_();
  assert.deepStrictEqual([s['default rep range'], s['top set range']], ['Custom', '85-90%']);
  assert.strictEqual(m[1][50], 'Rep Range', 'table header at AY');
});

test('rep ranges: add, rename (exercises follow), delete (falls back); built-ins locked', () => {
  const { app, g, ids, key } = setup();
  const bench = ids['bench press (bb)'];
  let st = JSON.parse(JSON.stringify(g.webAppSaveRepRange(key, { name: 'Strength', min: '4', max: '6', targetRir: '0' })));
  assert.deepStrictEqual(st.ranges.map(r => r.name), ['Bodybuilding', 'Powerlifting', 'Strength']);
  g.webAppUpdateExercise(key, { id: bench, name: 'Bench press (BB)', equipment: 'BB', warmup: true, sameGym: false, active: true,
    increment: '', setup: '', repRange: 'Strength', topSet: true });
  let ex = JSON.parse(JSON.stringify(g.webAppLoad(key).exercises.find(e => e.id === bench)));
  assert.deepStrictEqual([ex.repRange, ex.topSet], ['Strength', true]);
  g.webAppSaveSettings(key, { 'Default rep range': 'Strength' });
  st = JSON.parse(JSON.stringify(g.webAppSaveRepRange(key, { originalName: 'Strength', name: 'Heavy', min: 3, max: 5, targetRir: '1-2' })));
  assert.strictEqual(st.defaultRepRange, 'Heavy', 'default follows a rename');
  assert.strictEqual(st.exercises.find(e => e.id === bench).repRange, 'Heavy', 'exercise follows a rename');
  assert.throws(() => g.webAppSaveRepRange(key, { originalName: 'Bodybuilding', name: 'Bodybuilding', min: 6, max: 10, targetRir: '1-2' }), /built in/);
  assert.throws(() => g.webAppSaveRepRange(key, { name: 'powerlifting', min: 3, max: 5, targetRir: '1-2' }), /already exists/);
  assert.throws(() => g.webAppSaveRepRange(key, { name: 'Bad', min: 10, max: 5, targetRir: '1-2' }), /cannot be more/);
  assert.throws(() => g.webAppDeleteRepRange(key, 'Powerlifting'), /built in/);
  st = JSON.parse(JSON.stringify(g.webAppDeleteRepRange(key, 'Heavy')));
  assert.deepStrictEqual([st.defaultRepRange, st.exercises.find(e => e.id === bench).repRange], ['Bodybuilding', '']);
  assert.throws(() => g.webAppUpdateExercise(key, { id: bench, name: 'Bench press (BB)', repRange: 'Nope' }), /Unknown rep range/);
  assert.ok(app.ss.getSheetByName('Master'));
});

test('views: the exercise rep range and the weekly top set', () => {
  const { g, ids, key } = setup();
  const bench = ids['bench press (bb)'];
  g.webAppSaveRepRange(key, { name: 'Strength', min: 4, max: 6, targetRir: '1-2' });
  g.webAppUpdateExercise(key, { id: bench, name: 'Bench press (BB)', equipment: 'BB', warmup: true, sameGym: false, active: true,
    increment: '', setup: '', repRange: 'Strength', topSet: true });
  // Last bench: 11/13 (Fri) 275x6 275x5 265x6. Monday 11/16 is a new week -> top set.
  const v = JSON.parse(JSON.stringify(g.webAppExerciseViews(key, [{ id: bench }], 'BYUI', '2026-11-16')))[bench];
  assert.strictEqual(v.repRange, 'Strength 4-6');
  // Best recent 1RM: 265x8 = 335.7 -> 90-93% = 302-312 -> 310, 2 reps (310x3 would be 341).
  assert.deepStrictEqual(v.sets[0].goal, { load: 310, reps: 2, top: true });
  assert.deepStrictEqual([v.sets[1].goal, v.sets[2].goal], [{ load: 275, reps: 6 }, { load: 275, reps: 6 }], 'working sets: +1 rep on the weakest');
  assert.match(v.reason, /^Set 1: top set 90-93% of 1RM 336 · \+1 rep on set 3$/);
  const later = JSON.parse(JSON.stringify(g.webAppExerciseViews(key, [{ id: bench }], 'BYUI', '2026-11-14')))[bench];
  assert.ok(!later.sets[0].goal.top, 'Saturday after Friday\'s session: same week, no top set');
});

test('exercise edit: rename keeps the ID, re-sorts, renames inside routines; duplicates refused', () => {
  const { app, g, ids, key } = setup();
  const id = ids['bench press (bb)'];
  const ex = g.webAppUpdateExercise(key, { id, name: 'Zercher bench (BB)', equipment: 'Barbell', warmup: false, sameGym: false, active: true, increment: '10', setup: 'pins 30' });
  assert.deepStrictEqual([ex.id, ex.name, ex.warmup, ex.setup, ex.increment], [id, 'Zercher bench (BB)', false, 'pins 30', 10]);
  const master = app.ss.getSheetByName('Master').data;
  const list = master.slice(2).map(r => r[7]).filter(Boolean);
  assert.strictEqual(list[list.length - 1], 'Zercher bench (BB)');
  assert.ok(master.some(r => r[29] === 'Push Day 1' && r[32] === 'Zercher bench (BB)'), 'routine updated');
  assert.throws(() => g.webAppUpdateExercise(key, { id, name: 'Dips (BW)' }), /already exists/);
  assert.throws(() => g.webAppUpdateExercise(key, { id, name: 'X (BB)', increment: '-1' }), /Increment/);
});

test('routines: create, edit, rename, archive; unknown exercises and duplicate names refused', () => {
  const { app, g, key } = setup();
  let list = g.webAppSaveRoutine(key, { name: 'Pull Day 1', workout: 'Pull', exercises: ['Dips (BW)', 'Bench press (BB)'] });
  assert.ok(list.some(r => r.name === 'Pull Day 1' && r.workout === 'Pull' && r.active && r.exercises.length === 2));
  assert.ok(app.ss.getSheetByName('Master').data.some(r => r[20] === 'Pull'), 'new workout registered');
  list = g.webAppSaveRoutine(key, { originalName: 'Pull Day 1', name: 'Pull A', workout: 'Pull', active: false, exercises: ['Dips (BW)'] });
  assert.ok(!list.some(r => r.name === 'Pull Day 1'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(list.find(r => r.name === 'Pull A'))), { name: 'Pull A', workout: 'Pull', active: false, exercises: ['Dips (BW)'] });
  assert.throws(() => g.webAppSaveRoutine(key, { name: 'X', exercises: ['Nope'] }), /Unknown exercise/);
  assert.throws(() => g.webAppSaveRoutine(key, { name: 'push day 1', exercises: [] }), /already exists/);
});

test('history returns readable rows newest first with 1RMs and bodyweights', () => {
  const { g, key } = setup();
  g.webAppSaveBodyweight(key, { weight: '170', date: '2026-11-01' });
  const h = JSON.parse(JSON.stringify(g.webAppHistory(key)));
  assert.strictEqual(h.unit, 'lb');
  assert.strictEqual(h.rows.length, 4);
  assert.deepStrictEqual(h.rows[0], { quarter: 'Q4 2026', date: '2026-11-15', gym: 'BYUI', workout: 'Push', exercise: 'Pec flys (Machine)',
    sets: ['200 × 10', '200 × 9', '200 × 8'], oneRms: [267, 260, 253], best: 267, notes: '' });
  assert.strictEqual(h.bodyweights[0].weight, 170);
});

test('calorie estimates: treadmill incline, downhill, handrails, stairs, unknown activities', () => {
  const { g } = setup();
  const kg = 170 / 2.20462262;
  const tm = o => g.estimateCardioCalories(Object.assign({ activity: 'Treadmill', durationMin: 30, speed: 3, speedUnit: 'mph', weightKg: kg }, o));
  const flat = tm({}), up = tm({ inclinePct: 15 }), down = tm({ inclinePct: -5 }), rails = tm({ inclinePct: 15, handrails: true });
  assert.strictEqual(flat, 134);
  assert.strictEqual(up, 385, 'your treadmill showed 374 for this session');
  assert.ok(down < flat && down > 0);
  assert.strictEqual(rails, Math.round(up * 0.8));
  assert.strictEqual(g.estimateCardioCalories({ activity: 'Stairmaster', durationMin: 10, distance: 41, distanceUnit: 'floors', weightKg: kg }), 185);
  assert.strictEqual(g.estimateCardioCalories({ activity: 'Yoga', durationMin: 30, weightKg: kg }), null);
  assert.strictEqual(tm({ weightKg: '' }), null);
});

test('saving cardio estimates blank calories from the bodyweight on that date; treadmill variants merge', () => {
  const { app, g, key } = setup();
  g.webAppSaveBodyweight(key, { weight: '170', date: '2026-11-01' });
  const r = g.webAppSaveCardio(key, { date: '2026-11-20', activity: 'Treadmill', duration: '30', speed: '3', speedUnit: 'mph', incline: '15', handrails: false });
  assert.deepStrictEqual([r.calories, r.estimated], [385, true]);
  const row = app.ss.getSheetByName('Cardio').data[1];
  assert.deepStrictEqual([row[9], row[10], row[12], row[13]], [385, 'calories estimated', 15, false]);
  g.webAppSaveCardio(key, { date: '2026-11-20', activity: 'Treadmill (10%)', duration: '20', speed: '3', speedUnit: 'mph', calories: '200' });
  g.webAppSaveCardio(key, { date: '2026-11-21', activity: 'Treadmill (-2.5%)', duration: '20', speed: '3', speedUnit: 'mph', calories: '150' });
  assert.strictEqual(g.mergeTreadmillVariants_(), 2);
  const cardio = app.ss.getSheetByName('Cardio').data.slice(1);
  const treadmillId = cardio[0][3];
  assert.deepStrictEqual(cardio.map(c => [c[3], c[12]]), [[treadmillId, 15], [treadmillId, 10], [treadmillId, -2.5]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.webAppLoad(key).cardio.map(c => c.name))), ['Treadmill'], 'old variants are inactive');
});

test('settings: birth date as a date, height in inches, bodyweight not written as a setting', () => {
  const { app, g, key } = setup();
  g.webAppSaveSettings(key, { 'Birth date': '2004-03-05', 'Height (in)': '69', 'Current weight': '999' });
  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(g.dateToIso_(master.find(r => r[0] === 'Birth date')[1]), '2004-03-05');
  assert.strictEqual(master.find(r => r[0] === 'Height (in)')[1], 69);
  assert.ok(!master.some(r => r[0] === 'Current weight' && r[1] === 999));
  const fields = JSON.parse(JSON.stringify(g.webAppGetSettings(key)));
  assert.strictEqual(fields.find(f => f.label === 'Birth date').value, '2004-03-05');
  assert.throws(() => g.webAppSaveSettings(key, { 'Birth date': 'March 5' }), /must be a date/);
});

test('an older Master layout (v1) moves its tables right to make room for Rep Range and Top Set', () => {
  const row = (cells) => { const r = []; Object.keys(cells).forEach(c => { r[c] = cells[c]; }); return Array.from(r, v => v === undefined ? '' : v); };
  // v1 columns (0-based): exercises 6-15, workouts 16, gyms 19, cardio 22, routines 26, tags 43.
  const master = [
    row({ 0: 'Profile', 6: 'Exercises', 16: 'Workouts', 19: 'Gyms', 22: 'Cardio', 26: 'Routines', 43: 'Exercise name tags' }),
    row({ 6: 'Exercise ID', 7: 'Name', 8: 'Equipment', 9: 'Primary Muscle', 10: 'Secondary Muscle', 11: 'Active', 12: 'Warm-up',
      13: 'Setup Notes', 14: 'Increment', 15: 'Same Gym Only', 16: 'Workout ID', 17: 'Name', 19: 'Gym ID', 20: 'Name',
      22: 'Cardio ID', 23: 'Name', 24: 'Active', 26: 'Routine', 27: 'Workout', 28: 'Active', 29: 'Exercise 1', 43: 'Equipment', 44: 'Tag' }),
    row({ 0: 'Weight system', 1: 'Imperial', 6: 'EX-0001', 7: 'Bench press (BB)', 8: 'Barbell', 11: true, 12: true, 15: false,
      16: 'WO-01', 17: 'Push', 19: 'GY-01', 20: 'BYUI', 22: 'CA-01', 23: 'Walk', 24: true,
      26: 'Push Day 1', 27: 'Push', 28: true, 29: 'Bench press (BB)', 43: 'Barbell', 44: 'BB' }),
  ];
  const app = createFakeApp({ Master: master });
  const g = loadGas(app.globals);
  const plain = v => JSON.parse(JSON.stringify(v));
  assert.deepStrictEqual(plain(g.readRegistry('gyms')).map(x => x.name), ['BYUI']);
  assert.deepStrictEqual(plain(g.readRegistry('workouts')).map(x => x.name), ['Push']);
  assert.deepStrictEqual(plain(g.readRegistry('cardio')).map(x => x.name), ['Walk']);
  assert.deepStrictEqual(plain(g.readRoutines_()).map(r => [r.name, r.workout, r.exercises]), [['Push Day 1', 'Push', ['Bench press (BB)']]]);
  assert.strictEqual(g.readNamingSettings_().equipmentTags.Barbell, 'BB');
  const m = app.ss.getSheetByName('Master').data;
  assert.deepStrictEqual([m[1][16], m[1][17], m[2][15]], ['', '', false], 'old cells cleared; exercises untouched');
  g.ensureRegistryHeaders_('exercises');
  assert.deepStrictEqual(m[1].slice(16, 18), ['Rep Range', 'Top Set']);
  // Runs once: a second read changes nothing.
  const before = JSON.stringify(m);
  g.readRegistry('gyms');
  assert.strictEqual(JSON.stringify(app.ss.getSheetByName('Master').data), before);
});
