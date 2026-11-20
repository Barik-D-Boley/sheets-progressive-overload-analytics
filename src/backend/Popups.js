function popups(e) {
  if (!e || !e.range) {
    return;
  }

  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'Workout Entry') {
    return;
  }

  var editedValue = String(e.value || '').trim();
  if (!editedValue) {
    return;
  }

  var normalized = normalizeProgressiveExerciseName(editedValue);
  if (!normalized || isExerciseInRegistry(normalized)) {
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    'Add new exercise?',
    'The exercise "' + normalized + '" is not in the master registry. Add it now?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    registerExercise(normalized, 'Uncategorized');
  }
}
