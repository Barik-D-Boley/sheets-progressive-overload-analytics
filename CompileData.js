// -------------------------
// Function 1: Compiles all the data from the different spreadsheets into one place
// -------------------------
function compileWorkoutData(e) {
  var range = e.range;
  var sheet = range.getSheet();
  var row = range.getRow();
  var col = range.getColumn();
  var value = e.value;

  if (row === 1 && col === 2) {
    if (value === "TRUE") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
  
      const targetSheetName = "One Rep Max Estimates"; 
      let targetSheet = ss.getSheetByName(targetSheetName);
      const startingRow = 3;
      
      if (!targetSheet) {
        targetSheet = ss.insertSheet(targetSheetName);
        targetSheet.getRange("A1").setValue("Update Data").setHorizontalAlignment("center").setFontWeight("normal");
        targetSheet.getRange("B1").insertCheckboxes().uncheck();
    } else {
        if (targetSheet.getFilter()) {
          targetSheet.getFilter().remove();
        }
        targetSheet.getBandings().forEach(b => b.remove());
        
        const lastRow = targetSheet.getLastRow();
        if (lastRow >= startingRow) {
          targetSheet.getRange(startingRow, 1, targetSheet.getMaxRows() - startingRow + 1, targetSheet.getMaxColumns()).clear(); 
        }
      }
      
      const outputData = [];
      outputData.push(["Date", "Gym", "Split", "Exercise", "Set 1", "Set 2", "Set 3", "1RM (Set 1)", "1RM (Set 2)", "1RM (Set 3)"]);
      
      const sheets = ss.getSheets();
      const sheetsToExclude = ["Master", "One Rep Max Estimates"];
      
      for (let s = 0; s < sheets.length; s++) {
        const sheet = sheets[s];
        
        if (sheetsToExclude.includes(sheet.getName())) continue;
        
        const data = sheet.getDataRange().getValues();
        if (data.length === 0) continue;

        const allowedCategories = ["Push", "Pull", "Legs"];
        const sections = [];
        
        for (let c = 0; c < data[0].length; c++) {
          if (typeof data[0][c] === 'string' && data[0][c].trim() === "Exercises") {
            const catName = data[0][c - 1];
            if (allowedCategories.includes(catName)) {
              sections.push({
                startColIndex: c - 1,
                categoryName: catName
              });
            }
          }
        }
        
        if (sections.length === 0) {
          sections.push({ startColIndex: 0, categoryName: "Push" });
          sections.push({ startColIndex: 7, categoryName: "Pull" });
          sections.push({ startColIndex: 14, categoryName: "Legs" });
        }
        
        sections.forEach(section => {
          const startColIndex = section.startColIndex;
          const currentCategory = section.categoryName;
          
          if (data[0].length <= startColIndex) return;
          
          let currentDate = "";
          let currentGym = "";
          
          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (row.length <= startColIndex) continue;
            
            let colA_Value = row[startColIndex];
            const exercise = row[startColIndex + 1];
            
            const set1 = row[startColIndex + 2];
            const set2 = row[startColIndex + 3];
            const set3 = row[startColIndex + 4];
            
            if (colA_Value !== "") {
              
              let isDate = false;
              if (colA_Value instanceof Date) {
                isDate = true;
              } else if (typeof colA_Value === 'string' && colA_Value.includes('/') && !isNaN(Date.parse(colA_Value))) {
                isDate = true;
                colA_Value = new Date(colA_Value);
              }

              if (isDate) {
                currentDate = colA_Value;
                currentGym = "BYUI"; 
                
                if (i + 1 < data.length) {
                  const nextRowValue = data[i + 1][startColIndex];
                  
                  let nextIsDate = false;
                  if (nextRowValue instanceof Date) {
                    nextIsDate = true;
                  } else if (typeof nextRowValue === 'string' && nextRowValue.includes('/') && !isNaN(Date.parse(nextRowValue))) {
                    nextIsDate = true;
                  }

                  if (nextRowValue !== "" && !nextIsDate) {
                    if (typeof nextRowValue !== 'string' || !nextRowValue.toLowerCase().includes("deload")) {
                      currentGym = nextRowValue;
                    }
                  }
                }
              } else {
                if (typeof colA_Value !== 'string' || !colA_Value.toLowerCase().includes("deload")) {
                  currentGym = colA_Value;
                }
              }
            }
            
            if (exercise && exercise !== "" && exercise !== "Exercises") {
              // Calculate the rounded 1RM for each set
              const rm1 = get1RM(set1);
              const rm2 = get1RM(set2);
              const rm3 = get1RM(set3);
              
              outputData.push([currentDate, currentGym, currentCategory, exercise, set1, set2, set3, rm1, rm2, rm3]);
            }
          }
        });
      }

      if (outputData.length > 1) {
        const dataRange = targetSheet.getRange(startingRow, 1, outputData.length, outputData[0].length);
        dataRange.setValues(outputData);
        
        // Sorts the data by most recent date
        targetSheet.getRange(startingRow + 1, 1, outputData.length - 1, outputData[0].length).sort({column: 1, ascending: false});

        // Formatting
        targetSheet.getRange(startingRow, 8, outputData.length, 3).setHorizontalAlignment("left");
        targetSheet.getRange(startingRow, 1, 1, 10).setFontWeight("bold");
        dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE);
        dataRange.createFilter();
        dataRange.setFontFamily("Roboto");
        targetSheet.setRowHeights(startingRow, outputData.length, 30);
        dataRange.setVerticalAlignment("middle");
        
        // Create a Named Range so you can reference this block in formulas
        ss.setNamedRange("AggregateData", dataRange);
      }
      range.uncheck();
    }
  }
}

// Helper function to calculate 1RM based on your text structure
function get1RM(setValue) {
  if (typeof setValue === 'string' && setValue.toLowerCase().includes('for')) {
    const parts = setValue.toLowerCase().split('for');
    
    // Grabs the raw math string (e.g., "400+2*45")
    const rawWeightEq = parts[0].trim();
    const reps = parseFloat(parts[1].trim());
    let weight = NaN;
    
    try {
      // Only allows numbers and math symbols (+ - * / ( ) . )
      const cleanWeightEq = rawWeightEq.replace(/[^0-9+\-*/(). ]/g, '');
      
      // Evaluates the math equation
      if (cleanWeightEq.length > 0) {
        weight = eval(cleanWeightEq);
      }
    } catch (e) {
      // If someone types an invalid equation like "400++*", it fails gracefully
      weight = NaN;
    }
    
    if (!isNaN(weight) && !isNaN(reps)) {
      if (reps == 0) return 0;
      else if (reps == 1) return weight;
      else if (reps > 12) return Math.round(weight * (1 + (12 / 30)));
      else return Math.round(weight * (1 + (reps / 30)));
    }
  }
  return "";
}