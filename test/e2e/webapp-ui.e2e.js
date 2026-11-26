// End-to-end check of the phone web app (src/ui/app.html) in headless Chromium.
// google.script.run is bridged to the real server code running on the in-memory sheet fake.
// Run with: npm run test:ui   (needs Playwright with Chromium installed)
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createFakeApp } = require('../fake-sheets');
const loadGas = require('../load-gas');

function setupGas() {
  const master = [['Profile'], ['Weight system', 'Imperial'], ['Num of sets', '3'], ['Rep range', 'Bodybuilding']];
  const app = createFakeApp({ Master: master });
  const g = loadGas(app.globals);
  g.ensureRegistryEntries('workouts', ['Push']);
  g.ensureRegistryEntries('gyms', ['BYUI', 'Eos']);
  const ids = g.ensureRegistryEntries('exercises', ['Bench press (BB)', 'Pec flys (Machine)', 'Dips (BW)', 'Bicep curls (DB)'],
    name => [g.equipmentFromName(name), '', '', true, name === 'Bench press (BB)', name === 'Bench press (BB)' ? 'pins 28' : '', '', g.isGymSpecificEquipment(g.equipmentFromName(name))]);
  const m = app.ss.getSheetByName('Master');
  m.getRange(1, 30).setValue('Routines');
  m.getRange(2, 30, 1, 5).setValues([['Routine', 'Workout', 'Active', 'Exercise 1', 'Exercise 2']]);
  m.getRange(3, 30, 3, 5).setValues([['Push Day 1', 'Push', true, 'Bench press (BB)', 'Pec flys (Machine)'], ['Custom', 'Custom', true, '', ''],
    ['Old Push', 'Push', false, 'Dips (BW)', '']]);
  const q = g.getOrCreateQuarterSheet('Q4 2026');
  const D = d => new app.globals.Date(Date.UTC(2026, 10, d));
  g.appendRows_(q, [
    ['L-b', D(13), 'GY-01', 'WO-01', ids['bench press (bb)'], 'lb', '', 'entry', '275x6 @1-2', '275x5', '265x6'],
    ['L-c', D(12), 'GY-02', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '150x10', '150x9', '150x8'],
    ['L-d', D(15), 'GY-01', 'WO-01', ids['pec flys (machine)'], 'lb', '', 'entry', '200x10', '200x9', '200x8'],
  ]);
  return { app, g, ids, q, key: g.webAppKey_() };
}

async function openPage(browser, g, key, opts) {
  const page = await browser.newPage(opts || { viewport: { width: 390, height: 844 } });
  await page.exposeFunction('__gas', (fn, argsJson) => {
    try { return JSON.stringify({ ok: g[fn].apply(null, JSON.parse(argsJson)) }); }
    catch (e) { return JSON.stringify({ error: e.message }); }
  });
  await page.addInitScript(appKey => {
    function runner(ok, fail) {
      return new Proxy({}, { get(_, name) {
        if (name === 'withSuccessHandler') return f => runner(f, fail);
        if (name === 'withFailureHandler') return f => runner(ok, f);
        return (...args) => { window.__gas(name, JSON.stringify(args)).then(r => {
          const res = JSON.parse(r);
          setTimeout(() => (res.error ? fail && fail(new Error(res.error)) : ok && ok(res.ok)), 30); // simulate latency
        }); };
      } });
    }
    window.google = { script: { run: runner(), url: { getLocation: cb => setTimeout(() => cb({ parameter: { key: appKey } }), 10) } } };
  }, key);
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'app.html'), 'utf8');
  await page.route('http://app.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('http://app.test/');
  await page.waitForSelector('text=Start a workout');
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. A routine workout: last/goal per set, weight carry-over, RIR, background saves, finish.
    {
      const { g, ids, q, key } = setupGas();
      const page = await openPage(browser, g, key);
      assert.ok(!(await page.isVisible('#newGym')), 'new-gym field hidden while a gym is picked');
      const card = await page.$eval('.card:has(#date)', el => el.getBoundingClientRect().right);
      const date = await page.$eval('#date', el => el.getBoundingClientRect().right);
      assert.ok(date <= card, 'date box stays inside its card');
      await page.selectOption('#gym', '__new');
      assert.ok(await page.isVisible('#newGym'));
      await page.selectOption('#gym', 'Eos');
      await page.selectOption('#routine', 'Push Day 1');
      await page.click('#start');
      await page.waitForSelector('text=Goal 275 × 6');
      const hints = await page.$$eval('.set .hint', els => els.map(e => e.textContent));
      assert.deepStrictEqual(hints, ['Last 275 × 6 @1-2 · Goal 275 × 6', 'Last 275 × 5 · Goal 275 × 6', 'Last 265 × 6 · Goal 265 × 6']);
      assert.ok(await page.isVisible('text=Warm-up'), 'warm-up shown for bench');
      assert.ok(await page.isVisible('text=pins 28'), 'setup notes shown');
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'exercise.png') });

      await page.fill('.set[data-set="0"] input[data-k="weight"]', '280');
      assert.strictEqual(await page.inputValue('.set[data-set="2"] input[data-k="weight"]'), '280', 'weight carries to later sets');
      await page.fill('.set[data-set="0"] input[data-k="reps"]', '6');
      await page.click('.set[data-set="0"] [data-rir="1-2"]');
      await page.fill('.set[data-set="1"] input[data-k="reps"]', '5');
      await page.fill('.set[data-set="2"] input[data-k="weight"]', '270');
      await page.fill('.set[data-set="2"] input[data-k="reps"]', '6');
      await page.click('#next');
      await page.waitForSelector('text=Set 2: pick the RIR.');
      await page.click('.set[data-set="1"] [data-rir="1-2"]');
      await page.click('.set[data-set="2"] [data-rir="0"]');
      await page.click('#next');
      await page.waitForSelector('h2:has-text("Pec flys (Machine)")');
      const pecHint = await page.textContent('.set[data-set="0"] .hint');
      assert.strictEqual(pecHint, 'Last 150 × 10 · Goal 150 × 10', 'machine uses this gym (Eos)');
      await page.waitForSelector('.chip:has-text("✓ Bench press")');
      const bench = q.data.find(r => r[7] === 'app' && r[4] === ids['bench press (bb)']);
      assert.deepStrictEqual(bench.slice(8, 11), ['280x6 @1-2', '280x5 @1-2', '270x6 @0']);
      assert.strictEqual(bench[2], 'GY-02');

      // Going back and editing rewrites the same record.
      await page.click('.chip:has-text("Bench press")');
      await page.fill('.set[data-set="1"] input[data-k="reps"]', '6');
      await page.click('#next');
      await page.waitForSelector('h2:has-text("Pec flys (Machine)")');
      await page.fill('.set[data-set="0"] input[data-k="weight"]', '160');
      await page.fill('.set[data-set="0"] input[data-k="reps"]', '10');
      await page.click('.set[data-set="0"] [data-rir="3-4"]');
      await page.click('#next'); // Save & finish
      try { await page.waitForSelector('text=Workout saved', { timeout: 5000 }); }
      catch (e) { console.error('APP:', await page.textContent('#app'), '| BAR:', await page.textContent('#bar'), '| TOAST:', await page.textContent('#toast')); throw e; }
      assert.ok(await page.isVisible('text=2 exercises · 4 sets'));
      const appRows = q.data.filter(r => r[7] === 'app');
      assert.strictEqual(appRows.length, 2, 'one row per exercise; the edit did not duplicate');
      assert.strictEqual(appRows.find(r => r[4] === ids['bench press (bb)'])[9], '280x6 @1-2');
      await page.close();
    }

    // 2. Custom workout: search picker, bodyweight exercise without weight, validation message, draft resume.
    {
      const { g, ids, q, key } = setupGas();
      const page = await openPage(browser, g, key);
      await page.selectOption('#routine', 'Custom');
      await page.click('#start');
      await page.waitForSelector('#pickFind');
      await page.fill('#pickFind', 'dip');
      const picks = await page.$$eval('.pick', els => els.map(e => e.textContent));
      assert.deepStrictEqual(picks, ['Dips (BW)']);
      await page.click('.pick');
      await page.fill('.set[data-set="0"] input[data-k="reps"]', '12');
      await page.click('.set[data-set="0"] [data-rir="0"]');
      await page.click('#addEx');
      await page.fill('#pickFind', 'curl');
      await page.click('.pick:has-text("Bicep curls (DB)")');
      await page.waitForSelector('h2:has-text("Bicep curls (DB)")');
      await page.fill('.set[data-set="0"] input[data-k="reps"]', '10');
      await page.click('.set[data-set="0"] [data-rir="1-2"]');
      await page.click('#next');
      await page.waitForSelector('text=enter a weight');
      await page.reload();
      await page.waitForSelector('text=Workout in progress');
      await page.click('#resume');
      await page.waitForSelector('h2:has-text("Bicep curls (DB)")');
      await page.fill('.set[data-set="0"] input[data-k="weight"]', '40');
      await page.click('#next');
      await page.waitForSelector('text=Workout saved');
      const rows = q.data.filter(r => r[7] === 'app');
      assert.deepStrictEqual(rows.map(r => [r[3], r[8]]), [['WO-02', '0x12 @0'], ['WO-02', '40x10 @1-2']], 'Custom workout; BW saved with 0');
      await page.close();
    }

    // 2b. Creating an exercise from the picker adds it to the list and to today's workout.
    {
      const { app, g, key } = setupGas();
      const page = await openPage(browser, g, key);
      await page.selectOption('#routine', 'Custom');
      await page.click('#start');
      await page.fill('#pickFind', 'face pulls');
      await page.click('#pickNew');
      assert.strictEqual(await page.inputValue('#nxMove'), 'face pulls');
      await page.selectOption('#nxEq', 'Cable');
      await page.fill('#nxDetail', 'rope');
      await page.click('#nxSave');
      await page.waitForSelector('h2:has-text("Face pulls (Cable, Rope)")');
      const row = app.ss.getSheetByName('Master').data.find(r => r[7] === 'Face pulls (Cable, Rope)');
      assert.deepStrictEqual([row[8], row[11], row[15]], ['Cable', true, true]);
      await page.close();
    }

    // 3. Bodyweight lives in Settings; cardio has incline, handrails, and a live calorie estimate.
    {
      const { app, g, key } = setupGas();
      g.ensureRegistryEntries('cardio', ['Treadmill', 'Stairmaster'], () => [true]);
      const page = await openPage(browser, g, key);
      assert.ok(!(await page.isVisible('#bwInput')), 'no bodyweight card on the Log screen');
      assert.match(await page.textContent('[data-nav="settings"]'), /•/, 'Settings shows a dot when a weigh-in is due');
      await page.click('[data-nav="settings"]');
      await page.fill('#bwInput', '170');
      await page.click('#bwSave');
      await page.waitForSelector('text=Bodyweight saved');
      assert.ok(!/•/.test(await page.textContent('[data-nav="settings"]')));
      await page.waitForSelector('#hFt');
      await page.fill('#hFt', '5'); await page.fill('#hIn', '9');
      await page.fill('input[type="date"][data-setting]', '2004-03-05');
      assert.match(await page.textContent('#formulaText'), /reps \/ 30/);
      await page.click('#sSave');
      await page.waitForSelector('text=Settings saved.');
      const master = app.ss.getSheetByName('Master').data;
      assert.strictEqual(master.find(r => r[0] === 'Height (in)')[1], 69);
      assert.strictEqual(g.dateToIso_(master.find(r => r[0] === 'Birth date')[1]), '2004-03-05');

      await page.click('[data-nav="start"]');
      await page.click('#cardio');
      await page.selectOption('#cAct', 'Treadmill');
      assert.ok(await page.isVisible('#cInc') && await page.isVisible('#cRail'));
      await page.click('[data-min="30"]');
      await page.fill('#cSpeed', '3');
      await page.fill('#cInc', '15');
      assert.strictEqual(await page.getAttribute('#cCal', 'placeholder'), 'Estimate: ' + g.estimateCardioCalories({
        activity: 'Treadmill', durationMin: 30, speed: 3, speedUnit: 'mph', inclinePct: 15, weightKg: 170 / 2.20462262 }) + ' kcal',
        'page and server estimates agree');
      await page.check('#cRail');
      await page.click('#cSave');
      await page.waitForSelector('text=kcal estimated');
      const row = app.ss.getSheetByName('Cardio').data[1];
      assert.deepStrictEqual([row[4], row[5], row[9], row[12], row[13]], [30, 3, 308, 15, true]);
      await page.click('#cardio');
      await page.selectOption('#cAct', 'Stairmaster');
      assert.ok(!(await page.isVisible('#cInc')) && await page.isVisible('#cRail'), 'incline only for treadmill-type activities');
      await page.close();
    }

    // 4. Exercises, routines (with archive), settings, and history screens.
    {
      const { app, g, key, ids } = setupGas();
      const page = await openPage(browser, g, key);
      const master = () => app.ss.getSheetByName('Master').data;
      assert.deepStrictEqual(await page.$$eval('#routine option', o => o.map(x => x.textContent)), ['Push Day 1', 'Custom'], 'archived routine hidden');

      await page.click('[data-nav="exercises"]');
      await page.fill('#exFind', 'bench');
      assert.deepStrictEqual(await page.$$eval('[data-ex]', els => els.length), 1);
      await page.click('[data-ex]');
      assert.deepStrictEqual([await page.inputValue('#eMove'), await page.inputValue('#eEq'), await page.inputValue('#eDetail')],
        ['Bench press', 'Barbell', ''], 'the name is split into movement / equipment / detail');
      await page.selectOption('#eEq', 'Dumbbell');
      assert.strictEqual(await page.textContent('#ePreview'), 'Bench press (DB)', 'equipment changes the tag in the name');
      await page.selectOption('#eEq', 'Barbell');
      await page.fill('#eDetail', 'paused');
      assert.strictEqual(await page.textContent('#ePreview'), 'Bench press (BB, Paused)');
      await page.fill('#eInc', '10');
      await page.click('#eSave');
      await page.waitForSelector('text=Saved Bench press (BB, Paused).');
      const row = master().find(r => r[6] === ids['bench press (bb)']);
      assert.deepStrictEqual([row[7], row[14]], ['Bench press (BB, Paused)', 10]);
      assert.ok(master().some(r => r[29] === 'Push Day 1' && r[32] === 'Bench press (BB, Paused)'), 'routine follows the rename');

      await page.click('[data-nav="routines"]');
      await page.click('#rNew');
      await page.fill('#rName', 'Arms');
      await page.fill('#rWorkout', 'Pull');
      for (const q of ['curl', 'dip']) {
        await page.click('#rAdd');
        await page.fill('#peFind', q);
        await page.click('#peList .pick');
      }
      await page.click('[data-up="1"]');
      assert.deepStrictEqual(await page.$$eval('.order-row span', s => s.map(x => x.textContent)), ['Dips (BW)', 'Bicep curls (DB)']);
      await page.click('#rSave');
      try { await page.waitForSelector('text=Saved Arms.', { timeout: 5000 }); } catch (e) { console.error('TOAST:', await page.textContent('#toast')); throw e; }
      assert.ok(master().some(r => r[29] === 'Arms' && r[30] === 'Pull' && r[31] === true && r[32] === 'Dips (BW)' && r[33] === 'Bicep curls (DB)'));
      await page.click('[data-routine="Push Day 1"]');
      await page.uncheck('#rActive');
      await page.click('#rSave');
      await page.waitForSelector('h2:has-text("Archived")');
      await page.click('[data-nav="start"]');
      assert.deepStrictEqual(await page.$$eval('#routine option', o => o.map(x => x.textContent)), ['Custom', 'Arms']);

      await page.click('[data-nav="settings"]');
      await page.waitForSelector('#sSave');
      const weekSelect = await page.$('label:has-text("Start of week") select');
      await weekSelect.selectOption('Sunday');
      await page.click('#sSave');
      await page.waitForSelector('text=Settings saved.');
      assert.strictEqual(master().find(r => r[0] === 'Start of week')[1], 'Sunday');

      await page.click('[data-nav="history"]');
      await page.waitForSelector('#hFind');
      assert.deepStrictEqual((await page.$$eval('#hRange option', o => o.map(x => x.textContent))).slice(4), ['Q4 2026'], 'quarters newest first');
      await page.fill('#hFind', 'pec');
      await page.waitForSelector('text=Times done');
      assert.ok(await page.isVisible('svg.chart'), 'chart drawn for one exercise');
      await page.selectOption('#hLines', 'sets');
      assert.ok(await page.isVisible('text=Set 1'));
      await page.fill('#hFind', '');
      await page.click('#hPick');
      await page.check('#hpList [data-name="Pec flys (Machine)"]');
      await page.check('#hpList [data-name="Bench press (BB, Paused)"]');
      await page.click('#hpDone');
      await page.waitForSelector('text=Best estimated 1RM per session');
      assert.match(await page.textContent('#hPick'), /2 exercises selected/);
      await page.selectOption('#hEquip', 'Barbell');
      await page.waitForSelector('text=Times done');
      assert.match(await page.textContent('#hBody h2'), /^Bench press \(BB, Paused\)$/, 'equipment filter narrows to the barbell exercise');
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'history.png'), fullPage: true });
      await page.close();
    }

    // 5. Rep ranges in Settings; an exercise's rep range and weekly top set show on the workout.
    {
      const { app, g, key, ids } = setupGas();
      const page = await openPage(browser, g, key);
      const master = () => app.ss.getSheetByName('Master').data;
      await page.click('[data-nav="settings"]');
      await page.waitForSelector('text=Rep ranges');
      await page.click('[data-range="Bodybuilding"]');
      await page.waitForSelector('text=is built in');
      await page.click('#rangeNew');
      await page.fill('#rName', 'Strength');
      await page.fill('#rMin', '4');
      await page.fill('#rMax', '6');
      await page.selectOption('#rRir', '0');
      await page.click('#rSave');
      await page.waitForSelector('[data-range="Strength"]');
      assert.ok(master().some(r => r[50] === 'Strength' && r[51] === 4 && r[52] === 6 && r[53] === '0' && r[54] === false));
      const defaultSelect = await page.$('label:has-text("Default rep range") select');
      assert.deepStrictEqual(await defaultSelect.$$eval('option', o => o.map(x => x.textContent)), ['Bodybuilding', 'Powerlifting', 'Strength']);

      await page.click('[data-nav="exercises"]');
      await page.fill('#exFind', 'bench');
      await page.click('[data-ex]');
      assert.strictEqual(await page.$eval('#eRange option', o => o.textContent), 'Default (Bodybuilding)');
      await page.selectOption('#eRange', 'Strength');
      await page.check('#eTop');
      await page.click('#eSave');
      await page.waitForSelector('text=Saved Bench press (BB).');
      const row = master().find(r => r[6] === ids['bench press (bb)']);
      assert.deepStrictEqual([row[16], row[17]], ['Strength', true]);
      assert.ok(await page.isVisible('[data-ex] .tag:has-text("Top set")'));

      await page.click('[data-nav="start"]');
      await page.fill('#date', '2026-11-16');   // Monday: first bench session of the week
      await page.selectOption('#gym', 'BYUI');
      await page.selectOption('#routine', 'Push Day 1');
      await page.click('#start');
      await page.waitForSelector('text=Top 305 × 2');
      assert.ok(await page.isVisible('.set[data-set="0"] .tag:has-text("Top set")'));
      assert.ok(await page.isVisible('text=Rep range Strength 4-6'));
      const hints = await page.$$eval('.set .hint', els => els.map(e => e.textContent));
      assert.deepStrictEqual(hints.slice(1), ['Last 275 × 5 · Goal 275 × 6', 'Last 265 × 6 · Goal 275 × 6']);
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'top-set.png'), fullPage: true });
      await page.close();
    }

    // 6. Settings shows the installed version, and an update card when a newer version is published.
    {
      const { g, key } = setupGas();
      let page = await openPage(browser, g, key);
      await page.click('[data-nav="settings"]');
      await page.waitForSelector('text=Overload Tracker ' + g.APP_VERSION);   // the check fails offline: just the version line
      assert.ok(!(await page.isVisible('text=Update available')));
      await page.close();

      g.checkForUpdate_ = () => g.updateStatus(g.APP_VERSION, { version: '99.0.0', released: '2027-01-05', notes: ['Activity grid'], url: 'https://example.com/update' });
      page = await openPage(browser, g, key);
      await page.click('[data-nav="settings"]');
      await page.waitForSelector('text=Update available');
      assert.ok(await page.isVisible('text=Version 99.0.0 is out (2027-01-05). You have ' + g.APP_VERSION + '.'));
      assert.ok(await page.isVisible('li:has-text("Activity grid")'));
      assert.strictEqual(await page.getAttribute('a:has-text("How to update")', 'href'), 'https://example.com/update');
      if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'update.png'), fullPage: true });
      await page.close();
    }

    console.log('web app UI: all checks passed');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
