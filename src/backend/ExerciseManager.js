function ensureMasterSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var master = spreadsheet.getSheetByName('Master');

  if (!master) {
    master = spreadsheet.insertSheet('Master');
  }

  var headers = [
    'Exercise_ID',
    'Exercise_Name',
    'Category',
    'Primary_Muscle',
    'Secondary_Muscle',
    'Is_Active'
  ];

  if (!master.getDataRange().getValues().length || String(master.getRange(1, 1, 1, 1).getValue()).toLowerCase() !== 'exercise_id') {
    master.clear();
    master.getRange(1, 1, 1, headers.length).setValues([headers]);
    master.setFrozenRows(1);
    master.autoResizeColumns(1, headers.length);
  }

  try {
    spreadsheet.removeNamedRange('MasterExerciseList');
  } catch (error) {
    // A named range may not exist yet; continue with setup.
  }

  var range = master.getRange(2, 2, Math.max(master.getLastRow() - 1, 1), 1);
  spreadsheet.setNamedRange('MasterExerciseList', range);

  return master;
}

function normalizeProgressiveExerciseName(rawName) {
  if (rawName === null || rawName === undefined) {
    return '';
  }

  var value = String(rawName).trim();
  if (!value) {
    return '';
  }

  value = value.replace(/[\u2013\u2014]/g, '-');
  value = value.replace(/\s+/g, ' ');
  value = value.replace(/^plate\s*[- ]?loaded\s+/i, 'PL ');
  value = value.replace(/^pl\s+/i, 'PL ');
  value = value.replace(/^plate-loaded\s+/i, 'PL ');
  value = value.replace(/^plate\s+loaded\s+/i, 'PL ');

  var mapped = {
    'Lat Pulldown': 'Lat Pulldowns',
    'Lat Pulldowns': 'Lat Pulldowns',
    'Biceps Curl': 'Bicep Curls',
    'Bicep Curl': 'Bicep Curls',
    'Bicep Curls': 'Bicep Curls',
    'Bench Press': 'Bench Press',
    'Plate Loaded Row': 'PL Row',
    'PL Row': 'PL Row',
    'Chest Supported Row': 'Chest-Supported Row',
    'Chest-Supported Row': 'Chest-Supported Row',
    'Deadlift': 'Deadlift',
    'Squat': 'Squat'
  };

  if (mapped[value]) {
    value = mapped[value];
  } else {
    value = value.replace(/\bPulldown\b/i, 'Pulldowns');
    value = value.replace(/\bPull Down\b/i, 'Pulldowns');
    value = value.replace(/\bCurl\b/i, 'Curls');
    value = value.replace(/\bRow\b/i, 'Rows');
    value = value.replace(/\bDip\b/i, 'Dips');
    value = value.replace(/\bExtension\b/i, 'Extensions');
  }

  value = value.replace(/\s*[-]\s*/g, ' ');
  value = value.split(' ').map(function (word) {
    if (!word) {
      return '';
    }

    if (word.toLowerCase() === 'pl') {
      return 'PL';
    }

    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');

  value = value.replace(/^PL\s+/, 'PL ');
  value = value.replace(/\s+/g, ' ').trim();

  return value;
}

function createExerciseId() {
  var master = ensureMasterSheet();
  var rows = master.getDataRange().getValues();
  var maxId = 0;

  for (var i = 1; i < rows.length; i += 1) {
    var candidate = String(rows[i][0] || '').trim();
    var match = candidate.match(/(\d+)$/);
    if (match) {
      var numeric = parseInt(match[1], 10);
      if (numeric > maxId) {
        maxId = numeric;
      }
    }
  }

  return 'EX-' + String(maxId + 1).padStart(3, '0');
}

function isExerciseInRegistry(exerciseName) {
  var master = ensureMasterSheet();
  var names = master.getRange(2, 2, Math.max(master.getLastRow() - 1, 0), 1).getValues();

  for (var i = 0; i < names.length; i += 1) {
    if (String(names[i][0] || '').trim() === normalizeProgressiveExerciseName(exerciseName)) {
      return true;
    }
  }

  return false;
}

function registerExercise(exerciseName, category) {
  var master = ensureMasterSheet();
  var normalized = normalizeProgressiveExerciseName(exerciseName);

  if (!normalized) {
    return null;
  }

  var rows = master.getDataRange().getValues();
  for (var i = 1; i < rows.length; i += 1) {
    var name = String(rows[i][1] || '').trim();
    if (name === normalized) {
      return {
        id: String(rows[i][0] || ''),
        name: name,
        category: String(rows[i][2] || 'Uncategorized')
      };
    }
  }

  var id = createExerciseId();
  master.appendRow([
    id,
    normalized,
    category || 'Uncategorized',
    '',
    '',
    true
  ]);

  return {
    id: id,
    name: normalized,
    category: category || 'Uncategorized'
  };
}

function syncExerciseRegistry() {
  var master = ensureMasterSheet();
  var values = master.getDataRange().getValues();

  if (values.length <= 1) {
    master.appendRow(['EX-001', 'Bench Press', 'Barbell', 'Chest', 'Triceps', true]);
    master.appendRow(['EX-002', 'Lat Pulldowns', 'Cable', 'Back', 'Biceps', true]);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Exercise registry synchronized.');
  return getConfiguredExerciseList();
}

function getConfiguredExerciseList() {
  var master = ensureMasterSheet();
  var values = master.getRange(2, 2, Math.max(master.getLastRow() - 1, 0), 1).getValues();
  var exercises = [];

  for (var i = 0; i < values.length; i += 1) {
    var name = String(values[i][0] || '').trim();
    if (name) {
      exercises.push(name);
    }
  }

  return exercises;
}
