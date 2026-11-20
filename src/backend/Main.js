function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Overload Tracker')
    .addItem('Set up workout entry form', 'setupEntryForm')
    .addSubMenu(ui.createMenu('Legacy migration')
      .addItem('1. Build name review', 'migrationBuildReview')
      .addItem('2. Preview import', 'migrationPreview')
      .addItem('3. Run import', 'migrationImport'))
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  if (entryOnEdit(e)) return;
  popups(e);
}
