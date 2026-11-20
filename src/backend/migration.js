/**
 * One-time legacy import, run from the "Overload Tracker" menu on desktop:
 *   1. Build name review  -> "Migration Review" tab: approve or edit each legacy name.
 *   2. Preview import     -> "Migration Preview" tab: every entry with its status and issues.
 *   3. Run import         -> writes registries, quarter tabs, Cardio and Bodyweight Log.
 *
 * Safety: source tabs are never modified. Each imported row stores its legacy
 * cell reference in Source, and rows whose Source already exists are skipped,
 * so re-running after a partial failure only fills in what is missing. A
 * completed import is recorded in document properties and blocks re-runs.
 */
var REVIEW_HEADERS = ['Legacy Name', 'Found In', 'Times Used', 'Approved Name', 'Type (lift/cardio/skip)', 'Approved', 'Note'];

function readLegacyGrid_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.LEGACY);
  if (!sheet) throw new Error('Missing "' + CONFIG.SHEETS.LEGACY + '" tab.');
  return sheet.getDataRange().getDisplayValues();
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function isoToDate_(iso) {
  return new Date(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10));
}

function getOrCreateSheet_(name, headers, hidden) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (hidden) sheet.hideSheet();
  }
  return sheet;
}

// ---- Step 1 -------------------------------------------------------------

function migrationBuildReview() {
  var parsed = parseLegacyGrid(readLegacyGrid_(), { today: todayIso_() });
  var usage = {};
  parsed.entries.forEach(function (e) {
    var key = normalizeLegacyKey(e.legacyName);
    usage[key] = usage[key] || { name: e.legacyName.replace(/\s+/g, ' '), count: 0, blocks: {} };
    usage[key].count++;
    usage[key].blocks[e.block] = true;
  });

  var defaults = {};
  DEFAULT_LEGACY_NAME_MAP.forEach(function (d) { defaults[normalizeLegacyKey(d.legacy)] = d; });

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MIGRATION_REVIEW);
  var kept = {};
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, REVIEW_HEADERS.length).getValues().forEach(function (r) {
      if (r[0] !== '') kept[normalizeLegacyKey(r[0])] = r; // keep the user's edits
    });
  }

  var rows = Object.keys(usage).map(function (key) {
    var u = usage[key];
    var blocks = Object.keys(u.blocks).sort().join('/');
    if (kept[key]) { var r = kept[key].slice(); r[1] = blocks; r[2] = u.count; return r; }
    var d = defaults[key];
    if (!d) return [u.name, blocks, u.count, '', 'lift', false, 'New name - choose an exercise'];
    return [u.name, blocks, u.count, d.name, d.type, !d.review, d.note];
  }).sort(function (a, b) { return String(a[3] || '~').localeCompare(String(b[3] || '~')) || String(a[0]).localeCompare(String(b[0])); });

  if (!sheet) sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(CONFIG.SHEETS.MIGRATION_REVIEW);
  sheet.clear();
  sheet.getRange(1, 1, 1, REVIEW_HEADERS.length).setValues([REVIEW_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, REVIEW_HEADERS.length).setValues(rows);
    sheet.getRange(2, 6, rows.length, 1).insertCheckboxes();
    // insertCheckboxes keeps existing TRUE/FALSE values.
  }
  var pending = rows.filter(function (r) { return r[5] !== true; }).length;
  SpreadsheetApp.getActiveSpreadsheet().toast(rows.length + ' legacy names, ' + pending + ' still need approval.', 'Migration review', 8);
}

/** Approved rows of the review tab -> name map for buildMigrationPlan. */
function readApprovedNameMap_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MIGRATION_REVIEW);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('Run "1. Build name review" first.');
  var map = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, REVIEW_HEADERS.length).getValues().forEach(function (r) {
    var type = String(r[4]).trim().toLowerCase();
    if (r[0] === '' || r[5] !== true) return;
    if (type !== 'skip' && !String(r[3]).trim()) return;
    map[normalizeLegacyKey(r[0])] = { name: String(r[3]).trim(), type: type === 'cardio' || type === 'skip' ? type : 'lift' };
  });
  return map;
}

function buildPlanFromSheet_() {
  var parsed = parseLegacyGrid(readLegacyGrid_(), { today: todayIso_() });
  return buildMigrationPlan(parsed, readApprovedNameMap_(), { unit: CONFIG.LEGACY_UNIT });
}

// ---- Step 2 -------------------------------------------------------------

function migrationPreview() {
  var plan = buildPlanFromSheet_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.MIGRATION_PREVIEW) || ss.insertSheet(CONFIG.SHEETS.MIGRATION_PREVIEW);
  sheet.clear();

  var c = plan.counts;
  var summary = [
    ['Migration preview', ''],
    ['Ready to import', c.ready],
    ['Imported with cells to fix later (flagged)', c.flagged],
    ['Not imported until fixed (blocked)', c.blocked],
    ['Skipped (type "skip")', c.skipped],
    ['Lift rows / cardio rows / bodyweights', plan.lifts.length + ' / ' + plan.cardio.length + ' / ' + plan.bodyweights.length],
    ['Already imported?', PropertiesService.getDocumentProperties().getProperty(CONFIG.PROP_LEGACY_IMPORT_DONE) || 'No'],
  ];
  sheet.getRange(1, 1, summary.length, 2).setValues(summary);
  sheet.getRange(1, 1).setFontWeight('bold');

  var issueStart = summary.length + 2;
  var issues = [['Issue status', 'Legacy cell', 'Problem']].concat(plan.issues.map(function (i) { return [i.status, i.ref, i.message]; }));
  sheet.getRange(issueStart, 1, issues.length, 3).setValues(issues);
  sheet.getRange(issueStart, 1, 1, 3).setFontWeight('bold');

  var recStart = issueStart + issues.length + 1;
  var maxSets = plan.lifts.reduce(function (m, l) { return Math.max(m, l.sets.length); }, CONFIG.DEFAULT_SET_COUNT);
  var header = ['Status', 'Legacy cell', 'Date', 'Gym', 'Workout', 'Legacy name', 'Exercise', 'Notes'];
  for (var s = 1; s <= maxSets; s++) header.push('Set ' + s);
  var rows = [header];
  plan.lifts.forEach(function (l) {
    var row = [l.status, l.ref, l.date, l.gym, l.workout, l.legacyName, l.exercise, l.notes];
    for (var i = 0; i < maxSets; i++) row.push(l.sets[i] || '');
    rows.push(row);
  });
  plan.cardio.forEach(function (x) {
    var row = [x.status, x.ref, x.date, x.gym, 'Cardio', x.legacyName, x.exercise, x.notes,
      x.durationMin === null ? '' : x.durationMin + ' min',
      x.speed === null ? '' : x.speed + ' ' + x.speedUnit,
      x.distance === null ? '' : x.distance + ' ' + x.distanceUnit];
    while (row.length < header.length) row.push('');
    rows.push(row);
  });
  sheet.getRange(recStart, 1, rows.length, header.length).setValues(rows);
  sheet.getRange(recStart, 1, 1, header.length).setFontWeight('bold');
  sheet.setFrozenRows(0);
  ss.setActiveSheet(sheet);
}

// ---- Step 3 -------------------------------------------------------------

function migrationImport() {
  var props = PropertiesService.getDocumentProperties();
  var done = props.getProperty(CONFIG.PROP_LEGACY_IMPORT_DONE);
  var ui = SpreadsheetApp.getUi();
  if (done) {
    ui.alert('Legacy import already completed (' + done + '). It will not run again.');
    return;
  }
  var plan = buildPlanFromSheet_();
  var c = plan.counts;
  var answer = ui.alert('Run legacy import?',
    'Import ' + (c.ready + c.flagged) + ' entries (' + c.flagged + ' with cells to fix later).\n' +
    c.blocked + ' blocked entries will NOT be imported (see Migration Preview).\n\nThe legacy tab is not changed.',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;

  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var result = writeMigrationPlan_(plan);
    var stamp = new Date().toISOString() + ' - ' + result.lifts + ' lift rows, ' + result.cardio + ' cardio rows, ' +
      result.bodyweights + ' bodyweights, ' + result.duplicates + ' already present';
    props.setProperty(CONFIG.PROP_LEGACY_IMPORT_DONE, stamp);
    ui.alert('Legacy import complete', stamp + '\nBlocked entries not imported: ' + c.blocked, ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

/** Writes the plan. Safe to repeat: rows whose Source already exists are skipped. */
function writeMigrationPlan_(plan) {
  var lifts = plan.lifts, cardio = plan.cardio;
  var gymIds = ensureRegistryEntries('gyms', uniq_(lifts.concat(cardio).map(function (r) { return r.gym; })));
  var workoutIds = ensureRegistryEntries('workouts', uniq_(lifts.map(function (r) { return r.workout; })));
  var exerciseIds = ensureRegistryEntries('exercises', uniq_(lifts.map(function (r) { return r.exercise; })),
    function (name) { return [equipmentFromName(name), '', '', true]; });
  var cardioIds = ensureRegistryEntries('cardio', uniq_(cardio.map(function (r) { return r.exercise; })),
    function () { return [true]; });
  var id = function (map, name) { return name ? map[String(name).toLowerCase()] || '' : ''; };
  var result = { lifts: 0, cardio: 0, bodyweights: 0, duplicates: 0 };

  var byQuarter = {};
  lifts.forEach(function (l) { (byQuarter[quarterTabName(l.date)] = byQuarter[quarterTabName(l.date)] || []).push(l); });
  Object.keys(byQuarter).sort().forEach(function (tab) {
    var records = byQuarter[tab].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var sheet = getOrCreateQuarterSheet(tab);
    var existing = existingSources_(sheet, CONFIG.QUARTER_HEADERS.indexOf('Source') + 1);
    var rows = [];
    records.forEach(function (l) {
      if (existing[l.source]) { result.duplicates++; return; }
      rows.push([newRecordId_('L'), isoToDate_(l.date), id(gymIds, l.gym), id(workoutIds, l.workout),
        id(exerciseIds, l.exercise), l.unit, l.notes, l.source].concat(l.sets));
    });
    appendRows_(sheet, rows);
    result.lifts += rows.length;
  });

  var cardioSheet = getOrCreateSheet_(CONFIG.SHEETS.CARDIO, CONFIG.CARDIO_HEADERS, false);
  var cardioExisting = existingSources_(cardioSheet, CONFIG.CARDIO_HEADERS.indexOf('Source') + 1);
  var cardioRows = [];
  cardio.forEach(function (x) {
    if (cardioExisting[x.source]) { result.duplicates++; return; }
    cardioRows.push([newRecordId_('C'), isoToDate_(x.date), id(gymIds, x.gym), id(cardioIds, x.exercise),
      nz_(x.durationMin), nz_(x.speed), x.speedUnit, nz_(x.distance), x.distanceUnit, nz_(x.calories), x.notes, x.source]);
  });
  appendRows_(cardioSheet, cardioRows);
  result.cardio = cardioRows.length;

  var bwSheet = getOrCreateSheet_(CONFIG.SHEETS.BODYWEIGHT, CONFIG.BODYWEIGHT_HEADERS, true);
  var bwExisting = existingSources_(bwSheet, CONFIG.BODYWEIGHT_HEADERS.indexOf('Source') + 1);
  var bwRows = plan.bodyweights.filter(function (b) { return b.date && !bwExisting[b.source]; })
    .map(function (b) { return [isoToDate_(b.date), b.weight, b.unit, b.source]; });
  appendRows_(bwSheet, bwRows);
  result.bodyweights = bwRows.length;
  return result;
}

/** Quarter tab (e.g. "Q4 2026"); created hidden with headers if missing. */
function getOrCreateQuarterSheet(tabName) {
  var headers = CONFIG.QUARTER_HEADERS.slice();
  var setCount = Math.max(CONFIG.DEFAULT_SET_COUNT, getSetCountSetting_());
  for (var s = 1; s <= setCount; s++) headers.push('Set ' + s);
  return getOrCreateSheet_(tabName, headers, true);
}

/** Master "Num of sets" setting (row labelled "Num of sets" in column A). */
function getSetCountSetting_() {
  var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MASTER);
  if (!master) return CONFIG.DEFAULT_SET_COUNT;
  var values = master.getRange(1, 1, Math.min(master.getLastRow() || 1, 50), 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === 'num of sets') {
      var n = parseInt(values[i][1], 10);
      return n > 0 ? n : CONFIG.DEFAULT_SET_COUNT;
    }
  }
  return CONFIG.DEFAULT_SET_COUNT;
}

function existingSources_(sheet, sourceCol) {
  var out = {};
  var last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, sourceCol, last - 1, 1).getValues().forEach(function (r) { if (r[0]) out[r[0]] = true; });
  return out;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  rows = rows.map(function (r) { r = r.slice(); while (r.length < width) r.push(''); return r; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
}

function newRecordId_(prefix) { return prefix + '-' + Utilities.getUuid().slice(0, 8); }
function nz_(v) { return v === null || v === undefined ? '' : v; }
function uniq_(list) {
  var seen = {}, out = [];
  list.forEach(function (v) { var k = String(v || '').toLowerCase(); if (k && !seen[k]) { seen[k] = true; out.push(v); } });
  return out;
}
