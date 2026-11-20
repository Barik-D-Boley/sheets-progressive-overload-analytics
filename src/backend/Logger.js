function ensureDataLogsSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = spreadsheet.getSheetByName('Data_Logs');

  if (!dataSheet) {
    dataSheet = spreadsheet.insertSheet('Data_Logs');
  }

  var headers = [
    'Log_ID',
    'Date',
    'Exercise_ID',
    'Exercise_Name',
    'Set_Number',
    'Load',
    'Load_Unit',
    'Reps',
    'Notes',
    'Estimated_1RM',
    'Sheet_Origin',
    'Created_At'
  ];

  if (!dataSheet.getDataRange().getValues().length || String(dataSheet.getRange(1, 1, 1, 1).getValue()).toLowerCase() !== 'log_id') {
    dataSheet.clear();
    dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    dataSheet.setFrozenRows(1);
    dataSheet.autoResizeColumns(1, headers.length);
  }

  return dataSheet;
}

function filterEmptyEntries(rawRows) {
  var validRows = [];

  if (!rawRows || !rawRows.length) {
    return validRows;
  }

  for (var i = 0; i < rawRows.length; i += 1) {
    var row = rawRows[i];
    var exerciseName = row && row[1] ? String(row[1]).trim() : '';
    var weight = row && row[3] !== undefined ? row[3] : '';
    var reps = row && row[4] !== undefined ? row[4] : '';

    if (!exerciseName && !weight && !reps) {
      continue;
    }

    validRows.push(row);
  }

  return validRows;
}

function estimateOneRm(weight, reps) {
  var load = Number(weight);
  var repCount = Number(reps);

  if (isNaN(load) || isNaN(repCount) || repCount <= 0) {
    return 0;
  }

  return Math.round(load * (1 + repCount / 30));
}

function createLogId(dateValue) {
  var date = new Date(dateValue);
  var stamp = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd');
  return 'LOG-' + stamp + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function submitWorkoutLog() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var entrySheet = spreadsheet.getSheetByName('Workout Entry');

  if (!entrySheet) {
    spreadsheet.toast('Workout Entry sheet not found.');
    return false;
  }

  var rows = entrySheet.getRange('B6:F30').getValues();
  var cleaned = filterEmptyEntries(rows);
  var validRows = [];
  var invalidCount = 0;

  for (var i = 0; i < cleaned.length; i += 1) {
    var row = cleaned[i];
    var exerciseName = row[0] ? String(row[0]).trim() : '';
    var setNumber = row[1] ? Number(row[1]) : i + 1;
    var weightValue = row[2];
    var repValue = row[3];
    var notes = row[4] ? String(row[4]).trim() : '';

    if (!exerciseName || !weightValue || !repValue) {
      invalidCount += 1;
      continue;
    }

    var parsedWeight = Number(weightValue);
    var parsedReps = Number(repValue);

    if (isNaN(parsedWeight) || parsedWeight <= 0 || isNaN(parsedReps) || parsedReps <= 0) {
      invalidCount += 1;
      continue;
    }

    var exercise = registerExercise(exerciseName, 'Uncategorized');
    if (!exercise) {
      invalidCount += 1;
      continue;
    }

    validRows.push({
      date: new Date(),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      setNumber: setNumber,
      weight: parsedWeight,
      reps: parsedReps,
      notes: notes,
      origin: 'v2.0_UI'
    });
  }

  if (invalidCount > 0) {
    spreadsheet.toast('Incomplete entries were skipped. Please fix the invalid rows before resubmitting.');
    return false;
  }

  if (!validRows.length) {
    spreadsheet.toast('No valid rows were found to submit.');
    return false;
  }

  var logSheet = ensureDataLogsSheet();
  var appendRows = [];

  for (var j = 0; j < validRows.length; j += 1) {
    var current = validRows[j];
    appendRows.push([
      createLogId(current.date),
      Utilities.formatDate(current.date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      current.exerciseId,
      current.exerciseName,
      current.setNumber,
      current.weight,
      'lb',
      current.reps,
      current.notes,
      estimateOneRm(current.weight, current.reps),
      current.origin,
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    ]);
  }

  logSheet.getRange(logSheet.getLastRow() + 1, 1, appendRows.length, appendRows[0].length).setValues(appendRows);
  entrySheet.getRange('B6:F30').clearContent();
  spreadsheet.toast('Workout log submitted successfully.');
  return true;
}

function resetLoggingForm() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var entrySheet = spreadsheet.getSheetByName('Workout Entry');

  if (!entrySheet) {
    return false;
  }

  entrySheet.getRange('B6:F30').clearContent();
  return true;
}
