const test = require('node:test');
const assert = require('node:assert');
const { createFakeApp } = require('./fake-sheets');
const loadGas = require('./load-gas');
const g = loadGas(createFakeApp({}).globals);
const plain = v => JSON.parse(JSON.stringify(v));

const log = [{ date: '2026-09-01', weight: 168, unit: 'lb' }, { date: '2026-10-10', weight: 171, unit: 'lb' }];

test('lifts use the most recent weigh-in on or before their date', () => {
  assert.deepStrictEqual(plain(g.bodyweightOn('2026-10-20', log)), { date: '2026-10-10', weight: 171, unit: 'lb', ageDays: 10 });
  assert.strictEqual(g.bodyweightOn('2026-10-09', log).weight, 168);
  assert.strictEqual(g.bodyweightOn('2026-08-01', log), null, 'before the first weigh-in');
});

test('ask for a new weigh-in after 30 days unless snoozed', () => {
  assert.strictEqual(g.needsWeighIn(log, '2026-11-09', ''), false, '30 days old is fine');
  assert.strictEqual(g.needsWeighIn(log, '2026-11-10', ''), true, '31 days old');
  assert.strictEqual(g.needsWeighIn(log, '2026-11-10', '2026-11-12'), false, 'snoozed');
  assert.strictEqual(g.needsWeighIn([], '2026-11-10', ''), true, 'no weigh-ins yet');
});

test('weight input parsing', () => {
  assert.deepStrictEqual(plain(g.parseBodyweightInput('172.4', 'lb')), { weight: 172.4, unit: 'lb' });
  assert.deepStrictEqual(plain(g.parseBodyweightInput('78 kg', 'lb')), { weight: 78, unit: 'kg' });
  assert.strictEqual(g.parseBodyweightInput('abc', 'lb'), null);
  assert.strictEqual(g.parseBodyweightInput('0', 'lb'), null);
});

function setup() {
  const master = [['Profile'], ['Birth date', '3/5/2004'], ['Height (in)', '69'], ['Current weight', '170'], [], ['Weight system', 'Imperial']];
  const app = createFakeApp({ 'Workout Entry': [[]], Master: master });
  const gs = loadGas(app.globals);
  gs.ensureRegistryEntries('workouts', ['Push']);
  gs.ensureRegistryEntries('exercises', ['Bench press (BB)']);
  gs.setupEntryForm();
  const master2 = app.ss.getSheetByName('Master');
  const routineCol = 27; // AA
  master2.getRange(3, routineCol, 1, 3).setValues([['Push', 'Push', 'Bench press (BB)']]);
  const sheet = app.ss.getSheetByName('Workout Entry');
  const edit = (a1, value) => { sheet.getRange(a1).setValue(value); gs.entryOnEdit({ range: sheet.getRange(a1), value: value === true ? 'TRUE' : value }); };
  return { app, gs, sheet, edit, master: master2 };
}

test('stale weigh-in prompt on starting a workout: save logs it and updates Master', () => {
  const { app, gs, sheet, edit, master } = setup();
  gs.logBodyweight_('2026-10-01', 170, 'lb', 'legacy:X1');
  edit('B3', 'Push');
  assert.ok(!sheet.hiddenRows.has(36) && sheet.hiddenRows.has(11), 'bodyweight block shown');
  assert.strictEqual(sheet.value('A35'), "Last weigh-in: 170 lb, 50 days ago. Log today's weight?");
  assert.strictEqual(sheet.value('A38'), 'Not now (keep 170 lb)');
  sheet.getRange('B36').setValue('abc');
  edit('B37', true);
  assert.match(sheet.value('A20'), /Enter your weight/);
  sheet.getRange('B36').setValue(172.4);
  edit('B37', true);
  assert.ok(sheet.hiddenRows.has(36) && !sheet.hiddenRows.has(11), 'back to lifting');
  assert.deepStrictEqual(app.ss.getSheetByName('Bodyweight Log').data[2].slice(1, 4), [172.4, 'lb', 'entry']);
  assert.strictEqual(master.data[3][1], 172.4, 'Master Current weight updated');
  edit('B3', 'Push');
  assert.ok(sheet.hiddenRows.has(36), 'fresh weigh-in: no prompt');
});

test('"Not now" keeps the old weight and does not ask again for a week', () => {
  const { app, gs, sheet, edit } = setup();
  gs.logBodyweight_('2026-10-01', 170, 'lb', 'legacy:X1');
  edit('B3', 'Push');
  edit('B38', true);
  assert.ok(sheet.hiddenRows.has(36));
  assert.strictEqual(app.store.BODYWEIGHT_SNOOZE_UNTIL, '2026-11-27');
  edit('B3', 'Push');
  assert.ok(sheet.hiddenRows.has(36), 'snoozed');
  assert.strictEqual(gs.bodyweightOn('2026-11-20', gs.readBodyweightLog_()).weight, 170, 'old weight still used');
  app.setNow(new Date(Date.UTC(2026, 10, 28, 12)));
  edit('B3', 'Push');
  assert.ok(!sheet.hiddenRows.has(36), 'asks again after the snooze');
});

test('the Log bodyweight button works any time', () => {
  const { app, sheet, edit } = setup();
  edit('B22', true);
  assert.strictEqual(sheet.value('A35'), 'No bodyweight logged yet. It is used for relative strength.');
  sheet.getRange('B36').setValue('78 kg');
  edit('B37', true);
  assert.deepStrictEqual(app.ss.getSheetByName('Bodyweight Log').data[1].slice(1, 4), [78, 'kg', 'entry']);
});

test('Apple Health link: token required, duplicates ignored', () => {
  const { app, gs } = setup();
  assert.deepStrictEqual(plain(gs.healthLogFromParams_({ token: 'x', weight: '170' })), { ok: false, error: 'Not authorized' });
  app.store.APPLE_HEALTH_TOKEN = 'secret';
  assert.strictEqual(gs.healthLogFromParams_({ token: 'secret', weight: 'n/a' }).ok, false);
  const r = gs.healthLogFromParams_({ token: 'secret', weight: '171,2', unit: 'lb', date: '2026-11-19T21:00:00-07:00' });
  assert.deepStrictEqual(plain(r), { ok: true, added: true, date: '2026-11-19', weight: 171.2, unit: 'lb' });
  assert.strictEqual(gs.healthLogFromParams_({ token: 'secret', weight: '171.2', unit: 'lb', date: '2026-11-19' }).added, false);
  const rows = app.ss.getSheetByName('Bodyweight Log').data.slice(1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0][3], 'apple-health');
});
