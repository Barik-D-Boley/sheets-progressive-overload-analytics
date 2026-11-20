/**
 * Registries on Master (exercises, workouts, gyms). Each has a stable ID; data
 * rows store IDs and resolve the display name here, so renaming an entry here
 * renames it everywhere without changing history.
 * Layout per registry (CONFIG.REGISTRIES): title in row 1, headers in row 2, data from row 3.
 */
var REGISTRY_FIRST_DATA_ROW = 3;

function columnLetterToIndex(letter) {
  var n = 0;
  for (var i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n;
}

function getMasterSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MASTER);
  if (!sheet) throw new Error('Missing "' + CONFIG.SHEETS.MASTER + '" tab.');
  return sheet;
}

/** Writes the title/headers if absent; refuses to overwrite unrelated content. */
function ensureRegistryHeaders_(kind) {
  var spec = CONFIG.REGISTRIES[kind];
  var sheet = getMasterSheet_();
  var col = columnLetterToIndex(spec.column);
  var top = sheet.getRange(1, col, 2, spec.headers.length).getValues();
  var headersOk = spec.headers.every(function (h, i) { return top[1][i] === h; });
  if (headersOk) return;
  // Older layout with fewer columns: the existing headers are a prefix, so add the new ones.
  var filled = top[1].filter(function (v) { return v !== ''; }).length;
  var isPrefix = filled > 0 && top[1].slice(0, filled).every(function (v, i) { return v === spec.headers[i]; }) &&
    top[1].slice(filled).every(function (v) { return v === ''; });
  if (isPrefix) {
    sheet.getRange(2, col, 1, spec.headers.length).setValues([spec.headers]).setFontWeight('bold');
    return;
  }
  var occupied = top[1].some(function (v) { return v !== ''; }) ||
    top[0].some(function (v, i) { return v !== '' && !(i === 0 && v === spec.title); });
  if (occupied) {
    throw new Error('Master ' + spec.column + '1:' + spec.column + '2 already has other content; ' +
      'move it or change CONFIG.REGISTRIES.' + kind + '.column before creating the ' + spec.title + ' registry.');
  }
  sheet.getRange(1, col).setValue(spec.title).setFontWeight('bold');
  sheet.getRange(2, col, 1, spec.headers.length).setValues([spec.headers]).setFontWeight('bold');
}

/** @return {{id: string, name: string, row: number}[]} */
function readRegistry(kind) {
  var spec = CONFIG.REGISTRIES[kind];
  var sheet = getMasterSheet_();
  var last = sheet.getLastRow();
  if (last < REGISTRY_FIRST_DATA_ROW) return [];
  var values = sheet.getRange(REGISTRY_FIRST_DATA_ROW, columnLetterToIndex(spec.column),
    last - REGISTRY_FIRST_DATA_ROW + 1, 2).getValues();
  var out = [];
  values.forEach(function (v, i) {
    if (v[0] !== '') out.push({ id: String(v[0]), name: String(v[1]), row: REGISTRY_FIRST_DATA_ROW + i });
  });
  return out;
}

/**
 * Returns a lowercase-name -> ID map containing every name, adding missing
 * entries to the registry. extraColumns(name) may supply values for the columns after Name.
 */
function ensureRegistryEntries(kind, names, extraColumns) {
  var spec = CONFIG.REGISTRIES[kind];
  ensureRegistryHeaders_(kind);
  var existing = readRegistry(kind);
  var map = {};
  var maxNum = 0;
  existing.forEach(function (e) {
    map[e.name.toLowerCase()] = e.id;
    var n = parseInt(e.id.replace(spec.idPrefix, ''), 10);
    if (n > maxNum) maxNum = n;
  });

  var toAdd = [];
  names.forEach(function (name) {
    var key = String(name).toLowerCase();
    if (!name || map[key]) return;
    maxNum++;
    var id = spec.idPrefix + ('0000000' + maxNum).slice(-spec.idDigits);
    map[key] = id;
    var row = [id, name];
    var extra = extraColumns ? extraColumns(name) : [];
    for (var i = 2; i < spec.headers.length; i++) row.push(extra[i - 2] !== undefined ? extra[i - 2] : '');
    toAdd.push(row);
  });

  if (toAdd.length) {
    var sheet = getMasterSheet_();
    var col = columnLetterToIndex(spec.column);
    var lastUsed = existing.length ? existing[existing.length - 1].row : REGISTRY_FIRST_DATA_ROW - 1;
    sheet.getRange(lastUsed + 1, col, toAdd.length, spec.headers.length).setValues(toAdd);
  }
  return map;
}

/** Full registry rows as objects keyed by header, plus _row (sheet row). */
function readRegistryRows(kind) {
  var spec = CONFIG.REGISTRIES[kind];
  var sheet = getMasterSheet_();
  var last = sheet.getLastRow();
  if (last < REGISTRY_FIRST_DATA_ROW) return [];
  var values = sheet.getRange(REGISTRY_FIRST_DATA_ROW, columnLetterToIndex(spec.column),
    last - REGISTRY_FIRST_DATA_ROW + 1, spec.headers.length).getValues();
  var out = [];
  values.forEach(function (v, i) {
    if (v[0] === '') return;
    var row = { _row: REGISTRY_FIRST_DATA_ROW + i };
    spec.headers.forEach(function (h, j) { row[h] = v[j]; });
    out.push(row);
  });
  return out;
}

/** Sets one column of a registry entry, found by ID. */
function updateRegistryValue(kind, id, header, value) {
  var spec = CONFIG.REGISTRIES[kind];
  var colOffset = spec.headers.indexOf(header);
  if (colOffset < 0) throw new Error('Unknown registry column ' + header);
  var entry = readRegistryRows(kind).filter(function (r) { return String(r[spec.headers[0]]) === String(id); })[0];
  if (!entry) throw new Error('No ' + kind + ' entry ' + id);
  getMasterSheet_().getRange(entry._row, columnLetterToIndex(spec.column) + colOffset).setValue(value);
}

/** Registry name column as an A1 range for dropdowns, e.g. "Master!H3:H". */
function registryNameRangeA1(kind) {
  var spec = CONFIG.REGISTRIES[kind];
  var nameCol = columnIndexToLetter(columnLetterToIndex(spec.column) + 1);
  return nameCol + REGISTRY_FIRST_DATA_ROW + ':' + nameCol;
}

function columnIndexToLetter(index) {
  var s = '';
  while (index > 0) { var r = (index - 1) % 26; s = String.fromCharCode(65 + r) + s; index = Math.floor((index - 1) / 26); }
  return s;
}
