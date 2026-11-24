/**
 * Moves an older Master layout to the current one (CONFIG.MASTER_LAYOUT_VERSION).
 * v1 -> v2: the exercise list grows by two columns (Rep Range, Top Set), so the
 * tables to its right shift: workouts Q->T, gyms T->W, cardio W->Z, routines AA->AD,
 * name tags AR->AV. Contents move unchanged; checkboxes, dropdowns and the entry
 * form's Master-backed dropdowns are re-applied. Runs once (document property).
 */
var MASTER_LAYOUT_PROP = 'MASTER_LAYOUT';

var MASTER_V1_TO_V2_MOVES = [   // rightmost first, so nothing is overwritten before it moves
  { from: 'AR', to: 'AV', width: 2 },   // name tags
  { from: 'AA', to: 'AD', width: 17 },  // routines
  { from: 'W', to: 'Z', width: 3 },     // cardio
  { from: 'T', to: 'W', width: 2 },     // gyms
  { from: 'Q', to: 'T', width: 2 },     // workouts
];

function ensureMasterLayout_(master) {
  var props = PropertiesService.getDocumentProperties();
  if (props.getProperty(MASTER_LAYOUT_PROP) === CONFIG.MASTER_LAYOUT_VERSION) return;
  var isV1 = String(master.getRange('Q2').getValue()) === 'Workout ID';
  if (isV1) {
    var last = Math.max(master.getLastRow(), 2);
    MASTER_V1_TO_V2_MOVES.forEach(function (m) {
      var from = master.getRange(1, columnLetterToIndex(m.from), last, m.width);
      var values = from.getValues();
      from.clearContent().clearDataValidations();
      var to = master.getRange(1, columnLetterToIndex(m.to), last, m.width);
      to.setValues(values);
      master.getRange(1, columnLetterToIndex(m.to), 2, m.width).setFontWeight('bold');
    });
  }
  props.setProperty(MASTER_LAYOUT_PROP, CONFIG.MASTER_LAYOUT_VERSION);
  if (isV1) reapplyMasterFormatting_(master);
}

/** Checkboxes and dropdowns that point at Master columns (after the tables moved). */
function reapplyMasterFormatting_(master) {
  var cardio = CONFIG.REGISTRIES.cardio;
  var cardioRows = readRegistryRows('cardio');
  if (cardioRows.length) {
    master.getRange(REGISTRY_FIRST_DATA_ROW, columnLetterToIndex(cardio.column) + cardio.headers.indexOf('Active'),
      cardioRows[cardioRows.length - 1]._row - REGISTRY_FIRST_DATA_ROW + 1, 1).insertCheckboxes();
  }
  if (String(master.getRange(2, columnLetterToIndex(CONFIG.ROUTINES.column)).getValue()) === 'Routine') {
    applyRoutineFormatting_(master);
  }
  var entry = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.ENTRY);
  if (entry && isEntryFormSheet_(entry)) applyEntryMasterValidations_(entry);
}
