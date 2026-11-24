/**
 * Routine templates on Master (CONFIG.ROUTINES.column):
 *   Routine | Workout | Active | Exercise 1 .. Exercise 14
 * Workout groups history (blank = routine name). Unchecked Active = archived: kept,
 * but not offered when starting a workout.
 */
var ROUTINE_COL = { name: 0, workout: 1, active: 2, firstExercise: 3 };

function routineWidth_() { return ROUTINE_COL.firstExercise + CONFIG.ROUTINES.maxExercises; }

function routineHeaders_() {
  var h = ['Routine', 'Workout', 'Active'];
  for (var i = 1; i <= CONFIG.ROUTINES.maxExercises; i++) h.push('Exercise ' + i);
  return h;
}

/** @return {{row: number, name: string, workout: string, active: boolean, exercises: string[]}[]} */
function readRoutines_() {
  var master = getMasterSheet_();
  var col = columnLetterToIndex(CONFIG.ROUTINES.column);
  var last = master.getLastRow();
  if (last < 3) return [];
  var out = [];
  master.getRange(3, col, last - 2, routineWidth_()).getValues().forEach(function (r, i) {
    var name = String(r[ROUTINE_COL.name]).trim();
    if (!name) return;
    out.push({ row: 3 + i, name: name, workout: String(r[ROUTINE_COL.workout]).trim() || name,
      active: r[ROUTINE_COL.active] !== false,
      exercises: r.slice(ROUTINE_COL.firstExercise).map(String).map(function (x) { return x.trim(); }).filter(String) });
  });
  return out;
}

function routineRowValues_(r) {
  var row = [r.name, r.workout || r.name, r.active !== false].concat(r.exercises || []);
  if (row.length > routineWidth_()) throw new Error('A routine can have at most ' + CONFIG.ROUTINES.maxExercises + ' exercises.');
  while (row.length < routineWidth_()) row.push('');
  return row;
}

/** Writes a routine to its row, or to the first empty row. */
function writeRoutine_(r, row) {
  var master = getMasterSheet_();
  var col = columnLetterToIndex(CONFIG.ROUTINES.column);
  if (!row) {
    var last = Math.max(master.getLastRow(), 3);
    var names = master.getRange(3, col, last - 2, 1).getValues().map(function (x) { return String(x[0]).trim(); });
    var free = names.indexOf('');
    row = free >= 0 ? 3 + free : 3 + names.length;
  }
  master.getRange(row, col, 1, routineWidth_()).setValues([routineRowValues_(r)]);
  master.getRange(row, col + ROUTINE_COL.active).insertCheckboxes();
  return row;
}

/**
 * Creates or converts the table. Older layouts:
 *   v1  Workout | Exercise 1..15            v2  Routine | Workout | Exercise 1..15
 * Empty tables are seeded with one routine per workout from the last logged session.
 */
function ensureRoutinesTable_() {
  var spec = CONFIG.ROUTINES;
  var master = getMasterSheet_();
  var col = columnLetterToIndex(spec.column);
  var width = routineWidth_();
  var top = master.getRange(1, col, 2, width).getValues();
  var last = Math.max(master.getLastRow(), 3);
  var h = top[1];
  var oldLayout = h[0] === 'Workout' && h[1] === 'Exercise 1' ? 1 : (h[0] === 'Routine' && h[2] === 'Exercise 1' ? 2 : 0);

  if (oldLayout) {
    var rows = master.getRange(3, col, last - 2, width).getValues();
    var converted = rows.map(function (r) {
      if (!String(r[0]).trim()) return routineHeaders_().map(function () { return ''; });
      var name = String(r[0]).trim();
      var workout = oldLayout === 1 ? name : String(r[1]).trim();
      var exercises = r.slice(oldLayout === 1 ? 1 : 2).map(String).map(function (x) { return x.trim(); }).filter(String);
      if (exercises.length > spec.maxExercises) {
        throw new Error('Routine "' + name + '" has more than ' + spec.maxExercises + ' exercises; shorten it before running setup.');
      }
      return routineRowValues_({ name: name, workout: workout, active: true, exercises: exercises });
    });
    master.getRange(3, col, converted.length, width).setValues(converted);
    master.getRange(2, col, 1, width).setValues([routineHeaders_()]).setFontWeight('bold');
  } else if (h[0] !== 'Routine') {
    if (top[0].concat(top[1]).some(function (v) { return v !== '' && v !== spec.title; })) {
      throw new Error('Master ' + spec.column + '1 already has other content; change CONFIG.ROUTINES.column.');
    }
    master.getRange(1, col).setValue(spec.title).setFontWeight('bold');
    master.getRange(2, col, 1, width).setValues([routineHeaders_()]).setFontWeight('bold');
  }

  if (!readRoutines_().length) {
    var exerciseNames = {};
    readRegistry('exercises').forEach(function (e) { exerciseNames[e.id] = e.name; });
    readRegistry('workouts').forEach(function (w) {
      var names = lastSessionOrder_(w.id).map(function (id) { return exerciseNames[id] || ''; }).filter(String)
        .slice(0, spec.maxExercises);
      writeRoutine_({ name: w.name, workout: w.name, active: true, exercises: names });
    });
  }
  // A "Custom" routine with no exercises, for one-off workouts built on the day.
  if (!readRoutines_().some(function (r) { return r.name.toLowerCase() === CUSTOM_ROUTINE.toLowerCase(); })) {
    writeRoutine_({ name: CUSTOM_ROUTINE, workout: CUSTOM_ROUTINE, active: true, exercises: [] });
  }
  var lastRow = Math.max(master.getLastRow(), 3);
  master.getRange(3, col + ROUTINE_COL.active, lastRow - 2, 1).setValues(
    master.getRange(3, col, lastRow - 2, ROUTINE_COL.active + 1).getValues().map(function (r) {
      return [String(r[0]).trim() ? r[ROUTINE_COL.active] !== false : ''];
    })).insertCheckboxes();
  master.getRange(3, col + ROUTINE_COL.firstExercise, 30, spec.maxExercises).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(master.getRange(registryNameRangeA1('exercises')), true)
      .setAllowInvalid(true).build());
  master.getRange(3, col + ROUTINE_COL.workout, 30, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(master.getRange(registryNameRangeA1('workouts')), true)
      .setAllowInvalid(true).build());
}

/** The sheet form's Routine dropdown lists active routines only. */
function refreshRoutineDropdown_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.ENTRY);
  if (!sheet || !isEntryFormSheet_(sheet)) return;
  var names = readRoutines_().filter(function (r) { return r.active; }).map(function (r) { return r.name; });
  sheet.getRange(ENTRY.ROUTINE).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(names.length ? names : [CUSTOM_ROUTINE], true).setAllowInvalid(false).build());
}
