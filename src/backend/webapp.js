/**
 * Server side of the phone web app (ui/app.html), served by doGet from the same
 * deployment as the Apple Health link. The page loads everything it needs in one
 * call, works locally, and saves each exercise in the background.
 *
 * Functions called from the page (google.script.run) must not end in "_".
 */
var WEBAPP = { PROP_KEY: 'WEBAPP_KEY', PROP_URL: 'WEBAPP_URL' };

/**
 * The app is opened with a private key in its link (?key=...), and every call from the
 * page sends it back. This works for personal Google accounts (which do not reveal the
 * viewer's identity to a script running as the owner) and keeps the "Anyone" deployment
 * that the Apple Health link needs from serving the app.
 */
function webAppKey_() {
  var props = PropertiesService.getDocumentProperties();
  var key = props.getProperty(WEBAPP.PROP_KEY);
  if (!key) { key = Utilities.getUuid().replace(/-/g, ''); props.setProperty(WEBAPP.PROP_KEY, key); }
  return key;
}

function requireKey_(key) {
  var stored = PropertiesService.getDocumentProperties().getProperty(WEBAPP.PROP_KEY);
  if (!stored || String(key || '') !== stored) throw new Error('Not authorized. Open the app from Overload Tracker → Open phone app.');
}

function serveWebApp_(e) {
  var key = e && e.parameter ? e.parameter.key : '';
  try { requireKey_(key); } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:16px">This link is missing its key. ' +
      'In the sheet, open <b>Overload Tracker → Open phone app</b> and use the link shown there.</p>').setTitle('Overload Tracker');
  }
  return HtmlService.createHtmlOutputFromFile('ui/app')
    .setTitle('Overload Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

/** "https://script.google.com/macros/s/<id>/exec" (optionally with /u/N/), or ''. */
function cleanWebAppUrl_(text) {
  var m = String(text || '').trim().match(/^(https:\/\/script\.google\.com\/(?:a\/[^/]+\/)?macros\/(?:u\/\d+\/)?s\/[A-Za-z0-9_-]+\/exec)/);
  return m ? m[1] : '';
}

/**
 * Menu: shows the phone link. The first time, asks for the Web app URL from
 * Deploy → Manage deployments (Google's own URL lookup is unreliable from a menu).
 */
function showWebAppLink() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getDocumentProperties();
  var url = props.getProperty(WEBAPP.PROP_URL);
  if (!url) {
    var res = ui.prompt('Connect the phone app',
      'Paste the Web app URL from Extensions → Apps Script → Deploy → Manage deployments (it ends in /exec).\n\n' +
      'No deployment yet? Deploy → New deployment → Web app, Execute as: Me, Who has access: Only myself.',
      ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    url = cleanWebAppUrl_(res.getResponseText());
    if (!url) { ui.alert('That does not look like a web app URL. It should start with https://script.google.com/macros/s/ and end in /exec.'); return; }
    props.setProperty(WEBAPP.PROP_URL, url);
  }
  var link = url + '?key=' + webAppKey_();
  var html = '<div style="font:14px sans-serif;line-height:1.5">' +
    '<p>Open this on your phone in Safari, then <b>Share → Add to Home Screen</b>. Keep it private: the key in the link opens your log.</p>' +
    '<textarea style="width:100%;height:80px" readonly onclick="this.select()">' + link + '</textarea>' +
    '<p style="color:#666">Wrong link, or want to revoke it? <b>Overload Tracker → Advanced → Reset phone app link</b>.</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(260), 'Phone app');
}

/** Menu: forgets the saved URL and replaces the key (old links stop working). */
function resetWebAppLink() {
  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty(WEBAPP.PROP_URL);
  props.setProperty(WEBAPP.PROP_KEY, Utilities.getUuid().replace(/-/g, ''));
  SpreadsheetApp.getUi().alert('Old phone links no longer work. Open "Open phone app" to set up the new one.');
}

function todayIsoForScript_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Everything the page needs to start. */
function webAppLoad(key) {
  requireKey_(key);
  var settings = readSettings_();
  var exercises = readRegistryRows('exercises').map(function (r) {
    var sameGym = r['Same Gym Only'];
    if (sameGym !== true && sameGym !== false) sameGym = isGymSpecificEquipment(r['Equipment'] || equipmentFromName(r['Name']));
    return { id: String(r['Exercise ID']), name: String(r['Name']), equipment: String(r['Equipment'] || ''),
      warmup: r['Warm-up'] === true, setup: String(r['Setup Notes'] || ''), sameGym: sameGym, active: r['Active'] !== false };
  });
  var master = getMasterSheet_();
  var col = columnLetterToIndex(CONFIG.ROUTINES.column);
  var last = master.getLastRow();
  var routines = [];
  if (last >= 3) {
    master.getRange(3, col, last - 2, CONFIG.ROUTINES.maxExercises + 2).getValues().forEach(function (r) {
      if (!String(r[0]).trim()) return;
      routines.push({ name: String(r[0]).trim(), workout: String(r[1]).trim() || String(r[0]).trim(),
        exercises: r.slice(2).map(String).map(function (x) { return x.trim(); }).filter(String) });
    });
  }
  var unit = weightUnit_(settings);
  var lastCardioUnits = {};
  var cardioSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.CARDIO);
  if (cardioSheet && cardioSheet.getLastRow() > 1) {
    cardioSheet.getRange(2, 1, cardioSheet.getLastRow() - 1, CONFIG.CARDIO_HEADERS.length).getValues().forEach(function (r) {
      lastCardioUnits[String(r[3])] = { speedUnit: r[6] || '', distanceUnit: r[8] || '' };
    });
  }
  var cardio = readRegistryRows('cardio').filter(function (r) { return r['Active'] !== false; }).map(function (r) {
    var u = lastCardioUnits[String(r['Cardio ID'])] || {};
    return { id: String(r['Cardio ID']), name: String(r['Name']),
      speedUnit: u.speedUnit || (unit === 'kg' ? 'kph' : 'mph'), distanceUnit: u.distanceUnit || (unit === 'kg' ? 'km' : 'mi') };
  });
  var today = todayIsoForScript_();
  var log = readBodyweightLog_();
  var latest = bodyweightOn(today, log);
  var snooze = PropertiesService.getDocumentProperties().getProperty(BODYWEIGHT.PROP_SNOOZE);
  return {
    today: today, unit: unit, setCount: settingSetCount_(settings), rirOptions: RIR_OPTIONS,
    gyms: readRegistry('gyms').map(function (g) { return g.name; }),
    lastGym: String(getEntryState_().gym || ''),
    routines: routines, exercises: exercises, cardio: cardio,
    equipment: Object.keys(readNamingSettings_().equipmentTags),
    bodyweight: { latest: latest, needsWeighIn: needsWeighIn(log, today, snooze) },
  };
}

/**
 * Last / Goal / warm-up for each exercise (one read of the quarter tabs).
 * @param {{id: string, excludeRecordId?: string}[]} items
 */
function webAppExerciseViews(key, items, gymName) {
  requireKey_(key);
  var settings = readSettings_();
  var unit = weightUnit_(settings);
  var setCount = settingSetCount_(settings);
  var gymId = '', gymNames = {};
  readRegistry('gyms').forEach(function (g) {
    gymNames[g.id] = g.name;
    if (g.name.toLowerCase() === String(gymName || '').trim().toLowerCase()) gymId = g.id;
  });
  var byId = {};
  readRegistryRows('exercises').forEach(function (r) { byId[String(r['Exercise ID'])] = r; });
  var histories = getHistories_(items.map(function (i) { return i.id; }));
  var out = {};
  items.forEach(function (item) {
    var r = byId[item.id] || {};
    var sameGym = r['Same Gym Only'];
    if (sameGym !== true && sameGym !== false) sameGym = isGymSpecificEquipment(r['Equipment'] || equipmentFromName(r['Name'] || ''));
    var history = (histories[item.id] || []).filter(function (h) { return h.recordId !== item.excludeRecordId; });
    var here = gymId ? history.filter(function (h) { return h.gymId === gymId; }) : [];
    if (sameGym && here.length) history = here;
    var last = history[0];
    var goals = computeGoals(history, setCount, progressionSettings(settings, r['Increment']));
    var warm = [];
    if (r['Warm-up'] === true) {
      var working = goals.goals[0] ? goals.goals[0].load : (last && last.sets[0] ? last.sets[0].loadValue : 0);
      warm = warmupLadder(working, unit);
    }
    var sets = [];
    for (var i = 0; i < setCount; i++) {
      var ls = last && last.sets[i];
      sets.push({
        last: ls ? { load: ls.load, reps: ls.reps, assisted: ls.assisted, partial: ls.partial, rir: ls.rir === null ? '' : String(ls.rir) } : null,
        goal: goals.goals[i] || null,
      });
    }
    out[item.id] = {
      lastDate: last ? last.date : '', lastGym: last ? (gymNames[last.gymId] || '') : '',
      sets: sets, reason: goals.reason, warmup: warm,
    };
  });
  return out;
}

/**
 * Saves one exercise (creates or rewrites its record). Blank sets are skipped;
 * an exercise with no sets left deletes its existing record.
 * payload: {date, gym, workout, exerciseId, recordId, tab, sets: [{weight, reps, assisted, partial, rir, note}]}
 */
function webAppSaveExercise(key, payload) {
  requireKey_(key);
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var ex = exerciseIndex_().byId[String(payload.exerciseId)];
    if (!ex) throw new Error('Unknown exercise ' + payload.exerciseId);
    var item = { id: ex.id, name: ex.name };
    var sets = [], notes = [];
    (payload.sets || []).forEach(function (raw, i) {
      var inp = {};
      ['weight', 'reps', 'assisted', 'partial', 'note'].forEach(function (k) {
        inp[k] = raw && raw[k] !== null && raw[k] !== undefined ? String(raw[k]).trim() : '';
      });
      inp.rir = normalizeRir(raw && raw.rir);
      if (!hasSetData_(inp)) return;
      var problem = validateSetInputs_(inp, item);
      if (problem) throw new Error('Set ' + (i + 1) + ': ' + problem);
      sets.push(packSet_(inp));
      if (String(inp.note || '').trim()) notes.push('S' + (i + 1) + ': ' + String(inp.note).trim());
    });
    if (!sets.length) {
      if (payload.recordId && payload.tab) deleteWorkoutRecord_(payload.tab, payload.recordId);
      return { recordId: '', tab: '', deleted: true };
    }
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)) ? payload.date : todayIsoForScript_();
    var gymName = String(payload.gym || '').trim();
    var gymId = gymName ? ensureRegistryEntries('gyms', [gymName])[gymName.toLowerCase()] : '';
    var workout = String(payload.workout || '').trim();
    var workoutId = workout ? ensureRegistryEntries('workouts', [workout])[workout.toLowerCase()] : '';
    var exerciseId = bodyweightVariantId_(item, sets) || item.id;
    var result = writeWorkoutRecord_({ recordId: payload.recordId || '', tab: payload.tab || '', date: date, gymId: gymId,
      workoutId: workoutId, exerciseId: exerciseId, unit: weightUnit_(readSettings_()), notes: notes.join(' | '),
      source: 'app', sets: sets });
    if (gymName) { var st = getEntryState_(); st.gym = gymName; saveEntryState_(st); }
    return { recordId: result.recordId, tab: result.tab, exerciseId: exerciseId };
  } finally {
    lock.releaseLock();
  }
}

/** Finish: refresh Compiled Data (best effort). */
function webAppFinish(key) {
  requireKey_(key);
  try { refreshCompiledData(); return { refreshed: true }; } catch (err) { return { refreshed: false, error: err.message }; }
}

/** payload: {date, gym, activity, duration, speed, speedUnit, distance, distanceUnit, calories, notes} */
function webAppSaveCardio(key, payload) {
  requireKey_(key);
  var activity = String(payload.activity || '').trim();
  if (!activity) throw new Error('Pick the cardio activity.');
  var num = function (x) { return String(x === null || x === undefined ? '' : x).trim() === '' ? '' : parseFloat(x); };
  var nums = [payload.duration, payload.speed, payload.distance, payload.calories].map(num);
  if (nums.some(function (n) { return n !== '' && isNaN(n); })) throw new Error('Duration, speed, distance and calories must be numbers.');
  if (nums.every(function (n) { return n === ''; })) throw new Error('Enter at least the duration or distance.');
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)) ? payload.date : todayIsoForScript_();
    var gymName = String(payload.gym || '').trim();
    var gymId = gymName ? ensureRegistryEntries('gyms', [gymName])[gymName.toLowerCase()] : '';
    var cardioId = ensureRegistryEntries('cardio', [activity], function () { return [true]; })[activity.toLowerCase()];
    var target = getOrCreateSheet_(CONFIG.SHEETS.CARDIO, CONFIG.CARDIO_HEADERS, false);
    var id = newRecordId_('C');
    appendRows_(target, [[id, isoToDate_(date), gymId, cardioId, nums[0], nums[1], payload.speedUnit || '',
      nums[2], payload.distanceUnit || '', nums[3], String(payload.notes || '').trim(), 'app']]);
    return { recordId: id };
  } finally {
    lock.releaseLock();
  }
}

function webAppSaveBodyweight(key, payload) {
  requireKey_(key);
  var parsed = parseBodyweightInput(String(payload.weight || ''), weightUnit_(readSettings_()));
  if (!parsed) throw new Error('Enter your weight as a number, e.g. 172.4');
  var date = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)) ? payload.date : todayIsoForScript_();
  logBodyweight_(date, parsed.weight, parsed.unit, 'app');
  return { date: date, weight: parsed.weight, unit: parsed.unit };
}

function webAppSnoozeBodyweight(key) {
  requireKey_(key);
  PropertiesService.getDocumentProperties().setProperty(BODYWEIGHT.PROP_SNOOZE, addDays_(todayIsoForScript_(), BODYWEIGHT.SNOOZE_DAYS));
  return true;
}

function webAppSaveSetupNotes(key, exerciseId, text) {
  requireKey_(key);
  updateRegistryValue('exercises', exerciseId, 'Setup Notes', String(text || ''));
  return true;
}

/**
 * Creates an exercise from movement + equipment + detail (formatted with the naming rules),
 * or returns the existing one with that name. payload: {movement, equipment, detail, setup, warmup}
 */
function webAppCreateExercise(key, payload) {
  requireKey_(key);
  var movement = String(payload.movement || '').trim();
  if (!movement) throw new Error('Enter the movement name.');
  var equipment = String(payload.equipment || '').trim();
  var name = formatExerciseName({ movement: movement, equipment: equipment, detail: String(payload.detail || '').trim() }, readNamingSettings_());
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var existed = !!exerciseIndex_().byName[name.toLowerCase()];
    if (!existed) {
      ensureRegistryEntries('exercises', [name], function () {
        return [equipment, '', '', true, payload.warmup === true, String(payload.setup || ''), '', isGymSpecificEquipment(equipment)];
      });
    }
    var ex = exerciseIndex_().byName[name.toLowerCase()];
    return { id: ex.id, name: ex.name, equipment: equipment, warmup: ex.warmup, setup: String(ex.setup || ''),
      sameGym: ex.sameGym, active: ex.active, existed: existed };
  } finally {
    lock.releaseLock();
  }
}
