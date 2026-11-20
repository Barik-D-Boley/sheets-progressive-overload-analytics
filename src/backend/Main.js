function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Overload Tracker')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Legacy migration')
      .addItem('1. Build name review', 'migrationBuildReview')
      .addItem('2. Preview import', 'migrationPreview')
      .addItem('3. Run import', 'migrationImport'))
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  popups(e);
  // pushData() is wired to the submit checkbox in a later step; it no longer runs on every edit.
}
