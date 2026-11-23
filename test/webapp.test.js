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
  m.getRange(1, 27).setValue('Routines');
  m.getRange(2, 27, 1, 5).setValues([['Routine', 'Workout', 'Active', 'Exercise 1', 'Exercise 2']]);
  m.getRange(3, 27, 3, 5).setValues([['Push Day 1', 'Push', true, 'Bench press (BB)', 'Pec flys (Machine)'], ['Custom', 'Custom', true, '', ''],
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

test('settings: read with types, save known fields, keep RIR as text', () => {
  const { app, g, key } = setup();
  const fields = JSON.parse(JSON.stringify(g.webAppGetSettings(key)));
  const f = label => fields.find(x => x.label === label);
  assert.deepStrictEqual(f('Rep range'), Object.assign(f('Rep range'), { value: 'Bodybuilding', type: 'select' }));
  assert.deepStrictEqual(f('1RM Formula').options.slice(0, 2), ['Epley', 'Brzycki']);
  g.webAppSaveSettings(key, { 'Rep range': 'Powerlifting', 'Target RIR': '3-4', 'Load increment': '2.5', 'Bogus': 'x' });
  const master = app.ss.getSheetByName('Master').data;
  assert.strictEqual(master.find(r => r[0] === 'Rep range')[1], 'Powerlifting');
  assert.strictEqual(master.find(r => r[0] === 'Target RIR')[1], '3-4');
  assert.strictEqual(master.find(r => r[0] === 'Load increment')[1], 2.5);
  assert.ok(!master.some(r => r[0] === 'Bogus'));
  assert.throws(() => g.webAppSaveSettings(key, { 'Rep range': 'Yoga' }), /from the list/);
  assert.throws(() => g.webAppSaveSettings(key, { 'Num of sets': 'three' }), /must be a number/);
});

test('exercise edit: rename keeps the ID, re-sorts, renames inside routines; duplicates refused', () => {
  const { app, g, ids, key } = setup();
  const id = ids['bench press (bb)'];
  const ex = g.webAppUpdateExercise(key, { id, name: 'Zercher bench (BB)', equipment: 'Barbell', warmup: false, sameGym: false, active: true, increment: '10', setup: 'pins 30' });
  assert.deepStrictEqual([ex.id, ex.name, ex.warmup, ex.setup, ex.increment], [id, 'Zercher bench (BB)', false, 'pins 30', 10]);
  const master = app.ss.getSheetByName('Master').data;
  const list = master.slice(2).map(r => r[7]).filter(Boolean);
  assert.strictEqual(list[list.length - 1], 'Zercher bench (BB)');
  assert.ok(master.some(r => r[26] === 'Push Day 1' && r[29] === 'Zercher bench (BB)'), 'routine updated');
  assert.throws(() => g.webAppUpdateExercise(key, { id, name: 'Dips (BW)' }), /already exists/);
  assert.throws(() => g.webAppUpdateExercise(key, { id, name: 'X (BB)', increment: '-1' }), /Increment/);
});

test('routines: create, edit, rename, archive; unknown exercises and duplicate names refused', () => {
  const { app, g, key } = setup();
  let list = g.webAppSaveRoutine(key, { name: 'Pull Day 1', workout: 'Pull', exercises: ['Dips (BW)', 'Bench press (BB)'] });
  assert.ok(list.some(r => r.name === 'Pull Day 1' && r.workout === 'Pull' && r.active && r.exercises.length === 2));
  assert.ok(app.ss.getSheetByName('Master').data.some(r => r[17] === 'Pull'), 'new workout registered');
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
