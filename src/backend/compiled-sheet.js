/**
 * Sheet side of Compiled Data: setup, refresh, filters, and the nightly trigger.
 * Menu: Overload Tracker -> Set up compiled data / Refresh compiled data.
 */
var COMPILED_MARKER = 'compiled-data-v1';

function compiledSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.COMPILED);
}

function isCompiledSheet_(sheet) {
  return !!sheet && sheet.getRange('M1').getNote() === COMPILED_MARKER;
}

function setupCompiledData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = compiledSheet_();
  if (sheet && !isCompiledSheet_(sheet)) {
    var backupName = CONFIG.SHEETS.COMPILED + ' (old mockup)';
    if (ss.getSheetByName(backupName)) throw new Error('Rename or delete "' + backupName + '" first.');
    sheet.setName(backupName);
    sheet = null;
  }
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.COMPILED, 1);
  sheet.clear();
  sheet.getRange('A1:K1').breakApart().clearDataValidations();
  sheet.getRange('M1').setNote(COMPILED_MARKER);
  var label = function (a1, text) { sheet.getRange(a1).setValue(text).setFontWeight('bold').setHorizontalAlignment('right'); };
  label('A1', 'Time frame');
  label('C1', 'Gym');
  label('E1', 'Workout');
  label('G1', 'Search');
  label('J1', 'Clear');
  sheet.getRange(COMPILED.TIMEFRAME).setValue(COMPILED.ALL_TIME);
  sheet.getRange(COMPILED.GYM).setValue(COMPILED.ALL_GYMS);
  sheet.getRange(COMPILED.WORKOUT).setValue(COMPILED.ALL_WORKOUTS);
  sheet.getRange('H1:I1').merge().setBackground('#ffffff').setBorder(true, true, true, true, false, false);
  sheet.getRange(COMPILED.CLEAR_BTN).insertCheckboxes();
  sheet.getRange('J1:K1').setBackground('#d9d9d9');
  sheet.getRange('A1:K1').setBackground('#f3f3f3');
  sheet.setFrozenRows(COMPILED.HEADER_ROW);
  sheet.getRange('A3:Z3').setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(COMPILED.STATUS).setFontStyle('italic').setFontColor('#666666');

  sheet.getRange('A3:Z1000').protect()
    .setDescription('Compiled Data is rebuilt automatically. Edit workouts in the quarter tabs (Q1 2026 ...).')
    .setWarningOnly(true);
  installNightlyRefresh_();
  refreshCompiledData();
  ss.setActiveSheet(sheet);
}

/** Time-driven trigger that refreshes around midnight (script time zone). */
function installNightlyRefresh_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'refreshCompiledData'; });
  if (!exists) ScriptApp.newTrigger('refreshCompiledData').timeBased().atHour(0).everyDays(1).create();
}

function readAllRecords_() {
  var records = [];
  var tabs = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (!QUARTER_TAB_RE.test(name)) return;
    tabs.push(name);
    var last = sheet.getLastRow();
    if (last < 2) return;
    var width = Math.max(sheet.getLastColumn(), QCOL.firstSet + 1);
    sheet.getRange(2, 1, last - 1, width).getValues().forEach(function (r) {
      if (r[QCOL.id] === '' && r[QCOL.exercise] === '') return;
      records.push({ tab: name, date: dateToIso_(r[QCOL.date]), gymId: String(r[QCOL.gym]), workoutId: String(r[QCOL.workout]),
        exerciseId: String(r[QCOL.exercise]), unit: String(r[QCOL.unit] || CONFIG.LEGACY_UNIT), notes: r[QCOL.notes],
        sets: r.slice(QCOL.firstSet).map(function (v) { return String(v === null || v === undefined ? '' : v); }) });
    });
  });
  return { records: records, tabs: tabs };
}

function nameMap_(kind) {
  var map = {};
  readRegistry(kind).forEach(function (e) { map[e.id] = e.name; });
  return map;
}

/** Rebuilds the view using the filters currently set at the top. Safe to call any time. */
function refreshCompiledData() {
  var sheet = compiledSheet_();
  if (!isCompiledSheet_(sheet)) return;
  var settings = readSettings_();
  var unit = weightUnit_(settings);
  var data = readAllRecords_();
  var names = { exercises: nameMap_('exercises'), gyms: nameMap_('gyms'), workouts: nameMap_('workouts') };
  var filters = {
    timeframe: sheet.getRange(COMPILED.TIMEFRAME).getValue(), gym: sheet.getRange(COMPILED.GYM).getValue(),
    workout: sheet.getRange(COMPILED.WORKOUT).getValue(), search: sheet.getRange(COMPILED.SEARCH).getValue(),
  };
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var result = compileRecords(data.records, names, { unit: unit, formula: settings['1rm formula'], setCount: settingSetCount_(settings) },
    filters, today);

  // Filter dropdowns reflect current quarters, gyms, and workouts.
  var quarters = data.tabs.slice().sort(function (a, b) {
    var ka = a.slice(3) + a.charAt(1), kb = b.slice(3) + b.charAt(1);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
  var list = function (values) { return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build(); };
  sheet.getRange(COMPILED.TIMEFRAME).setDataValidation(list(COMPILED.TIMEFRAMES.concat(quarters)));
  sheet.getRange(COMPILED.GYM).setDataValidation(list([COMPILED.ALL_GYMS].concat(objectValues_(names.gyms))));
  sheet.getRange(COMPILED.WORKOUT).setDataValidation(list([COMPILED.ALL_WORKOUTS].concat(objectValues_(names.workouts))));

  var width = result.headers.length;
  var panelCol = width + 2;
  var lastRow = sheet.getLastRow();
  if (lastRow >= COMPILED.HEADER_ROW) {
    sheet.getRange(COMPILED.HEADER_ROW, 1, lastRow - COMPILED.HEADER_ROW + 1, Math.max(sheet.getLastColumn(), panelCol + 1)).clearContent();
  }
  sheet.getRange(COMPILED.HEADER_ROW, 1, 1, width).setValues([result.headers]);
  if (result.rows.length) {
    var values = result.rows.map(function (r) { var v = r.values.slice(); v[1] = isoToDate_(v[1]); return v; });
    sheet.getRange(COMPILED.FIRST_DATA_ROW, 1, values.length, width).setValues(values);
    sheet.getRange(COMPILED.FIRST_DATA_ROW, 2, values.length, 1).setNumberFormat('m/d/yy');
  }
  sheet.getRange(COMPILED.HEADER_ROW, panelCol, result.panel.length, 2).setValues(result.panel);
  sheet.getRange(COMPILED.HEADER_ROW, panelCol, result.panel.length, 1).setFontWeight('bold');
  sheet.getRange(COMPILED.STATUS).setValue('Showing ' + result.rows.length + ' of ' + result.total + ' · weights in ' + unit +
    ' · updated ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d h:mm a'));
}

function objectValues_(obj) { return Object.keys(obj).map(function (k) { return obj[k]; }).sort(); }

/** Called from onEdit: filter changes and the Clear button refresh the view. */
function compiledOnEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.COMPILED || !isCompiledSheet_(sheet)) return false;
  var a1 = e.range.getA1Notation().split(':')[0];
  if (a1 === COMPILED.CLEAR_BTN) {
    if (!(e.value === 'TRUE' || e.value === true)) return true;
    sheet.getRange(COMPILED.CLEAR_BTN).setValue(false);
    sheet.getRange(COMPILED.SEARCH).setValue('');
  } else if ([COMPILED.TIMEFRAME, COMPILED.GYM, COMPILED.WORKOUT, COMPILED.SEARCH].indexOf(a1) < 0) {
    return true;
  }
  refreshCompiledData();
  return true;
}
