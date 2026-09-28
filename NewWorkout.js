var targetColumns = [3, 10, 17];

// -------------------------
// Function 2: Adds the new workout information when an empty cell in the C, J, or Q columns are filled
// -------------------------
function newWorkout(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var sheetName = sheet.getName();
  var row = range.getRow();
  var col = range.getColumn();
  var value = e.value;

  var excludedSheets = ["Master", "One Rep Max Estimates"];
  if (excludedSheets.indexOf(sheetName) !== -1) return;

  // Ensure only a single cell was edited (ignore bulk copy/pasting)
  if (range.getNumColumns() > 1 || range.getNumRows() > 1) return;

  // Ensure a value was actually entered (ignore hitting 'delete' or 'backspace')
  if (value === undefined || value === "") return;

  // Check if the edit is in column C (3), J (10), or Q (17)
  if (targetColumns.indexOf(col) !== -1) {
    // Check if the cell directly above is empty (and make sure we aren't in row 1)
    if (row > 1) {
      const cellAboveValue = (num) => sheet.getRange(row - num, col).getValue();
      if (cellAboveValue(1) === "" && cellAboveValue(2) !== "" && (e.oldValue === undefined || e.oldValue === "")) {
        // Cell locations
        var dropDownCell = sheet.getRange(row, col - 1); 
        var dateCell = sheet.getRange(row, col - 2); 
        var gymCell = sheet.getRange(row + 1, col - 2);

        // Sets split day based on the column
        var splitDay = "";
        if (col === 3) splitDay = "Push";
        else if (col === 10) splitDay = "Pull";
        else if (col === 17) splitDay = "Leg";

        // Creates the rules for the dropdowns
        var splitOptions = [`${splitDay} day 1`, `${splitDay} day 2`, "Custom"]
        var splitRule = SpreadsheetApp.newDataValidation().requireValueInList(splitOptions, true).setAllowInvalid(false).build();
        var gymOptions = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("Gyms");
        var gymRule = SpreadsheetApp.newDataValidation().requireValueInRange(gymOptions, true).setAllowInvalid(false).build();

        // Cell edits
        dropDownCell.setDataValidation(splitRule)
        dateCell.setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "M/d/yy"));
        gymCell.setDataValidation(gymRule);
      }
    }
  }
}

// -------------------------
// Function 3: Replaces the workout dropdown with the workout content from the Master sheet
// -------------------------
function replaceDropdowns(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var row = range.getRow();
  var col = range.getColumn();
  var value = e.value;

  var dropdownColumns = targetColumns.map(col => col - 1);
  var rule = range.getDataValidation();

  // Checks if there's a dropdown in the exercises columns and runs replaceDropdowns()
  if (dropdownColumns.indexOf(col) !== -1 && rule !== null) {
    
    // Ensures the rule is specifically a dropdown
    var criteriaType = rule.getCriteriaType();
    var isDropdownList = (criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST);
    var isDropdownRange = (criteriaType === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE);
    
    if (isDropdownList || isDropdownRange) {
      // Cell locations
      var dropDownCell = sheet.getRange(row, col); 
      var gymCell = sheet.getRange(row + 1, col - 1);

      // Clears dropdowns
      dropDownCell.clearDataValidations();
      gymCell.clearDataValidations();

      // Adds all exercises from the master list if the option isn't custom; removes text from dropdown location if it's custom
      if (value !== "Custom") {
        // Extracts the appropriate range name from the cell value and creates the exerciseList
        var rangeName = value.split(" ");
        rangeName[1] = rangeName[1].replace(/\b\w/g, char => char.toUpperCase());
        rangeName = rangeName.join("");
        var exerciseList = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(rangeName).getValues();

        // Fills in all the exercises from the master list
        for (let i = 0; i < exerciseList.length; i++) {
          let currentCell = sheet.getRange(row + i, col); 
          currentCell.setValue(exerciseList[i])
        }
      } else {
        dropDownCell.clear();
      }
    }
  }
}