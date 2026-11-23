/**
 * Mobile workout entry form on the "Workout Entry" tab.
 *
 * One set is shown at a time. Inputs run top to bottom (Weight, Reps, Assisted,
 * Partial, RIR, Set notes) so Enter moves down. Buttons are checkboxes: checking
 * one runs its action and the script unchecks it. Each exercise is written to
 * its quarter tab when you move past it; Back can reopen it and Next rewrites it.
 *
 * Session state (queue, current exercise/set, unsaved inputs) is kept in
 * document properties under CONFIG.PROP_ENTRY_STATE.
 */
var ENTRY = {
  // Header: labels in column A, values and dropdowns in column B.
  DATE: 'B1', GYM: 'B2', ROUTINE: 'B3',
  FIND: 'B4',
  EXERCISE_LABEL: 'A5', EXERCISE: 'B5',
  SETUP: 'B6',
  SET_TITLE: 'A7',
  LAST_LABEL: 'A8', LAST: 'B8',
  GOAL_LABEL: 'A9', GOAL: 'B9',
  WARMUP_LABEL: 'A10', WARMUP: 'B10',
  INPUT_FIRST_ROW: 11, // B11:B16 = weight, reps, assisted, partial, rir, set note
  BACK_BTN: 'B17', NEXT_BTN: 'B18', FINISH_BTN: 'B19',
  MESSAGE: 'A20',
  CARDIO_BTN: 'B21', BODYWEIGHT_BTN: 'B22',
  LIFT_ROWS: [5, 19],

  CARDIO_ROWS: [24, 32],
  CARDIO_ACTIVITY: 'B25', CARDIO_FIRST_ROW: 26, // B26:B30 = duration, speed, distance, calories, notes
  CARDIO_SPEED_UNIT: 'C27', CARDIO_DIST_UNIT: 'C28',
  CARDIO_SAVE_BTN: 'B31', CARDIO_CANCEL_BTN: 'B32',

  BW_ROWS: [34, 38],
  BW_PROMPT: 'A35', BW_INPUT: 'B36', BW_SAVE_BTN: 'B37', BW_SKIP_BTN: 'B38',

  LAST_ROW: 38,
};
var CUSTOM_ROUTINE = 'Custom';
var DONE_MARK = '✓ ';
var DROPDOWN_DIVIDER = '──────────';

// ---- state ----------------------------------------------------------------

function getEntryState_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(CONFIG.PROP_ENTRY_STATE);
  var state = raw ? JSON.parse(raw) : null;
  return state || { date: '', workout: '', queue: [], index: 0, set: 0, mode: 'lift' };
}

function saveEntryState_(state) {
  PropertiesService.getDocumentProperties().setProperty(CONFIG.PROP_ENTRY_STATE, JSON.stringify(state));
}

function entrySheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.ENTRY);
  if (!sheet) throw new Error('Run "Set up workout entry form" first.');
  return sheet;
}

// ---- edit router ----------------------------------------------------------

/** Called from onEdit. Returns true when the edit belonged to the entry form. */
function entryOnEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.ENTRY) return false;
  var a1 = e.range.getA1Notation().split(':')[0]; // merged cells report their whole range
  var checked = e.value === 'TRUE' || e.value === true;
  var actions = {};
  actions[ENTRY.GYM] = function () { entryGymChanged_(e.value); };
  actions[ENTRY.ROUTINE] = function () { entryStartWorkout_(e.value); };
  actions[ENTRY.EXERCISE] = function () { entryExerciseChosen_(e.value); };
  actions[ENTRY.SETUP] = function () { entrySetupNotesChanged_(e.value); };
  actions[ENTRY.CARDIO_ACTIVITY] = function () { entryCardioActivityChanged_(e.value); };
  actions[ENTRY.FIND] = function () { entryFindChanged_(e.value); };
  var buttons = {};
  buttons[ENTRY.NEXT_BTN] = entryNext_;
  buttons[ENTRY.BACK_BTN] = entryBack_;
  buttons[ENTRY.FINISH_BTN] = entryFinish_;
  buttons[ENTRY.CARDIO_BTN] = entryOpenCardio_;
  buttons[ENTRY.CARDIO_SAVE_BTN] = entrySaveCardio_;
  buttons[ENTRY.CARDIO_CANCEL_BTN] = entryCloseSubform_;
  buttons[ENTRY.BODYWEIGHT_BTN] = function () { entryOpenBodyweight_(''); };
  buttons[ENTRY.BW_SAVE_BTN] = entrySaveBodyweight_;
  buttons[ENTRY.BW_SKIP_BTN] = entrySkipBodyweight_;
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    if (buttons[a1]) {
      if (!checked) return true;
      e.range.setValue(false);
      buttons[a1]();
    } else if (actions[a1]) {
      actions[a1]();
    }
  } catch (err) {
    showEntryMessage_('⚠ ' + err.message);
  } finally {
    lock.releaseLock();
  }
  return true;
}

// ---- starting and navigating ----------------------------------------------

/** Picking a routine loads its exercises; records are saved under the routine's workout (Push/Pull/Legs...). */
function entryStartWorkout_(routineName) {
  var state = getEntryState_();
  if (state.queue.length) saveCurrentExercise_(state, readInputs_(), true);
  var routine = readRoutine_(routineName);
  var exercises = exerciseIndex_();
  var queue = [];
  routine.exercises.forEach(function (n) {
    var ex = exercises.byName[n.toLowerCase()];
    if (ex) queue.push(newQueueItem_(ex));
  });
  var sheet = entrySheet_();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.getRange(ENTRY.DATE).setValue(isoToDate_(today));
  state = { date: today, routine: routineName, workout: routine.workout || routineName, queue: queue, index: 0, set: 0, mode: 'lift' };
  saveEntryState_(state);
  var gymPicked = String(sheet.getRange(ENTRY.GYM).getValue()).trim();
  var emptyMessage = String(routineName).trim().toLowerCase() === CUSTOM_ROUTINE.toLowerCase()
    ? 'Custom workout: type in Find, then pick exercises from the Exercise list.'
    : 'No exercises in "' + routineName + '" yet. Pick exercises from the list, or add them to the routine on Master.';
  renderEntry_(state, !queue.length ? emptyMessage : (gymPicked ? '' : 'Pick your gym at the top before logging.'));
  var snooze = PropertiesService.getDocumentProperties().getProperty(BODYWEIGHT.PROP_SNOOZE);
  if (needsWeighIn(readBodyweightLog_(), today, snooze)) entryOpenBodyweight_(today);
}

function newQueueItem_(ex) {
  return { id: ex.id, name: ex.name, done: false, inputs: [], recordId: '', tab: '' };
}

function entryExerciseChosen_(label) {
  var state = getEntryState_();
  if (!label || label === DROPDOWN_DIVIDER) { renderEntry_(state); return; }
  var name = String(label).replace(DONE_MARK, '');
  if (state.queue.length) saveCurrentExercise_(state, readInputs_(), true);
  var idx = -1;
  state.queue.forEach(function (q, i) { if (q.name.toLowerCase() === name.toLowerCase()) idx = i; });
  if (idx < 0) {
    var ex = exerciseIndex_().byName[name.toLowerCase()];
    if (!ex) throw new Error('Unknown exercise "' + name + '"');
    idx = state.queue.length ? state.index + 1 : 0;
    state.queue.splice(idx, 0, newQueueItem_(ex));
  }
  state.index = idx;
  state.set = 0;
  saveEntryState_(state);
  renderEntry_(state);
}

function entryNext_() {
  var state = getEntryState_();
  var item = state.queue[state.index];
  if (!item) { showEntryMessage_('Pick a workout or an exercise first.'); return; }
  var inputs = readInputs_();
  var problem = validateSetInputs_(inputs, item);
  if (problem) { showEntryMessage_('⚠ ' + problem); return; }
  item.inputs[state.set] = inputs;
  var setCount = settingSetCount_(readSettings_());

  if (state.set < setCount - 1) {
    state.set++;
    saveEntryState_(state);
    renderEntry_(state);
    return;
  }
  var saved = saveCurrentExercise_(state, null, false);
  if (!saved) item.skipped = true;
  var next = -1;
  for (var i = 1; i < state.queue.length; i++) {
    var j = (state.index + i) % state.queue.length;
    if (!state.queue[j].done && !state.queue[j].skipped) { next = j; break; }
  }
  if (next >= 0) { state.index = next; state.set = 0; }
  saveEntryState_(state);
  renderEntry_(state, (saved ? 'Saved ' + item.name + '.' : 'Skipped ' + item.name + ' (no sets).') +
    (next < 0 ? ' All exercises done: check Finish workout.' : ''));
}

function entryBack_() {
  var state = getEntryState_();
  var item = state.queue[state.index];
  if (!item) return;
  item.inputs[state.set] = readInputs_(); // keep what was typed, even if incomplete
  if (state.set > 0) {
    state.set--;
  } else if (state.index > 0) {
    saveCurrentExercise_(state, null, true);
    state.index--;
    state.set = Math.max(0, settingSetCount_(readSettings_()) - 1);
  }
  saveEntryState_(state);
  renderEntry_(state);
}

function entryFinish_() {
  var state = getEntryState_();
  if (state.queue[state.index]) saveCurrentExercise_(state, readInputs_(), true);
  var done = state.queue.filter(function (q) { return q.done; });
  var sets = done.reduce(function (n, q) { return n + q.inputs.filter(hasSetData_).length; }, 0);
  var gym = state.gym || entrySheet_().getRange(ENTRY.GYM).getValue();
  saveEntryState_({ date: '', workout: '', queue: [], index: 0, set: 0, mode: 'lift', gym: gym });
  var sheet = entrySheet_();
  sheet.getRange(ENTRY.ROUTINE).setValue('');
  var refreshNote = '';
  try { refreshCompiledData(); } catch (err) { refreshNote = ' (Compiled Data refresh failed: ' + err.message + ')'; }
  renderEntry_(getEntryState_(), (done.length
    ? 'Workout saved: ' + done.length + ' exercises, ' + sets + ' sets.' : 'Nothing to save.') + refreshNote);
}

/** Find box: limits the Exercise list to names containing the text (routine exercises always stay). */
function entryFindChanged_(text) {
  var state = getEntryState_();
  state.find = String(text || '').trim();
  saveEntryState_(state);
  var count = renderEntry_(state);
  if (state.find) showEntryMessage_(count ? count + ' match' + (count === 1 ? '' : 'es') + ' in the Exercise list.' : 'No exercises match "' + state.find + '".');
}

function entryGymChanged_(gymName) {
  if (gymName) ensureRegistryEntries('gyms', [String(gymName).trim()]);
  var state = getEntryState_();
  state.gym = gymName || '';
  saveEntryState_(state);
  if (state.queue.length) renderEntry_(state);
}

function entrySetupNotesChanged_(text) {
  var state = getEntryState_();
  var item = state.queue[state.index];
  if (!item) return;
  updateRegistryValue('exercises', item.id, 'Setup Notes', text || '');
  showEntryMessage_('Setup notes saved for ' + item.name + '.');
}

// ---- saving ---------------------------------------------------------------

function hasSetData_(inputs) {
  return !!inputs && ['weight', 'reps', 'assisted', 'partial', 'rir', 'note'].some(function (k) {
    return String(inputs[k] === undefined || inputs[k] === null ? '' : inputs[k]).trim() !== '';
  });
}

/** Returns a problem description, or '' when the set can be saved (blank sets are allowed). */
function validateSetInputs_(inputs, item) {
  if (!hasSetData_(inputs)) return '';
  var weight = String(inputs.weight).trim();
  if (weight === '' && !/\(BW\b/.test(item.name)) return 'Enter a weight (use 0 for no added weight).';
  if (weight !== '' && evalLoadExpr(weight) === null) return 'Weight "' + weight + '" is not a number (plates like 2*45+25 are OK).';
  var reps = parseFloat(inputs.reps);
  if (!(reps >= 0) || String(inputs.reps).trim() === '') return 'Enter the reps for this set.';
  var extras = { assisted: 'Assisted', partial: 'Partial' };
  for (var k in extras) {
    var v = String(inputs[k]).trim();
    if (v !== '' && !(parseFloat(v) >= 0)) return extras[k] + ' reps must be a number.';
  }
  if (String(inputs.rir).trim() !== '' && RIR_OPTIONS.indexOf(String(inputs.rir)) < 0) return 'Pick RIR from the list.';
  return '';
}

function packSet_(inputs) {
  if (!hasSetData_(inputs) || String(inputs.reps).trim() === '') return '';
  var weight = String(inputs.weight).trim() || '0';
  return formatSetCell({ load: weight, reps: parseFloat(inputs.reps), assisted: parseFloat(inputs.assisted) || 0,
    partial: parseFloat(inputs.partial) || 0, rir: String(inputs.rir).trim() || null, rpe: null });
}

/**
 * Writes the current exercise to its quarter tab if it has any set data.
 * pendingInputs (optional) are the visible inputs for the current set; when
 * lenient, invalid pending inputs are kept in state but not written.
 */
function saveCurrentExercise_(state, pendingInputs, lenient) {
  var item = state.queue[state.index];
  if (!item) return false;
  if (pendingInputs && hasSetData_(pendingInputs)) {
    var problem = validateSetInputs_(pendingInputs, item);
    if (problem && !lenient) throw new Error(problem);
    item.inputs[state.set] = pendingInputs;
  }
  var setInputs = item.inputs.filter(function (inp) { return hasSetData_(inp) && !validateSetInputs_(inp, item); });
  if (!setInputs.length) return false;

  var settings = readSettings_();
  var sheet = entrySheet_();
  var dateValue = sheet.getRange(ENTRY.DATE).getValue();
  var date = dateToIso_(dateValue) || state.date;
  if (!date) {
    date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.getRange(ENTRY.DATE).setValue(isoToDate_(date));
  }
  var gymName = String(sheet.getRange(ENTRY.GYM).getValue() || state.gym || '').trim();
  var gymId = gymName ? ensureRegistryEntries('gyms', [gymName])[gymName.toLowerCase()] : '';
  var workoutId = state.workout ? ensureRegistryEntries('workouts', [state.workout])[state.workout.toLowerCase()] : '';

  var sets = [], notes = [];
  item.inputs.forEach(function (inp, i) {
    if (!hasSetData_(inp) || validateSetInputs_(inp, item)) return;
    sets.push(packSet_(inp));
    if (String(inp.note || '').trim()) notes.push('S' + (i + 1) + ': ' + String(inp.note).trim());
  });

  var exerciseId = bodyweightVariantId_(item, sets) || item.id;
  var result = writeWorkoutRecord_({ recordId: item.recordId, tab: item.tab, date: date, gymId: gymId,
    workoutId: workoutId, exerciseId: exerciseId, unit: weightUnit_(settings), notes: notes.join(' | '),
    source: 'entry', sets: sets });
  item.recordId = result.recordId;
  item.tab = result.tab;
  item.done = true;
  item.skipped = false;
  return true;
}

/** "Hanging leg raises (DB)" logged with 0 weight on every set -> the "(BW)" exercise, if it exists. */
function bodyweightVariantId_(item, packedSets) {
  var allZero = packedSets.length && packedSets.every(function (s) { var p = parseSetCell(s); return p && p.loadValue === 0; });
  if (!allZero || /\(BW\b/.test(item.name)) return '';
  var bwName = item.name.replace(/\(([^,)]+)/, '(' + (readNamingSettings_().equipmentTags['Bodyweight'] || 'BW'));
  var ex = exerciseIndex_().byName[bwName.toLowerCase()];
  return ex ? ex.id : '';
}

// ---- rendering --------------------------------------------------------------

function readInputs_() {
  var v = entrySheet_().getRange(ENTRY.INPUT_FIRST_ROW, 2, 6, 1).getValues();
  return { weight: v[0][0], reps: v[1][0], assisted: v[2][0], partial: v[3][0], rir: normalizeRir(v[4][0]), note: v[5][0] };
}

function exerciseIndex_() {
  var byName = {}, byId = {};
  readRegistryRows('exercises').forEach(function (r) {
    var sameGym = r['Same Gym Only'];
    if (sameGym !== true && sameGym !== false) sameGym = isGymSpecificEquipment(r['Equipment'] || equipmentFromName(r['Name']));
    var ex = { id: String(r['Exercise ID']), name: String(r['Name']), active: r['Active'] !== false,
      warmup: r['Warm-up'] === true, setup: r['Setup Notes'], increment: r['Increment'], sameGym: sameGym };
    byName[ex.name.toLowerCase()] = ex;
    byId[ex.id] = ex;
  });
  return { byName: byName, byId: byId };
}

/** @return {{workout: string, exercises: string[]}} the named routine (archived ones included). */
function readRoutine_(routineName) {
  var key = String(routineName).trim().toLowerCase();
  var r = readRoutines_().filter(function (x) { return x.name.toLowerCase() === key; })[0];
  return r ? { workout: r.workout, exercises: r.exercises } : { workout: '', exercises: [] };
}

function showEntryMessage_(text) {
  entrySheet_().getRange(ENTRY.MESSAGE).setValue(text || '');
}

function setEntryMode_(state, mode) {
  state.mode = mode;
  saveEntryState_(state);
  var sheet = entrySheet_();
  var blocks = { lift: ENTRY.LIFT_ROWS, cardio: ENTRY.CARDIO_ROWS, bodyweight: ENTRY.BW_ROWS };
  Object.keys(blocks).forEach(function (m) {
    var b = blocks[m];
    if (m === mode) sheet.showRows(b[0], b[1] - b[0] + 1);
    else sheet.hideRows(b[0], b[1] - b[0] + 1);
  });
  if (mode === 'lift') renderEntry_(state);
  else if (mode === 'cardio') showEntryMessage_('Log cardio, then check Save.');
}

function entryCloseSubform_() {
  setEntryMode_(getEntryState_(), 'lift');
}

/**
 * Per-exercise display data (Last, Goal, warm-up for every set), computed once when an
 * exercise is opened and cached on the queue item. Recomputed when the gym changes or
 * the exercise is saved. History: same-gym exercises (machines, cables, PL, Smith) use
 * the current gym's sessions, falling back to every gym; free weights use every gym.
 */
function exerciseView_(item, ex, ctx) {
  var key = ctx.gymId + '|' + (item.recordId || '');
  if (item.view && item.view.key === key) return item.view;
  var history = getExerciseHistory_(item.id).filter(function (h) { return h.recordId !== item.recordId; });
  var hereHistory = ctx.gymId ? history.filter(function (h) { return h.gymId === ctx.gymId; }) : [];
  if (ex.sameGym && hereHistory.length) history = hereHistory;
  var last = history[0];
  var goals = computeGoals(history, ctx.setCount, progressionSettings(ctx.settings, ex.increment));
  var view = { key: key, lastLabel: 'Last', last: [], goals: [], warmup: '' };
  if (last) view.lastLabel = 'Last · ' + shortDate_(last.date) + (ctx.gymNames[last.gymId] ? ' ' + ctx.gymNames[last.gymId] : '');
  for (var i = 0; i < ctx.setCount; i++) {
    view.last.push(!last ? 'First time' : (last.sets[i] ? formatSetCell(last.sets[i]).replace(/x/, ' x ') : '—'));
    view.goals.push(goals.goals[i] ? formatGoal(goals.goals[i]) + '  (' + goals.reason + ')' : '');
  }
  if (ex.warmup) {
    var working = goals.goals[0] ? goals.goals[0].load : (last && last.sets[0] ? last.sets[0].loadValue : 0);
    view.warmup = formatWarmup(warmupLadder(working, ctx.unit));
  }
  item.view = view;
  return view;
}

/** Redraws the lifting block for the current exercise and set. Returns the number of Find matches. */
function renderEntry_(state, message) {
  var sheet = entrySheet_();
  var settings = readSettings_();
  var unit = weightUnit_(settings);
  var setCount = settingSetCount_(settings);
  var exercises = exerciseIndex_();
  var item = state.queue[state.index];

  // Exercise dropdown: routine first (✓ when saved), then other active exercises matching Find.
  var inQueue = {};
  var options = state.queue.map(function (q) { inQueue[q.name.toLowerCase()] = true; return (q.done ? DONE_MARK : '') + q.name; });
  var find = String(state.find || '').toLowerCase();
  var others = Object.keys(exercises.byName).map(function (k) { return exercises.byName[k]; })
    .filter(function (ex) { return ex.active && !inQueue[ex.name.toLowerCase()] && (!find || ex.name.toLowerCase().indexOf(find) >= 0); })
    .map(function (ex) { return ex.name; }).sort();
  if (others.length) options = options.concat(options.length ? [DROPDOWN_DIVIDER] : [], others);
  if (!options.length) options = [DROPDOWN_DIVIDER];
  var optionsKey = hashText_(options.join('\n'));
  if (state.optionsKey !== optionsKey) { // rebuilding the dropdown is slow; only when it changed
    sheet.getRange(ENTRY.EXERCISE).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(options.slice(0, 500), true).setAllowInvalid(false).build());
    state.optionsKey = optionsKey;
  }
  var exerciseLabel = state.queue.length ? 'Exercise (' + (state.index + 1) + ' of ' + state.queue.length + ')' : 'Exercise';

  if (!item) {
    sheet.getRange(ENTRY.EXERCISE_LABEL).setValue(exerciseLabel);
    sheet.getRange('B5:B6').setValues([[''], ['']]);
    sheet.getRange(ENTRY.SET_TITLE).setValue('');
    sheet.getRange('A8:A11').setValues([['Last'], ['Goal'], [''], ['Weight (' + unit + ')']]);
    sheet.getRange('B8:B16').setValues([[''], [''], [''], [''], [''], [''], [''], [''], ['']]);
    var isCustom = String(state.routine || '').toLowerCase() === CUSTOM_ROUTINE.toLowerCase();
    showEntryMessage_(message || (isCustom ? 'Custom workout: type in Find, then pick exercises from the Exercise list.'
      : 'Pick a routine (or Custom) to start.'));
    saveEntryState_(state);
    return others.length;
  }

  var ex = exercises.byId[item.id] || { warmup: false, setup: '', increment: '', sameGym: false };
  var header = sheet.getRange('B2:B3').getValues();
  var gymName = String(header[0][0] || state.gym || '').trim();
  var gyms = readRegistry('gyms');
  var gymId = '', gymNames = {};
  gyms.forEach(function (g) { gymNames[g.id] = g.name; if (g.name.toLowerCase() === gymName.toLowerCase()) gymId = g.id; });
  var view = exerciseView_(item, ex, { gymId: gymId, gymNames: gymNames, settings: settings, setCount: setCount, unit: unit });
  var showWarmup = ex.warmup && state.set === 0;

  // Inputs: what was entered before, else the previous set's weight.
  var inp = item.inputs[state.set];
  if (!hasSetData_(inp)) {
    var prev = item.inputs[state.set - 1];
    inp = { weight: prev && hasSetData_(prev) ? prev.weight : '', reps: '', assisted: '', partial: '', rir: '', note: '' };
  }
  // Batched writes (each range call costs a round trip).
  sheet.getRange(ENTRY.EXERCISE_LABEL).setValue(exerciseLabel);
  sheet.getRange('B5:B6').setValues([[(item.done ? DONE_MARK : '') + item.name], [ex.setup || '']]);
  sheet.getRange(ENTRY.SET_TITLE).setValue('SET ' + (state.set + 1) + ' of ' + setCount);
  sheet.getRange('A8:A11').setValues([[view.lastLabel], ['Goal'], [showWarmup ? 'Warm-up' : ''], ['Weight (' + unit + ')']]);
  sheet.getRange('B8:B16').setValues([[view.last[state.set] || '—'], [view.goals[state.set] || ''],
    [showWarmup ? view.warmup : ''], [inp.weight], [inp.reps], [inp.assisted], [inp.partial], [inp.rir], [inp.note]]);
  showEntryMessage_(message || '');
  saveEntryState_(state);
  return others.length;
}

// ---- cardio -----------------------------------------------------------------

function entryOpenCardio_() {
  var state = getEntryState_();
  var sheet = entrySheet_();
  sheet.getRange(ENTRY.CARDIO_ACTIVITY).setValue('');
  sheet.getRange(ENTRY.CARDIO_FIRST_ROW, 2, 5, 1).setValues([[''], [''], [''], [''], ['']]);
  setEntryMode_(state, 'cardio');
}

/** Prefills units from the last time this activity was logged. */
function entryCardioActivityChanged_(activity) {
  if (!activity) return;
  var ids = ensureRegistryEntries('cardio', [String(activity).trim()], function () { return [true]; });
  var id = ids[String(activity).trim().toLowerCase()];
  var cardio = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.CARDIO);
  var speedUnit = weightUnit_(readSettings_()) === 'kg' ? 'kph' : 'mph';
  var distUnit = speedUnit === 'kph' ? 'km' : 'mi';
  if (cardio && cardio.getLastRow() > 1) {
    var rows = cardio.getRange(2, 1, cardio.getLastRow() - 1, CONFIG.CARDIO_HEADERS.length).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][3]) === id) { speedUnit = rows[i][6] || speedUnit; distUnit = rows[i][8] || distUnit; break; }
    }
  }
  var sheet = entrySheet_();
  sheet.getRange(ENTRY.CARDIO_SPEED_UNIT).setValue(speedUnit);
  sheet.getRange(ENTRY.CARDIO_DIST_UNIT).setValue(distUnit);
}

function entrySaveCardio_() {
  var sheet = entrySheet_();
  var activity = String(sheet.getRange(ENTRY.CARDIO_ACTIVITY).getValue()).trim();
  var v = sheet.getRange(ENTRY.CARDIO_FIRST_ROW, 2, 5, 1).getValues();
  var nums = [v[0][0], v[1][0], v[2][0], v[3][0]];
  if (!activity) { showEntryMessage_('⚠ Pick the cardio activity.'); return; }
  for (var i = 0; i < nums.length; i++) {
    if (String(nums[i]).trim() !== '' && isNaN(parseFloat(nums[i]))) { showEntryMessage_('⚠ Duration, speed, distance and calories must be numbers.'); return; }
  }
  if (nums.every(function (x) { return String(x).trim() === ''; })) { showEntryMessage_('⚠ Enter at least the duration or distance.'); return; }
  var state = getEntryState_();
  var date = dateToIso_(sheet.getRange(ENTRY.DATE).getValue()) ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var gymName = String(sheet.getRange(ENTRY.GYM).getValue() || '').trim();
  var gymId = gymName ? ensureRegistryEntries('gyms', [gymName])[gymName.toLowerCase()] : '';
  var cardioId = ensureRegistryEntries('cardio', [activity], function () { return [true]; })[activity.toLowerCase()];
  var target = getOrCreateSheet_(CONFIG.SHEETS.CARDIO, CONFIG.CARDIO_HEADERS, false);
  var num = function (x) { return String(x).trim() === '' ? '' : parseFloat(x); };
  appendRows_(target, [[newRecordId_('C'), isoToDate_(date), gymId, cardioId, num(nums[0]), num(nums[1]),
    sheet.getRange(ENTRY.CARDIO_SPEED_UNIT).getValue(), num(nums[2]), sheet.getRange(ENTRY.CARDIO_DIST_UNIT).getValue(),
    num(nums[3]), String(v[4][0]).trim(), 'entry']]);
  setEntryMode_(state, 'lift');
  showEntryMessage_('Saved cardio: ' + activity + '.');
}

// ---- bodyweight ---------------------------------------------------------------

/** Shows the bodyweight block; todayIso is set when opened by the stale-weigh-in check. */
function entryOpenBodyweight_(todayIso) {
  var today = todayIso || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var latest = bodyweightOn(today, readBodyweightLog_());
  var sheet = entrySheet_();
  var prompt = latest
    ? 'Last weigh-in: ' + latest.weight + ' ' + latest.unit + ', ' + latest.ageDays + ' days ago. Log today\'s weight?'
    : 'No bodyweight logged yet. It is used for relative strength.';
  sheet.getRange(ENTRY.BW_PROMPT).setValue(prompt);
  sheet.getRange(ENTRY.BW_INPUT).setValue('');
  sheet.getRange(ENTRY.BW_SKIP_BTN.replace('B', 'A')).setValue(latest ? 'Not now (keep ' + latest.weight + ' ' + latest.unit + ')' : 'Not now');
  setEntryMode_(getEntryState_(), 'bodyweight');
  showEntryMessage_('');
}

function entrySaveBodyweight_() {
  var sheet = entrySheet_();
  var unit = weightUnit_(readSettings_());
  var parsed = parseBodyweightInput(sheet.getRange(ENTRY.BW_INPUT).getValue(), unit);
  if (!parsed) { showEntryMessage_('⚠ Enter your weight as a number, e.g. 172.4'); return; }
  var date = dateToIso_(sheet.getRange(ENTRY.DATE).getValue()) ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  logBodyweight_(date, parsed.weight, parsed.unit, 'entry');
  setEntryMode_(getEntryState_(), 'lift');
  showEntryMessage_('Bodyweight saved: ' + parsed.weight + ' ' + parsed.unit + '.');
}

/** "Not now": keep using the last weight and don't ask again for a week. */
function entrySkipBodyweight_() {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  PropertiesService.getDocumentProperties().setProperty(BODYWEIGHT.PROP_SNOOZE, addDays_(today, BODYWEIGHT.SNOOZE_DAYS));
  setEntryMode_(getEntryState_(), 'lift');
}

/** '2026-11-14' -> '11/14/26'. */
function shortDate_(iso) {
  return parseInt(iso.slice(5, 7), 10) + '/' + parseInt(iso.slice(8, 10), 10) + '/' + iso.slice(2, 4);
}

/** Short fingerprint of a string (document properties are size-limited). */
function hashText_(text) {
  var h = 5381;
  for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36) + ':' + text.length;
}
