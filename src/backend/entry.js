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
  DATE: 'A1', GYM: 'B1',
  WORKOUT: 'A2', PROGRESS: 'B2',
  CARDIO_BTN: 'B3',
  EXERCISE: 'A4',
  SETUP: 'B5',
  SET_TITLE: 'A6',
  LAST_LABEL: 'A7', LAST: 'B7',
  GOAL_LABEL: 'A8', GOAL: 'B8',
  WARMUP_LABEL: 'A9', WARMUP: 'B9',
  INPUT_FIRST_ROW: 10, // B10:B15 = weight, reps, assisted, partial, rir, set note
  BACK_BTN: 'B16', NEXT_BTN: 'B17', FINISH_BTN: 'B18',
  MESSAGE: 'A19',
  LIFT_ROWS: [4, 18],

  CARDIO_ROWS: [21, 29],
  CARDIO_ACTIVITY: 'B22', CARDIO_FIRST_ROW: 23, // B23:B27 = duration, speed, distance, calories, notes
  CARDIO_SPEED_UNIT: 'C24', CARDIO_DIST_UNIT: 'C25',
  CARDIO_SAVE_BTN: 'B28', CARDIO_CANCEL_BTN: 'B29',

  NEW_ROWS: [31, 39],
  NEW_FIRST_ROW: 32, // B32:B36 = movement, equipment, detail, warm-up, setup notes
  NEW_PREVIEW: 'B37', NEW_CREATE_BTN: 'B38', NEW_CANCEL_BTN: 'B39',
};
var NEW_EXERCISE_OPTION = '+ New exercise…';
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
  actions[ENTRY.WORKOUT] = function () { entryStartWorkout_(e.value); };
  actions[ENTRY.EXERCISE] = function () { entryExerciseChosen_(e.value); };
  actions[ENTRY.SETUP] = function () { entrySetupNotesChanged_(e.value); };
  actions[ENTRY.CARDIO_ACTIVITY] = function () { entryCardioActivityChanged_(e.value); };
  var buttons = {};
  buttons[ENTRY.NEXT_BTN] = entryNext_;
  buttons[ENTRY.BACK_BTN] = entryBack_;
  buttons[ENTRY.FINISH_BTN] = entryFinish_;
  buttons[ENTRY.CARDIO_BTN] = entryOpenCardio_;
  buttons[ENTRY.CARDIO_SAVE_BTN] = entrySaveCardio_;
  buttons[ENTRY.CARDIO_CANCEL_BTN] = entryCloseSubform_;
  buttons[ENTRY.NEW_CREATE_BTN] = entryCreateExercise_;
  buttons[ENTRY.NEW_CANCEL_BTN] = entryCloseSubform_;
  var newInputs = {};
  for (var r = ENTRY.NEW_FIRST_ROW; r < ENTRY.NEW_FIRST_ROW + 3; r++) newInputs['B' + r] = true;

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    if (buttons[a1]) {
      if (!checked) return true;
      e.range.setValue(false);
      buttons[a1]();
    } else if (actions[a1]) {
      actions[a1]();
    } else if (newInputs[a1]) {
      entryUpdateNewPreview_();
    }
  } catch (err) {
    showEntryMessage_('⚠ ' + err.message);
  } finally {
    lock.releaseLock();
  }
  return true;
}

// ---- starting and navigating ----------------------------------------------

function entryStartWorkout_(workoutName) {
  var state = getEntryState_();
  if (state.queue.length) saveCurrentExercise_(state, readInputs_(), true);
  var names = readRoutine_(workoutName);
  var exercises = exerciseIndex_();
  var queue = [];
  names.forEach(function (n) {
    var ex = exercises.byName[n.toLowerCase()];
    if (ex) queue.push(newQueueItem_(ex));
  });
  var sheet = entrySheet_();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sheet.getRange(ENTRY.DATE).setValue(isoToDate_(today));
  state = { date: today, workout: workoutName, queue: queue, index: 0, set: 0, mode: 'lift' };
  saveEntryState_(state);
  var gymPicked = String(sheet.getRange(ENTRY.GYM).getValue()).trim();
  renderEntry_(state, !queue.length
    ? 'No routine for "' + workoutName + '" yet. Pick exercises from the dropdown, or add a routine on Master.'
    : (gymPicked ? '' : 'Pick your gym at the top before logging.'));
}

function newQueueItem_(ex) {
  return { id: ex.id, name: ex.name, done: false, inputs: [], recordId: '', tab: '' };
}

function entryExerciseChosen_(label) {
  var state = getEntryState_();
  if (!label || label === DROPDOWN_DIVIDER) { renderEntry_(state); return; }
  if (label === NEW_EXERCISE_OPTION) { setEntryMode_(state, 'new'); return; }
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
  sheet.getRange(ENTRY.WORKOUT).setValue('');
  var refreshNote = '';
  try { refreshCompiledData(); } catch (err) { refreshNote = ' (Compiled Data refresh failed: ' + err.message + ')'; }
  renderEntry_(getEntryState_(), (done.length
    ? 'Workout saved: ' + done.length + ' exercises, ' + sets + ' sets.' : 'Nothing to save.') + refreshNote);
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
    var ex = { id: String(r['Exercise ID']), name: String(r['Name']), active: r['Active'] !== false,
      warmup: r['Warm-up'] === true, setup: r['Setup Notes'], increment: r['Increment'] };
    byName[ex.name.toLowerCase()] = ex;
    byId[ex.id] = ex;
  });
  return { byName: byName, byId: byId };
}

function readRoutine_(workoutName) {
  var master = getMasterSheet_();
  var col = columnLetterToIndex(CONFIG.ROUTINES.column);
  var last = master.getLastRow();
  if (last < 3) return [];
  var rows = master.getRange(3, col, last - 2, CONFIG.ROUTINES.maxExercises + 1).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(workoutName).trim().toLowerCase()) {
      return rows[i].slice(1).map(String).map(function (s) { return s.trim(); }).filter(String);
    }
  }
  return [];
}

function showEntryMessage_(text) {
  entrySheet_().getRange(ENTRY.MESSAGE).setValue(text || '');
}

function setEntryMode_(state, mode) {
  state.mode = mode;
  saveEntryState_(state);
  var sheet = entrySheet_();
  var blocks = { lift: ENTRY.LIFT_ROWS, cardio: ENTRY.CARDIO_ROWS, 'new': ENTRY.NEW_ROWS };
  Object.keys(blocks).forEach(function (m) {
    var b = blocks[m];
    if (m === mode) sheet.showRows(b[0], b[1] - b[0] + 1);
    else sheet.hideRows(b[0], b[1] - b[0] + 1);
  });
  if (mode === 'new') {
    sheet.getRange(ENTRY.NEW_FIRST_ROW, 2, 5, 1).setValues([[''], [''], [''], [false], ['']]);
    sheet.getRange(ENTRY.NEW_PREVIEW).setValue('');
  }
  if (mode === 'lift') renderEntry_(state);
  else showEntryMessage_(mode === 'new' ? 'Fill in the new exercise, then check Create.' : 'Log cardio, then check Save.');
}

function entryCloseSubform_() {
  setEntryMode_(getEntryState_(), 'lift');
}

/** Redraws the lifting block for the current exercise and set. */
function renderEntry_(state, message) {
  var sheet = entrySheet_();
  var settings = readSettings_();
  var unit = weightUnit_(settings);
  var setCount = settingSetCount_(settings);
  var exercises = exerciseIndex_();
  var item = state.queue[state.index];

  // Exercise dropdown: routine first (✓ when saved), then every other active exercise.
  var inQueue = {};
  var options = state.queue.map(function (q) { inQueue[q.name.toLowerCase()] = true; return (q.done ? DONE_MARK : '') + q.name; });
  var others = Object.keys(exercises.byName).map(function (k) { return exercises.byName[k]; })
    .filter(function (ex) { return ex.active && !inQueue[ex.name.toLowerCase()]; })
    .map(function (ex) { return ex.name; }).sort();
  options = options.concat([DROPDOWN_DIVIDER], others, [NEW_EXERCISE_OPTION]);
  var exCell = sheet.getRange(ENTRY.EXERCISE);
  exCell.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(options.slice(0, 500), true)
    .setAllowInvalid(false).build());

  sheet.getRange(ENTRY.PROGRESS).setValue(state.queue.length
    ? 'Exercise ' + (state.index + 1) + ' of ' + state.queue.length : '');
  if (!item) {
    exCell.setValue('');
    sheet.getRange(ENTRY.SETUP).setValue('');
    sheet.getRange(ENTRY.SET_TITLE).setValue('');
    [ENTRY.LAST_LABEL, ENTRY.LAST, ENTRY.GOAL, ENTRY.WARMUP].forEach(function (a) { sheet.getRange(a).setValue(''); });
    sheet.getRange(ENTRY.INPUT_FIRST_ROW, 2, 6, 1).setValues([[''], [''], [''], [''], [''], ['']]);
    showEntryMessage_(message || 'Pick a workout to load its routine.');
    return;
  }
  var ex = exercises.byId[item.id] || { warmup: false, setup: '', increment: '' };
  exCell.setValue((item.done ? DONE_MARK : '') + item.name);
  sheet.getRange(ENTRY.SETUP).setValue(ex.setup || '');
  sheet.getRange(ENTRY.SET_TITLE).setValue('SET ' + (state.set + 1) + ' of ' + setCount);

  // Last session: same gym first, then any gym. The session being edited is excluded.
  var gymName = String(sheet.getRange(ENTRY.GYM).getValue() || state.gym || '').trim();
  var gymId = '';
  readRegistry('gyms').forEach(function (g) { if (g.name.toLowerCase() === gymName.toLowerCase()) gymId = g.id; });
  var history = getExerciseHistory_(item.id).filter(function (h) { return h.recordId !== item.recordId; });
  var gymNames = {};
  readRegistry('gyms').forEach(function (g) { gymNames[g.id] = g.name; });
  var last = history.filter(function (h) { return gymId && h.gymId === gymId; })[0] || history[0];
  if (last) {
    var lastSet = last.sets[state.set];
    sheet.getRange(ENTRY.LAST_LABEL).setValue('Last · ' + last.date.slice(5).replace('-', '/') +
      (gymNames[last.gymId] ? ' ' + gymNames[last.gymId] : ''));
    sheet.getRange(ENTRY.LAST).setValue(lastSet ? formatSetCell(lastSet).replace(/x/, ' x ') : '—');
  } else {
    sheet.getRange(ENTRY.LAST_LABEL).setValue('Last');
    sheet.getRange(ENTRY.LAST).setValue('First time');
  }

  var ps = progressionSettings(settings, ex.increment);
  var goals = computeGoals(history, setCount, ps);
  var goal = goals.goals[state.set];
  sheet.getRange(ENTRY.GOAL).setValue(goal ? formatGoal(goal) + '  (' + goals.reason + ')' : '');

  var warm = '';
  if (ex.warmup && state.set === 0) {
    var working = goal ? goal.load : (last && last.sets[0] ? last.sets[0].loadValue : 0);
    warm = formatWarmup(warmupLadder(working, unit));
  }
  sheet.getRange(ENTRY.WARMUP_LABEL).setValue(ex.warmup && state.set === 0 ? 'Warm-up' : '');
  sheet.getRange(ENTRY.WARMUP).setValue(warm);

  // Inputs: what was entered before, else the previous set's weight.
  var inp = item.inputs[state.set];
  if (!hasSetData_(inp)) {
    var prev = item.inputs[state.set - 1];
    inp = { weight: prev && hasSetData_(prev) ? prev.weight : '', reps: '', assisted: '', partial: '', rir: '', note: '' };
  }
  sheet.getRange(ENTRY.INPUT_FIRST_ROW - 0, 1).setValue('Weight (' + unit + ')');
  sheet.getRange(ENTRY.INPUT_FIRST_ROW, 2, 6, 1).setValues([[inp.weight], [inp.reps], [inp.assisted], [inp.partial],
    [inp.rir], [inp.note]]);
  showEntryMessage_(message || '');
}

// ---- new exercise -----------------------------------------------------------

function readNewExerciseInputs_() {
  var v = entrySheet_().getRange(ENTRY.NEW_FIRST_ROW, 2, 5, 1).getValues();
  return { movement: String(v[0][0]).trim(), equipment: String(v[1][0]).trim(), detail: String(v[2][0]).trim(),
    warmup: v[3][0] === true, setup: String(v[4][0]).trim() };
}

function entryUpdateNewPreview_() {
  var n = readNewExerciseInputs_();
  var preview = '';
  if (n.movement) {
    try { preview = formatExerciseName({ movement: n.movement, equipment: n.equipment, detail: n.detail }, readNamingSettings_()); }
    catch (err) { preview = err.message; }
  }
  entrySheet_().getRange(ENTRY.NEW_PREVIEW).setValue(preview);
}

function entryCreateExercise_() {
  var n = readNewExerciseInputs_();
  if (!n.movement) { showEntryMessage_('⚠ Enter the movement name.'); return; }
  if (!n.equipment) { showEntryMessage_('⚠ Pick the equipment.'); return; }
  var name = formatExerciseName({ movement: n.movement, equipment: n.equipment, detail: n.detail }, readNamingSettings_());
  var exercises = exerciseIndex_();
  if (!exercises.byName[name.toLowerCase()]) {
    var equipmentName = n.equipment;
    ensureRegistryEntries('exercises', [name], function () { return [equipmentName, '', '', true, n.warmup, n.setup, '']; });
  }
  var state = getEntryState_();
  state.mode = 'lift';
  saveEntryState_(state);
  setEntryMode_(state, 'lift');
  entryExerciseChosen_(name);
  showEntryMessage_('Added ' + name + '.');
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
