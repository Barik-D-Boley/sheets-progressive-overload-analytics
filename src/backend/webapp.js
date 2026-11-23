/**
 * Server side of the phone web app (ui/app.html), served by doGet from the same
 * deployment as the Apple Health link. The page loads everything it needs in one
 * call, works locally, and saves each exercise in the background.
 *
 * Functions called from the page (google.script.run) must not end in "_".
 */
/**
 * Only the sheet's owner may use the app. The Apple Health link needs a deployment that
 * anyone can call; on that deployment visitors are anonymous and get nothing here.
 */
function requireOwner_() {
  var active = Session.getActiveUser().getEmail();
  if (!active || active !== Session.getEffectiveUser().getEmail()) throw new Error('Not authorized');
}

function serveWebApp_() {
  try { requireOwner_(); } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">Not available.</p>').setTitle('Overload Tracker');
  }
  return HtmlService.createHtmlOutputFromFile('ui/app')
    .setTitle('Overload Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

/** Menu: shows the web app link (deploy as a web app first). */
function showWebAppLink() {
  var url = ScriptApp.getService().getUrl();
  var html = '<div style="font:14px sans-serif;line-height:1.5">' + (url
    ? '<p>Open this on your phone, then <b>Share → Add to Home Screen</b>:</p>' +
      '<textarea style="width:100%;height:60px" readonly>' + url + '</textarea>'
    : '<p><b>First deploy it:</b> Extensions → Apps Script → Deploy → New deployment → Web app. ' +
      'Execute as: <i>Me</i>. Who has access: <i>Only myself</i>. Then open this again.</p>') +
    '<p style="color:#666">The app only opens for you, the sheet owner. If you also use the Apple Health link, ' +
    'that needs its own deployment with access set to <i>Anyone</i>.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(200), 'Phone app');
}

function todayIsoForScript_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Everything the page needs to start. */
function webAppLoad() {
  requireOwner_();
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
    bodyweight: { latest: latest, needsWeighIn: needsWeighIn(log, today, snooze) },
  };
}

/**
 * Last / Goal / warm-up for each exercise (one read of the quarter tabs).
 * @param {{id: string, excludeRecordId?: string}[]} items
 */
function webAppExerciseViews(items, gymName) {
  requireOwner_();
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
function webAppSaveExercise(payload) {
  requireOwner_();
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
function webAppFinish() {
  requireOwner_();
  try { refreshCompiledData(); return { refreshed: true }; } catch (err) { return { refreshed: false, error: err.message }; }
}

/** payload: {date, gym, activity, duration, speed, speedUnit, distance, distanceUnit, calories, notes} */
function webAppSaveCardio(payload) {
  requireOwner_();
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

function webAppSaveBodyweight(payload) {
  requireOwner_();
  var parsed = parseBodyweightInput(String(payload.weight || ''), weightUnit_(readSettings_()));
  if (!parsed) throw new Error('Enter your weight as a number, e.g. 172.4');
  var date = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date)) ? payload.date : todayIsoForScript_();
  logBodyweight_(date, parsed.weight, parsed.unit, 'app');
  return { date: date, weight: parsed.weight, unit: parsed.unit };
}

function webAppSnoozeBodyweight() {
  requireOwner_();
  PropertiesService.getDocumentProperties().setProperty(BODYWEIGHT.PROP_SNOOZE, addDays_(todayIsoForScript_(), BODYWEIGHT.SNOOZE_DAYS));
  return true;
}

function webAppSaveSetupNotes(exerciseId, text) {
  requireOwner_();
  updateRegistryValue('exercises', exerciseId, 'Setup Notes', String(text || ''));
  return true;
}
