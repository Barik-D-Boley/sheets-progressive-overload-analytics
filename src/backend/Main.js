function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Progressive Overload 2.0')
    .addItem('Initialize Tracker', 'initializeProgressiveOverloadTracker')
    .addItem('Sync Master Exercises', 'syncExerciseRegistry')
    .addItem('Migrate Legacy Data', 'migrateLegacyData')
    .addItem('Submit Workout Log', 'submitWorkoutLog')
    .addToUi();
}

function initializeProgressiveOverloadTracker() {
  ensureMasterSheet();
  ensureDataLogsSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('Tracker initialized.');
}

function onEdit(e) {
  if (!e || !e.range) return;

  popups(e);
  pushData(e);
}