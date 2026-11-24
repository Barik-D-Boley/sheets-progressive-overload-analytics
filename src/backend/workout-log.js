/**
 * Reading and writing the canonical quarter tabs ("Q1 2026" ...).
 * Row layout: CONFIG.QUARTER_HEADERS, then one packed cell per set.
 */
var QUARTER_TAB_RE = /^Q[1-4] \d{4}$/;
var QCOL = {
  id: 0, date: 1, gym: 2, workout: 3, exercise: 4, unit: 5, notes: 6, source: 7, firstSet: 8,
};

function dateToIso_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var legacy = parseLegacyDate(s);
  return legacy || '';
}

/**
 * Sessions of one exercise across all quarter tabs, most recent first.
 * @return {{recordId, date, gymId, sets: Object[], tab}[]}
 */
function getExerciseHistory_(exerciseId) {
  return getHistories_([exerciseId])[String(exerciseId)] || [];
}

/**
 * Histories for several exercises from one pass over the quarter tabs, each most recent first.
 * @return {Object<string, {recordId, date, gymId, sets: Object[], tab}[]>}
 */
function getHistories_(exerciseIds) {
  var wanted = {};
  exerciseIds.forEach(function (id) { wanted[String(id)] = []; });
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    if (!QUARTER_TAB_RE.test(sheet.getName())) return;
    var last = sheet.getLastRow();
    if (last < 2) return;
    var width = Math.max(sheet.getLastColumn(), QCOL.firstSet + 1);
    sheet.getRange(2, 1, last - 1, width).getValues().forEach(function (r) {
      var list = wanted[String(r[QCOL.exercise])];
      if (!list) return;
      var sets = [];
      for (var c = QCOL.firstSet; c < r.length; c++) {
        var parsed = parseSetCell(r[c]);
        if (parsed) sets.push(parsed);
      }
      list.push({ recordId: String(r[QCOL.id]), date: dateToIso_(r[QCOL.date]), gymId: String(r[QCOL.gym]),
        sets: sets, tab: sheet.getName() });
    });
  });
  Object.keys(wanted).forEach(function (id) {
    wanted[id].sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  });
  return wanted;
}

/**
 * Appends a record, or replaces it in place when record.recordId already exists in record.tab.
 * @return {{recordId: string, tab: string}}
 */
function writeWorkoutRecord_(record) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))) throw new Error('Workout date is missing or invalid.');
  var tab = quarterTabName(record.date);
  var sheet = getOrCreateQuarterSheet(tab);
  var row = [record.recordId || newRecordId_('L'), isoToDate_(record.date), record.gymId, record.workoutId,
    record.exerciseId, record.unit, record.notes, record.source].concat(record.sets);

  var target = 0;
  if (record.recordId && record.tab === tab && sheet.getLastRow() > 1) {
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === record.recordId) { target = i + 2; break; }
  }
  if (record.recordId && record.tab && record.tab !== tab) deleteWorkoutRecord_(record.tab, record.recordId);

  if (target) {
    var width = Math.max(row.length, sheet.getLastColumn());
    while (row.length < width) row.push('');
    sheet.getRange(target, 1, 1, width).setValues([row]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }
  return { recordId: row[0], tab: tab };
}

function deleteWorkoutRecord_(tab, recordId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!sheet || sheet.getLastRow() < 2) return;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === recordId) sheet.deleteRow(i + 2);
}

/** Exercise order of the most recent logged session of a workout (seeds empty routines). */
function lastSessionOrder_(workoutId) {
  var best = null;
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    if (!QUARTER_TAB_RE.test(sheet.getName()) || sheet.getLastRow() < 2) return;
    sheet.getRange(2, 1, sheet.getLastRow() - 1, QCOL.firstSet).getValues().forEach(function (r) {
      if (String(r[QCOL.workout]) !== String(workoutId)) return;
      var d = dateToIso_(r[QCOL.date]);
      if (!best || d > best.date) best = { date: d, ids: [] };
      if (d === best.date && best.ids.indexOf(String(r[QCOL.exercise])) < 0) best.ids.push(String(r[QCOL.exercise]));
    });
  });
  return best ? best.ids : [];
}
