/**
 * Bodyweight history (for relative strength). Weigh-ins are appended to the
 * hidden "Bodyweight Log" tab; older entries are never overwritten. The latest
 * weight is mirrored to Master "Current weight".
 *
 * A lift uses the most recent weigh-in on or before its date. When the latest
 * weigh-in is older than BODYWEIGHT.STALE_DAYS, the entry form asks for a new
 * one; "Not now" keeps using the old weight and snoozes the question.
 */
var BODYWEIGHT = { STALE_DAYS: 30, SNOOZE_DAYS: 7, PROP_SNOOZE: 'BODYWEIGHT_SNOOZE_UNTIL' };

function daysBetween_(fromIso, toIso) {
  var a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  var b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function addDays_(iso, days) {
  var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Most recent weigh-in on or before dateIso: {date, weight, unit, ageDays} or null. log: [{date, weight, unit}] */
function bodyweightOn(dateIso, log) {
  var best = null;
  log.forEach(function (w) {
    if (w.date && w.date <= dateIso && (!best || w.date >= best.date)) best = w;
  });
  return best ? { date: best.date, weight: best.weight, unit: best.unit, ageDays: daysBetween_(best.date, dateIso) } : null;
}

/** True when the form should ask for a new weigh-in today. */
function needsWeighIn(log, todayIso, snoozeUntilIso) {
  if (snoozeUntilIso && todayIso < snoozeUntilIso) return false;
  var latest = bodyweightOn(todayIso, log);
  return !latest || latest.ageDays > BODYWEIGHT.STALE_DAYS;
}

/** Parses "170", "170 lb", "77.5kg"; returns {weight, unit} or null. */
function parseBodyweightInput(text, defaultUnit) {
  var m = String(text).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg|kgs|kilograms?)?$/);
  if (!m) return null;
  var weight = parseFloat(m[1]);
  if (!(weight > 0) || weight > 1500) return null;
  return { weight: weight, unit: m[2] ? (/^k/.test(m[2]) ? 'kg' : 'lb') : defaultUnit };
}

// ---- sheet side ---------------------------------------------------------------

function readBodyweightLog_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.BODYWEIGHT);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.BODYWEIGHT_HEADERS.length).getValues()
    .filter(function (r) { return r[0] !== '' && parseFloat(r[1]) > 0; })
    .map(function (r) { return { date: dateToIso_(r[0]), weight: parseFloat(r[1]), unit: String(r[2] || 'lb'), source: String(r[3]) }; });
}

/** Appends a weigh-in (skips an exact duplicate) and updates Master "Current weight". */
function logBodyweight_(dateIso, weight, unit, source) {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.BODYWEIGHT, CONFIG.BODYWEIGHT_HEADERS, true);
  var dup = readBodyweightLog_().some(function (w) { return w.date === dateIso && w.weight === weight && w.unit === unit; });
  if (!dup) appendRows_(sheet, [[isoToDate_(dateIso), weight, unit, source]]);
  var latest = bodyweightOn('9999-12-31', readBodyweightLog_());
  if (latest) setMasterSetting_('Current weight', latest.weight);
  return !dup;
}

/** Writes the value next to a column-A label on Master (adds the row if missing). */
function setMasterSetting_(label, value) {
  var master = getMasterSheet_();
  var values = master.getRange(1, 1, SETTINGS_MAX_ROWS, 1).getValues();
  var lastUsed = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === label.toLowerCase()) { master.getRange(i + 1, 2).setValue(value); return; }
    if (String(values[i][0]).trim()) lastUsed = i + 1;
  }
  master.getRange(lastUsed + 1, 1, 1, 2).setValues([[label, value]]);
}

