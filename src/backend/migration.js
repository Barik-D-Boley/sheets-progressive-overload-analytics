/**
 * Migration.js
 * Progressive Overload Tracker 2.0 - Phase 1: Core Foundation & Data Architecture
 */

function normalizeExerciseName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';

  var cleanName = rawName.trim();
  cleanName = cleanName.replace(/^(plate[- ]loaded|plate_loaded|pl)\b\s*/i, 'PL ');
  cleanName = cleanName.split(/\s+/).map(function (word) {
    if (word.toUpperCase() === 'PL') return 'PL';
    if (word.toUpperCase() === 'RPE') return 'RPE';
    if (word.toUpperCase() === '1RM') return '1RM';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');

  var pluralRules = [
    { regex: /\bPulldown\b/i, replacement: 'Pulldowns' },
    { regex: /\bCurl\b/i, replacement: 'Curls' },
    { regex: /\bExtension\b/i, replacement: 'Extensions' },
    { regex: /\bRaise\b/i, replacement: 'Raises' },
    { regex: /\bPushdown\b/i, replacement: 'Pushdowns' },
    { regex: /\bFlye?\b/i, replacement: 'Flyes' },
    { regex: /\bDip\b/i, replacement: 'Dips' },
    { regex: /\bShrug\b/i, replacement: 'Shrugs' },
    { regex: /\bCrunch\b/i, replacement: 'Crunches' },
    { regex: /\bCalf Raise\b/i, replacement: 'Calf Raises' },
    { regex: /\bRow\b/i, replacement: 'Rows' }
  ];

  pluralRules.forEach(function (rule) {
    cleanName = cleanName.replace(rule.regex, rule.replacement);
  });

  return cleanName;
}

function calculate1RM(weight, reps) {
  var w = Number(weight) || 0;
  var r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;

  var raw1RM = r === 1 ? w : w * (1 + r / 30);
  if (raw1RM < 100) {
    return Math.round(raw1RM * 10) / 10;
  }
  return Math.round(raw1RM);
}

function generateLogId(dateObj, index) {
  var d = (dateObj instanceof Date && !isNaN(dateObj)) ? dateObj : new Date(dateObj);
  if (isNaN(d.getTime())) {
    d = new Date();
  }

  var year = d.getFullYear();
  var month = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var dateStr = '' + year + month + day;
  var sequence = ('000' + (index || 1)).slice(-4);
  return 'LOG-' + dateStr + '-' + sequence;
}

function setupMasterExercisesSheet(ss) {
  var spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('Master');

  if (!sheet) {
    sheet = spreadsheet.insertSheet('Master');
  }

  var headers = ['Exercise_ID', 'Exercise_Name', 'Category', 'Primary_Muscle', 'Secondary_Muscle', 'Is_Active'];
  if (!sheet.getDataRange().getValues().length || String(sheet.getRange(1, 1, 1, 1).getValue()).toLowerCase() !== 'exercise_id') {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function setupDataLogsSheet(ss) {
  var spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('Data_Logs');

  if (!sheet) {
    sheet = spreadsheet.insertSheet('Data_Logs');
  }

  var headers = ['Log_ID', 'Date', 'Exercise_ID', 'Exercise_Name', 'Set_Number', 'Load', 'Load_Unit', 'Reps', 'Notes', 'Estimated_1RM', 'Sheet_Origin', 'Created_At'];
  if (!sheet.getDataRange().getValues().length || String(sheet.getRange(1, 1, 1, 1).getValue()).toLowerCase() !== 'log_id') {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function syncLegacyExerciseRegistry(ss) {
  var spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  var masterSheet = spreadsheet.getSheetByName('Master');
  if (!masterSheet) return;

  var lastRow = Math.max(masterSheet.getLastRow(), 2);
  var targetRange = masterSheet.getRange(2, 2, lastRow - 1, 1);

  try {
    spreadsheet.removeNamedRange('MasterExerciseList');
  } catch (error) {
    // Ignore if it is not set yet.
  }

  spreadsheet.setNamedRange('MasterExerciseList', targetRange);
}

function transformLegacyRow(rawRow, sheetSourceTag, index) {
  if (!rawRow) return null;

  var sourceTag = sheetSourceTag || 'v1.0_Legacy';
  var idx = index || 1;
  var dateVal, exerciseRaw, setNum, weightVal, repsVal;

  if (Array.isArray(rawRow)) {
    if (rawRow.length >= 5) {
      if (rawRow[0] instanceof Date || (typeof rawRow[0] === 'string' && rawRow[0].match(/^\d{4}/))) {
        dateVal = rawRow[0];
        exerciseRaw = rawRow[1];
        setNum = rawRow[2];
        weightVal = rawRow[3];
        repsVal = rawRow[4];
      } else {
        dateVal = rawRow[1];
        exerciseRaw = rawRow[2];
        setNum = rawRow[3];
        weightVal = rawRow[4];
        repsVal = rawRow[5];
      }
    } else {
      return null;
    }
  } else if (typeof rawRow === 'object') {
    dateVal = rawRow.date || rawRow.Date;
    exerciseRaw = rawRow.exercise || rawRow.exercise_name || rawRow.Exercise_Name || rawRow.Exercise;
    setNum = rawRow.set || rawRow.set_number || rawRow.Set_Number || rawRow.Set;
    weightVal = rawRow.weight || rawRow.Weight;
    repsVal = rawRow.reps || rawRow.Reps;
  } else {
    return null;
  }

  var normalizedExercise = normalizeExerciseName(exerciseRaw);
  if (!normalizedExercise) return null;

  var parsedWeight = Number(weightVal) || 0;
  var parsedReps = Number(repsVal) || 0;
  var parsedSet = Number(setNum) || 1;
  var est1RM = calculate1RM(parsedWeight, parsedReps);
  var logId = generateLogId(dateVal, idx);

  return [
    logId,
    new Date(dateVal),
    'legacy',
    normalizedExercise,
    parsedSet,
    parsedWeight,
    'lb',
    parsedReps,
    '',
    est1RM,
    sourceTag,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
  ];
}

function migrateLegacyData(sourceSheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sourceName = sourceSheetName || 'All Data - Unorganized';
  var sourceSheet = spreadsheet.getSheetByName(sourceName) || spreadsheet.getSheetByName('v1.0_Legacy');

  if (!sourceSheet) {
    spreadsheet.toast('Legacy source sheet not found.');
    return { imported: 0, invalid: 0, skipped: 0 };
  }

  var masterSheet = setupMasterExercisesSheet(spreadsheet);
  var dataSheet = setupDataLogsSheet(spreadsheet);
  var rawRows = sourceSheet.getDataRange().getValues();
  var validRows = [];
  var invalidRows = 0;

  for (var i = 1; i < rawRows.length; i += 1) {
    var transformed = transformLegacyRow(rawRows[i], sourceName, i);
    if (transformed) {
      validRows.push(transformed);
      registerExercise(transformed[3], 'Legacy');
    } else if (Object.prototype.toString.call(rawRows[i]).indexOf('Array') !== -1 && rawRows[i].some(function (cell) { return String(cell || '').trim(); })) {
      invalidRows += 1;
    }
  }

  if (validRows.length) {
    var startRow = dataSheet.getLastRow() + 1;
    dataSheet.getRange(startRow, 1, validRows.length, validRows[0].length).setValues(validRows);
  }

  syncLegacyExerciseRegistry(spreadsheet);
  spreadsheet.toast('Migration complete: ' + validRows.length + ' imported, ' + invalidRows + ' invalid rows skipped.');
  return {
    imported: validRows.length,
    invalid: invalidRows,
    skipped: invalidRows
  };
}
