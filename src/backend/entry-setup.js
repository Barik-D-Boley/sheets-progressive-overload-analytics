/**
 * One-time (re-runnable) setup for the entry form and the Master tables it uses.
 * Menu: Overload Tracker -> Set up workout entry form.
 */
var ENTRY_COLORS = { label: '#f3f3f3', button: '#d9d9d9', title: '#cfe2f3', input: '#ffffff', message: '#fff2cc' };

function setupEntryForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSettings_();
  Object.keys(CONFIG.REGISTRIES).forEach(function (kind) { ensureRegistryHeaders_(kind); fillMissingRegistryIds(kind); });
  ensureNamingTable_();
  ensureRoutinesTable_();
  CONFIG.SORTED_REGISTRIES.forEach(function (kind) { sortRegistry(kind); });
  formatExerciseCheckboxes_();
  ensureCardioHeaders_();
  mergeTreadmillVariants_();

  var existing = ss.getSheetByName(CONFIG.SHEETS.ENTRY);
  if (existing && !isEntryFormSheet_(existing)) {
    var backupName = CONFIG.SHEETS.ENTRY + ' (old mockup)';
    if (ss.getSheetByName(backupName)) throw new Error('Rename or delete "' + backupName + '" first.');
    existing.setName(backupName);
    existing = null;
  }
  var sheet = existing || ss.insertSheet(CONFIG.SHEETS.ENTRY, 0);
  buildEntryLayout_(sheet);
  refreshRoutineDropdown_();
  saveEntryState_({ date: '', workout: '', queue: [], index: 0, set: 0, mode: 'lift' });
  setEntryMode_(getEntryState_(), 'lift');
  ss.setActiveSheet(sheet);
}

var ENTRY_FORM_MARKER = 'entry-form-v3';

/** Any version of the generated form (rebuilt in place); anything else is the user's own tab. */
function isEntryFormSheet_(sheet) {
  return /^entry-form-v\d+$/.test(sheet.getRange('C1').getNote());
}

function buildEntryLayout_(sheet) {
  var lastRow = ENTRY.LAST_ROW;
  var all = 'A1:C' + lastRow;
  sheet.clear();
  sheet.getRange(all).breakApart().clearDataValidations();
  sheet.showRows(1, lastRow);
  sheet.setColumnWidth(1, 125);
  sheet.setColumnWidth(2, 185);
  sheet.setColumnWidth(3, 60);
  sheet.getRange(all).setFontSize(12).setVerticalAlignment('middle').setWrap(true);
  sheet.getRange('C1').setNote(ENTRY_FORM_MARKER);
  var cell = function (a1) { return sheet.getRange(a1); };
  var listRule = function (values, allowInvalid) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(!!allowInvalid).build();
  };
  var rangeRule = function (a1, allowInvalid) {
    return SpreadsheetApp.newDataValidation().requireValueInRange(getMasterSheet_().getRange(a1), true)
      .setAllowInvalid(!!allowInvalid).build();
  };
  var label = function (a1, text) { cell(a1).setValue(text).setBackground(ENTRY_COLORS.label).setFontWeight('bold'); };
  var button = function (row, text, quiet) {
    sheet.getRange(row, 1).setValue(text).setHorizontalAlignment('right');
    sheet.getRange(row, 2).insertCheckboxes().setHorizontalAlignment('center');
    sheet.getRange(row, 1, 1, 2).setBackground(ENTRY_COLORS.button).setFontSize(quiet ? 13 : 16).setFontWeight('bold');
    sheet.setRowHeight(row, quiet ? 36 : 44);
  };

  // Header: every dropdown has its label in column A.
  label('A1', 'Date');
  cell(ENTRY.DATE).setNumberFormat('ddd m/d/yyyy').setFontWeight('bold');
  label('A2', 'Gym');
  cell(ENTRY.GYM).setDataValidation(rangeRule(registryNameRangeA1('gyms'), true))
    .setNote('Pick your gym (a new name is added automatically).');
  label('A3', 'Routine');
  cell(ENTRY.ROUTINE).setFontWeight('bold'); // dropdown of active routines: refreshRoutineDropdown_()

  // Find + lifting block
  label('A4', 'Find');
  cell(ENTRY.FIND).setBackground(ENTRY_COLORS.input).setBorder(true, true, true, true, false, false)
    .setNote('Type part of a name (e.g. "curl") to narrow the Exercise list.');
  label(ENTRY.EXERCISE_LABEL, 'Exercise');
  cell(ENTRY.EXERCISE).setFontSize(14).setFontWeight('bold');
  sheet.setRowHeight(5, 40);
  label('A6', 'Setup');
  cell(ENTRY.SETUP).setNote('Saved with this exercise (seat height, pins, grip...).');
  sheet.getRange('A7:B7').merge().setBackground(ENTRY_COLORS.title).setHorizontalAlignment('center').setFontWeight('bold');
  [[8, 'Last'], [9, 'Goal'], [10, '']].forEach(function (r) { label('A' + r[0], r[1]); });
  sheet.getRange('B8:B10').setFontColor('#444444');
  var inputs = ['Weight', 'Reps', 'Assisted reps', 'Partial reps', 'RIR', 'Set notes'];
  inputs.forEach(function (t, i) {
    label('A' + (ENTRY.INPUT_FIRST_ROW + i), t);
    sheet.getRange(ENTRY.INPUT_FIRST_ROW + i, 2).setBackground(ENTRY_COLORS.input)
      .setBorder(true, true, true, true, false, false).setFontSize(16);
    sheet.setRowHeight(ENTRY.INPUT_FIRST_ROW + i, 38);
  });
  sheet.getRange(ENTRY.INPUT_FIRST_ROW + 4, 2).setDataValidation(listRule(RIR_OPTIONS, false)).setNumberFormat('@');
  button(17, '◀ Back');
  button(18, 'Next ▶');
  button(19, 'Finish workout');
  sheet.getRange('A20:B20').merge().setBackground(ENTRY_COLORS.message).setFontStyle('italic');
  sheet.setRowHeight(20, 40);
  button(21, '🏃 Log cardio', true);
  button(22, '⚖ Log bodyweight', true);

  // Cardio block
  var c0 = ENTRY.CARDIO_ROWS[0];
  sheet.getRange('A' + c0 + ':C' + c0).merge().setValue('CARDIO').setBackground(ENTRY_COLORS.title).setFontWeight('bold').setHorizontalAlignment('center');
  label('A' + (c0 + 1), 'Activity');
  cell(ENTRY.CARDIO_ACTIVITY).setDataValidation(rangeRule(registryNameRangeA1('cardio'), true));
  ['Duration (min)', 'Speed', 'Distance', 'Calories', 'Notes'].forEach(function (t, i) { label('A' + (ENTRY.CARDIO_FIRST_ROW + i), t); });
  sheet.getRange(ENTRY.CARDIO_FIRST_ROW, 2).setDataValidation(listRule(['10', '15', '20', '30', '45', '60'], true));
  cell(ENTRY.CARDIO_SPEED_UNIT).setDataValidation(listRule(['mph', 'kph', 'level'], true));
  cell(ENTRY.CARDIO_DIST_UNIT).setDataValidation(listRule(['mi', 'km', 'floors'], true));
  sheet.getRange(ENTRY.CARDIO_FIRST_ROW, 2, 5, 1).setBackground(ENTRY_COLORS.input).setBorder(true, true, true, true, false, false);
  button(ENTRY.CARDIO_ROWS[1] - 1, 'Save cardio');
  button(ENTRY.CARDIO_ROWS[1], 'Cancel');

  // Bodyweight block
  var b0 = ENTRY.BW_ROWS[0];
  sheet.getRange('A' + b0 + ':C' + b0).merge().setValue('BODYWEIGHT').setBackground(ENTRY_COLORS.title).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange('A' + (b0 + 1) + ':B' + (b0 + 1)).merge().setFontStyle('italic');
  sheet.setRowHeight(b0 + 1, 40);
  label('A' + (b0 + 2), 'Weight');
  cell(ENTRY.BW_INPUT).setBackground(ENTRY_COLORS.input).setBorder(true, true, true, true, false, false).setFontSize(16);
  button(ENTRY.BW_ROWS[1] - 1, 'Save');
  button(ENTRY.BW_ROWS[1], 'Not now');
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

/** Active and Warm-up columns of the exercise registry as checkboxes. */
function formatExerciseCheckboxes_() {
  var spec = CONFIG.REGISTRIES.exercises;
  var rows = readRegistryRows('exercises');
  if (!rows.length) return;
  var col = columnLetterToIndex(spec.column);
  var lastRow = rows[rows.length - 1]._row;
  var height = lastRow - REGISTRY_FIRST_DATA_ROW + 1;
  // Fill blank "Same Gym Only" boxes from the equipment (machines, cables, PL, Smith = same gym).
  var sameCol = col + spec.headers.indexOf('Same Gym Only');
  var eqCol = col + spec.headers.indexOf('Equipment');
  var nameCol = col + spec.headers.indexOf('Name');
  var master = getMasterSheet_();
  var eq = master.getRange(REGISTRY_FIRST_DATA_ROW, eqCol, height, 1).getValues();
  var names = master.getRange(REGISTRY_FIRST_DATA_ROW, nameCol, height, 1).getValues();
  var same = master.getRange(REGISTRY_FIRST_DATA_ROW, sameCol, height, 1).getValues().map(function (r, i) {
    if (r[0] === true || r[0] === false) return [r[0]];
    if (!String(names[i][0]).trim()) return [''];
    return [isGymSpecificEquipment(eq[i][0] || equipmentFromName(names[i][0]))];
  });
  master.getRange(REGISTRY_FIRST_DATA_ROW, sameCol, height, 1).setValues(same);
  ['Active', 'Warm-up', 'Same Gym Only'].forEach(function (h) {
    master.getRange(REGISTRY_FIRST_DATA_ROW, col + spec.headers.indexOf(h), height, 1).insertCheckboxes();
  });
}
