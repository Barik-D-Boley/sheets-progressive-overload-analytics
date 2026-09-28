// -------------------------
// Searches all exercises in the Aggregate Data table based on the text in cell D1
// -------------------------
function searchExercises(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  var row = range.getRow();
  var col = range.getColumn();
  var value = e.value;

  // Only runs if it's cell D1 in the One Rep Max Estimates sheet
  if (sheetName === "One Rep Max Estimates" && row === 1 && col === 4) {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 3) return; 
    const dataRange = sheet.getRange(3, 1, lastRow - 2, lastCol);
    
    // Clears existing filters
    if (dataRange.getFilter() !== null) {
      dataRange.getFilter().remove();
    }
    
    // Builds and applies new filter
    if (value !== "") {
      const filter = dataRange.createFilter();
      
      const criteria = SpreadsheetApp.newFilterCriteria()
        .whenTextContains(value)
        .build();
        
      // Apply to column 4 of the range (Column D)
      filter.setColumnFilterCriteria(4, criteria);
    }
  }
}