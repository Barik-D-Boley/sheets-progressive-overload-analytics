/**
 * One-time (re-runnable) setup for the entry form and the Master tables it uses.
 * Menu: Overload Tracker -> Set up workout entry form.
 */
var ENTRY_COLORS = { label: '#f3f3f3', button: '#d9d9d9', title: '#cfe2f3', input: '#ffffff', message: '#fff2cc' };

function setupEntryForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSettings_();
  Object.keys(CONFIG.REGISTRIES).forEach(function (kind) { ensureRegistryHeaders_(kind); });
  ensureNamingTable_();
  ensureRoutinesTable_();
  formatExerciseCheckboxes_();

  var existing = ss.getSheetByName(CONFIG.SHEETS.ENTRY);
  if (existing && !isEntryFormSheet_(existing)) {
    var backupName = CONFIG.SHEETS.ENTRY + ' (old mockup)';
    if (ss.getSheetByName(backupName)) throw new Error('Rename or delete "' + backupName + '" first.');
    existing.setName(backupName);
    existing = null;
  }
  var sheet = existing || ss.insertSheet(CONFIG.SHEETS.ENTRY, 0);
  buildEntryLayout_(sheet);
  saveEntryState_({ date: '', workout: '', queue: [], index: 0, set: 0, mode: 'lift' });
  setEntryMode_(getEntryState_(), 'lift');
  ss.setActiveSheet(sheet);
}

function isEntryFormSheet_(sheet) {
  return sheet.getRange('C1').getNote() === 'entry-form-v1';
}

function buildEntryLayout_(sheet) {
  sheet.clear();
  sheet.getRange('A1:C45').breakApart().clearDataValidations();
  sheet.showRows(1, 45);
  sheet.setColumnWidth(1, 125);
  sheet.setColumnWidth(2, 175);
  sheet.setColumnWidth(3, 60);
  sheet.getRange('A1:C45').setFontSize(12).setVerticalAlignment('middle').setWrap(true);
  sheet.getRange('C1').setNote('entry-form-v1');
  var cell = function (a1) { return sheet.getRange(a1); };
  var listRule = function (values, allowInvalid) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(!!allowInvalid).build();
  };
  var rangeRule = function (kind, allowInvalid) {
    var range = getMasterSheet_().getRange(registryNameRangeA1(kind));
    return SpreadsheetApp.newDataValidation().requireValueInRange(range, true).setAllowInvalid(!!allowInvalid).build();
  };
  var label = function (a1, text) { cell(a1).setValue(text).setBackground(ENTRY_COLORS.label).setFontWeight('bold'); };
  var button = function (row, text) {
    sheet.getRange(row, 1).setValue(text).setHorizontalAlignment('right');
    sheet.getRange(row, 2).insertCheckboxes().setHorizontalAlignment('center');
    sheet.getRange(row, 1, 1, 2).setBackground(ENTRY_COLORS.button).setFontSize(16).setFontWeight('bold');
    sheet.setRowHeight(row, 44);
  };

  // Header
  cell(ENTRY.DATE).setNumberFormat('ddd m/d/yyyy').setFontWeight('bold');
  cell(ENTRY.GYM).setDataValidation(rangeRule('gyms', true)).setNote('Pick your gym (a new name is added automatically).');
  cell(ENTRY.WORKOUT).setDataValidation(rangeRule('workouts', false)).setFontWeight('bold');
  cell(ENTRY.PROGRESS).setHorizontalAlignment('right').setFontColor('#666666');
  button(3, '🏃 Log cardio');

  // Lifting block
  sheet.getRange('A4:B4').merge().setFontSize(15).setFontWeight('bold');
  sheet.setRowHeight(4, 40);
  label(ENTRY.SETUP.replace('B', 'A'), 'Setup');
  cell(ENTRY.SETUP).setNote('Saved with this exercise (seat height, pins, grip...).');
  sheet.getRange('A6:B6').merge().setBackground(ENTRY_COLORS.title).setHorizontalAlignment('center').setFontWeight('bold');
  [[7, 'Last'], [8, 'Goal'], [9, '']].forEach(function (r) { label('A' + r[0], r[1]); });
  sheet.getRange('B7:B9').setFontColor('#444444');
  var inputs = ['Weight', 'Reps', 'Assisted reps', 'Partial reps', 'RIR', 'Set notes'];
  inputs.forEach(function (t, i) {
    label('A' + (ENTRY.INPUT_FIRST_ROW + i), t);
    sheet.getRange(ENTRY.INPUT_FIRST_ROW + i, 2).setBackground(ENTRY_COLORS.input)
      .setBorder(true, true, true, true, false, false).setFontSize(16);
    sheet.setRowHeight(ENTRY.INPUT_FIRST_ROW + i, 38);
  });
  sheet.getRange(ENTRY.INPUT_FIRST_ROW + 4, 2).setDataValidation(listRule(RIR_OPTIONS, false));
  button(16, '◀ Back');
  button(17, 'Next ▶');
  button(18, 'Finish workout');
  sheet.getRange('A19:B19').merge().setBackground(ENTRY_COLORS.message).setFontStyle('italic');
  sheet.setRowHeight(19, 40);
  sheet.getRange(20, 1).setValue('⚖ Log bodyweight').setHorizontalAlignment('right').setFontColor('#666666');
  sheet.getRange(ENTRY.BODYWEIGHT_BTN).insertCheckboxes().setHorizontalAlignment('center');

  // Cardio block
  sheet.getRange('A21:C21').merge().setValue('CARDIO').setBackground(ENTRY_COLORS.title).setFontWeight('bold').setHorizontalAlignment('center');
  label('A22', 'Activity');
  cell(ENTRY.CARDIO_ACTIVITY).setDataValidation(rangeRule('cardio', true));
  ['Duration (min)', 'Speed', 'Distance', 'Calories', 'Notes'].forEach(function (t, i) { label('A' + (ENTRY.CARDIO_FIRST_ROW + i), t); });
  cell('B23').setDataValidation(listRule(['10', '15', '20', '30', '45', '60'], true));
  cell(ENTRY.CARDIO_SPEED_UNIT).setDataValidation(listRule(['mph', 'kph', 'level'], true));
  cell(ENTRY.CARDIO_DIST_UNIT).setDataValidation(listRule(['mi', 'km', 'floors'], true));
  sheet.getRange('B23:B27').setBackground(ENTRY_COLORS.input).setBorder(true, true, true, true, false, false);
  button(28, 'Save cardio');
  button(29, 'Cancel');

  // New exercise block
  sheet.getRange('A31:C31').merge().setValue('NEW EXERCISE').setBackground(ENTRY_COLORS.title).setFontWeight('bold').setHorizontalAlignment('center');
  ['Movement', 'Equipment', 'Detail (optional)', 'Warm-up ladder', 'Setup notes', 'Name'].forEach(function (t, i) { label('A' + (ENTRY.NEW_FIRST_ROW + i), t); });
  cell('B33').setDataValidation(listRule(Object.keys(readNamingSettings_().equipmentTags), false));
  cell('B35').insertCheckboxes();
  cell('B32').setNote('e.g. "incline bench press" - the name is formatted for you.');
  cell('B34').setNote('Attachment or angle, e.g. "rope" or "15°".');
  cell(ENTRY.NEW_PREVIEW).setFontWeight('bold');
  button(38, 'Create');
  button(39, 'Cancel');

  // Bodyweight block
  sheet.getRange('A41:C41').merge().setValue('BODYWEIGHT').setBackground(ENTRY_COLORS.title).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A42:B42').merge().setFontStyle('italic');
  sheet.setRowHeight(42, 40);
  label('A43', 'Weight');
  cell(ENTRY.BW_INPUT).setBackground(ENTRY_COLORS.input).setBorder(true, true, true, true, false, false).setFontSize(16);
  button(44, 'Save');
  button(45, 'Not now');
}

/** Equipment/tag table on Master (buyers edit it to change name tags). */
function ensureNamingTable_() {
  var spec = CONFIG.NAMING_TABLE;
  var master = getMasterSheet_();
  var col = columnLetterToIndex(spec.column);
  var top = master.getRange(1, col, 2, 2).getValues();
  if (top[1][0] === spec.headers[0]) return;
  if (top[0].concat(top[1]).some(function (v) { return v !== ''; })) {
    throw new Error('Master ' + spec.column + '1 already has other content; change CONFIG.NAMING_TABLE.column.');
  }
  master.getRange(1, col).setValue(spec.title).setFontWeight('bold');
  master.getRange(2, col, 1, 2).setValues([spec.headers]).setFontWeight('bold');
  var rows = Object.keys(NAMING_DEFAULTS.equipmentTags).map(function (k) { return [k, NAMING_DEFAULTS.equipmentTags[k]]; });
  master.getRange(3, col, rows.length, 2).setValues(rows);
}

/** NAMING_DEFAULTS with the equipment/tag table on Master applied. */
function readNamingSettings_() {
  var settings = JSON.parse(JSON.stringify(NAMING_DEFAULTS));
  var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MASTER);
  if (!master || master.getLastRow() < 3) return settings;
  var col = columnLetterToIndex(CONFIG.NAMING_TABLE.column);
  if (master.getRange(2, col).getValue() !== CONFIG.NAMING_TABLE.headers[0]) return settings;
  var tags = {};
  master.getRange(3, col, master.getLastRow() - 2, 2).getValues().forEach(function (r) {
    if (String(r[0]).trim() && String(r[1]).trim()) tags[String(r[0]).trim()] = String(r[1]).trim();
  });
  if (Object.keys(tags).length) settings.equipmentTags = tags;
  return settings;
}

/** Routine templates: one row per workout; empty ones are seeded from the last logged session. */
function ensureRoutinesTable_() {
  var spec = CONFIG.ROUTINES;
  var master = getMasterSheet_();
  var col = columnLetterToIndex(spec.column);
  var width = spec.maxExercises + 1;
  var headers = ['Workout'];
  for (var i = 1; i <= spec.maxExercises; i++) headers.push('Exercise ' + i);
  var top = master.getRange(1, col, 2, width).getValues();
  if (top[1][0] !== 'Workout') {
    if (top[0].concat(top[1]).some(function (v) { return v !== '' && v !== spec.title; })) {
      throw new Error('Master ' + spec.column + '1 already has other content; change CONFIG.ROUTINES.column.');
    }
    master.getRange(1, col).setValue(spec.title).setFontWeight('bold');
    master.getRange(2, col, 1, width).setValues([headers]).setFontWeight('bold');
  }
  var last = Math.max(master.getLastRow(), 3);
  var existing = master.getRange(3, col, last - 2, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); });
  var used = existing.filter(String).length;
  var exerciseNames = {};
  readRegistry('exercises').forEach(function (e) { exerciseNames[e.id] = e.name; });
  var rows = [];
  readRegistry('workouts').forEach(function (w) {
    if (existing.indexOf(w.name.toLowerCase()) >= 0) return;
    var names = lastSessionOrder_(w.id).map(function (id) { return exerciseNames[id] || ''; }).filter(String)
      .slice(0, spec.maxExercises);
    var row = [w.name].concat(names);
    while (row.length < width) row.push('');
    rows.push(row);
  });
  if (rows.length) master.getRange(3 + used, col, rows.length, width).setValues(rows);
  var exerciseRange = master.getRange(registryNameRangeA1('exercises'));
  master.getRange(3, col + 1, 30, spec.maxExercises).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(exerciseRange, true).setAllowInvalid(true).build());
}

/** Active and Warm-up columns of the exercise registry as checkboxes. */
function formatExerciseCheckboxes_() {
  var spec = CONFIG.REGISTRIES.exercises;
  var rows = readRegistryRows('exercises');
  if (!rows.length) return;
  var col = columnLetterToIndex(spec.column);
  var lastRow = rows[rows.length - 1]._row;
  ['Active', 'Warm-up'].forEach(function (h) {
    getMasterSheet_().getRange(REGISTRY_FIRST_DATA_ROW, col + spec.headers.indexOf(h), lastRow - REGISTRY_FIRST_DATA_ROW + 1, 1)
      .insertCheckboxes();
  });
}
