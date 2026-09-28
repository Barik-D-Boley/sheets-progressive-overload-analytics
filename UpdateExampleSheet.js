function pushToExampleSheet() {
  const exampleSheetId = '1kjM9d47ogBeWuxiDNoTwYUT8LfNfYfg84JjlGTUdZO0'; 
  const sourceSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const targetSpreadsheet = SpreadsheetApp.openById(exampleSheetId);

  const sheetsToSync = ['Master', 'One Rep Max Estimates'];

  sheetsToSync.forEach(sheetName => {
    const sourceSheet = sourceSpreadsheet.getSheetByName(sheetName);
    if (!sourceSheet) return;

    // Delete the old version in the example sheet if it exists
    const oldTargetSheet = targetSpreadsheet.getSheetByName(sheetName);
    if (oldTargetSheet) {
      targetSpreadsheet.deleteSheet(oldTargetSheet);
    }

    // Copy the current sheet and rename it to remove "Copy of"
    const newTargetSheet = sourceSheet.copyTo(targetSpreadsheet);
    newTargetSheet.setName(sheetName);

    // Scrub personal data based on the sheet name
    if (sheetName === 'Master') {
      // Clears the target lift numbers (Columns C and F)
      newTargetSheet.getRange('C2:C').clearContent();
      newTargetSheet.getRange('F2:F').clearContent();
    } else if (sheetName === 'One Rep Max Estimates') {
      // Clears the Set data and 1RM calculations (Columns E through J)
      newTargetSheet.getRange('E4:J').clearContent();
    }
  });
}