function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Overload Tracker')
    .addItem('Set up workout entry form', 'setupEntryForm')
    .addItem('Set up compiled data', 'setupCompiledData')
    .addItem('Refresh compiled data', 'refreshCompiledData')
    .addSubMenu(ui.createMenu('Legacy migration')
      .addItem('1. Build name review', 'migrationBuildReview')
      .addItem('2. Preview import', 'migrationPreview')
      .addItem('3. Run import', 'migrationImport'))
    .addSubMenu(ui.createMenu('Advanced')
      .addItem('Connect Apple Health (optional, iPhone)', 'showAppleHealthSetup')
      .addItem('Reset Apple Health link', 'resetAppleHealthLink'))
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range) return;
  if (entryOnEdit(e)) return;
  if (compiledOnEdit(e)) return;
  popups(e);
}
