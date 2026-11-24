/**
 * Master settings live in columns A:B as "Label | Value" rows. They are read
 * by label (case-insensitive), so rows can be moved freely. Missing settings
 * are appended below the existing ones by ensureSettings_().
 */
var SETTING_DEFAULTS = [
  ['Default rep range', 'Bodybuilding', 'A rep range from the Rep ranges table; an exercise\'s Rep Range overrides it'],
  ['1RM Formula', 'Epley', 'Epley, Brzycki, Lombardi, Mayhew, O\'Conner, Wathan, Lander'],
  ['Weight system', 'Imperial', 'Imperial (lb) or Metric (kg)'],
  ['Num of sets', 3, 'Working sets per exercise'],
  ['Load increment', 5, 'Default jump in lb/kg; an exercise\'s Increment column overrides it'],
  ['Stall threshold (sessions)', 3, 'Sessions without a 1RM gain before a reset is suggested'],
  ['Top set range', '90-93%', 'Weekly top set (exercises with Top Set ticked): % of best estimated 1RM'],
  ['Start of week', 'Monday', 'The first workout of the week gets the top set'],
];

var SETTINGS_MAX_ROWS = 80;

function readSettingsFrom_(values) {
  var out = {};
  values.forEach(function (r) {
    var label = String(r[0]).trim().toLowerCase();
    if (label && !(label in out)) out[label] = r[1];
  });
  SETTING_DEFAULTS.forEach(function (d) {
    var key = d[0].toLowerCase();
    if (!(key in out) || out[key] === '' || out[key] === null) out[key] = d[1];
  });
  return out;
}

function readSettings_() {
  var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MASTER);
  if (!master) return readSettingsFrom_([]);
  return readSettingsFrom_(master.getRange(1, 1, SETTINGS_MAX_ROWS, 2).getValues());
}

function ensureSettings_() {
  var master = getMasterSheet_();
  var values = master.getRange(1, 1, SETTINGS_MAX_ROWS, 3).getValues();
  var have = {};
  var lastRow = 0;
  values.forEach(function (r, i) {
    if (String(r[0]).trim()) { have[String(r[0]).trim().toLowerCase()] = true; lastRow = i + 1; }
  });
  var missing = SETTING_DEFAULTS.filter(function (d) { return !have[d[0].toLowerCase()]; });
  if (missing.length) {
    master.getRange(lastRow + 2, 1, missing.length, 3).setValues(missing);
  }
}

/** 'lb' or 'kg' from the Weight system setting. */
function weightUnit_(settings) {
  return /metric|kg/i.test(String(settings['weight system'])) ? 'kg' : 'lb';
}

function settingSetCount_(settings) {
  var n = parseInt(settings['num of sets'], 10);
  return n > 0 ? n : CONFIG.DEFAULT_SET_COUNT;
}
