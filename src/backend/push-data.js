function pushData(e) {
  if (!e || !e.range) {
    return;
  }

  var sheet = e.range.getSheet();
  if (sheet.getName() === 'Workout Entry') {
    var editedValue = String(e.value || '').trim();
    if (editedValue) {
      SpreadsheetApp.getActiveSpreadsheet().toast('Workout entry updated.');
    }
  }
}
