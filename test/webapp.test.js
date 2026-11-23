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
  m.getRange(2, 27, 1, 4).setValues([['Routine', 'Workout', 'Exercise 1', 'Exercise 2']]);
  m.getRange(3, 27, 2, 4).setValues([['Push Day 1', 'Push', 'Bench press (BB)', 'Pec flys (Machine)'], ['Custom', 'Custom', '', '']]);
  const q = g.getOrCreateQuarterSheet('Q4 2026');
  const D = (d) => new app.globals.Date(Date.UTC(2026, 10, d));
  g.appendRows_(q, [
    ['L-a', D(10), 'GY-02', 'WO-01', ids['bench press (bb)'], 'lb', '', 'entry', '265x8', '265x7', '255x8'],
    ['L-b', D(13), 'GY-01', 'WO-01', ids['bench press (bb)'], 'lb', '', 'entry', '275x6 @1-2', '275x5', '265x6'],
    ['L-c', D(12), 'GY-02', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '150x10', '150x9', '150x8'],
    ['L-d', D(15), 'GY-01', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '200x10', '200x9', '200x8'],
  ]);
  return { app, g, ids, q };
}

test('load returns everything the page needs', () => {
  const { g } = setup();
  const d = JSON.parse(JSON.stringify(g.webAppLoad()));
  assert.strictEqual(d.unit, 'lb'); assert.strictEqual(d.setCount, 3);
  assert.deepStrictEqual(d.rirOptions, ['0', '1-2', '3-4', '5+']);
  assert.deepStrictEqual(d.gyms, ['BYUI', 'Eos']);
  assert.deepStrictEqual(d.routines, [{ name: 'Push Day 1', workout: 'Push', exercises: ['Bench press (BB)', 'Pec flys (Machine)'] },
    { name: 'Custom', workout: 'Custom', exercises: [] }]);
  const bench = d.exercises.find(e => e.name === 'Bench press (BB)');
  assert.deepStrictEqual([bench.warmup, bench.setup, bench.sameGym], [true, 'pins 28', false]);
  assert.strictEqual(d.exercises.find(e => e.name === 'Pec flys (Machine)').sameGym, true);
  assert.strictEqual(d.bodyweight.needsWeighIn, true);
});

test('views: per-set last and goal, same gym for machines, warm-up, one read of the tabs', () => {
  const { g, ids } = setup();
  let reads = 0;
  const orig = g.getHistories_;
  g.getHistories_ = list => { reads++; return orig(list); };
  const v = JSON.parse(JSON.stringify(g.webAppExerciseViews([{ id: ids['bench press (bb)'] }, { id: ids['pec flys (machine)'] }], 'Eos')));
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
  const { g, ids, q } = setup();
  const base = { date: '2026-11-20', gym: 'BYUI', workout: 'Push', exerciseId: ids['bench press (bb)'] };
  const r1 = g.webAppSaveExercise(Object.assign({}, base, { sets: [{ weight: '275', reps: '7', rir: '1-2', note: 'paused' }, { weight: '275', reps: '6' }, {}] }));
  const row = () => q.data.find(r => r[0] === r1.recordId);
  assert.deepStrictEqual(row().slice(2, 10), ['GY-01', 'WO-01', ids['bench press (bb)'], 'lb', 'S1: paused', 'app', '275x7 @1-2', '275x6']);
  const r2 = g.webAppSaveExercise(Object.assign({}, base, { recordId: r1.recordId, tab: r1.tab, sets: [{ weight: '280', reps: '6' }] }));
  assert.strictEqual(r2.recordId, r1.recordId);
  assert.strictEqual(q.data.filter(r => r[0] === r1.recordId).length, 1);
  assert.strictEqual(row()[8], '280x6');
  assert.throws(() => g.webAppSaveExercise(Object.assign({}, base, { sets: [{ weight: '', reps: '5' }] })), /Set 1: Enter a weight/);
  const lying = g.webAppSaveExercise(Object.assign({}, base, { exerciseId: ids['lying leg raises (db)'], sets: [{ weight: '0', reps: '12' }] }));
  assert.strictEqual(lying.exerciseId, ids['lying leg raises (bw)']);
  const gone = g.webAppSaveExercise(Object.assign({}, base, { recordId: r1.recordId, tab: r1.tab, sets: [{}, {}, {}] }));
  assert.strictEqual(gone.deleted, true);
  assert.strictEqual(q.data.filter(r => r[0] === r1.recordId).length, 0);
});

test('cardio, bodyweight, setup notes', () => {
  const { app, g, ids } = setup();
  g.webAppSaveCardio({ date: '2026-11-20', gym: 'BYUI', activity: 'Treadmill (15%)', duration: '30', speed: '3.1', speedUnit: 'mph', distance: '1.6', distanceUnit: 'mi', calories: '', notes: '' });
  assert.deepStrictEqual(app.ss.getSheetByName('Cardio').data[1].slice(2, 12), ['GY-01', 'CA-01', 30, 3.1, 'mph', 1.6, 'mi', '', '', 'app']);
  assert.throws(() => g.webAppSaveCardio({ activity: 'Walk' }), /at least the duration/);
  assert.strictEqual(g.webAppSaveBodyweight({ weight: '172.4', date: '2026-11-20' }).weight, 172.4);
  assert.strictEqual(g.webAppLoad().bodyweight.needsWeighIn, false);
  g.webAppSaveSetupNotes(ids['bench press (bb)'], 'seat 3');
  assert.strictEqual(g.webAppLoad().exercises.find(e => e.name === 'Bench press (BB)').setup, 'seat 3');
});

test('only the owner can use the app; the Health link still works for anyone with the token', () => {
  const { app, g } = setup();
  assert.strictEqual(g.doGet({ parameter: {} }).name, 'ui/app');
  app.globals.Session.activeEmail = '';
  assert.strictEqual(g.doGet({ parameter: {} }).kind, 'html', 'anonymous visitors get a placeholder page');
  assert.throws(() => g.webAppLoad(), /Not authorized/);
  assert.throws(() => g.webAppSaveExercise({}), /Not authorized/);
  app.store.APPLE_HEALTH_TOKEN = 'secret';
  const res = g.doGet({ parameter: { token: 'secret', weight: '170', date: '2026-11-20' } });
  assert.match(res.text, /"ok":true/);
});
