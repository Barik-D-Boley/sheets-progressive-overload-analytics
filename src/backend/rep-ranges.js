/**
 * Named rep ranges (Master table CONFIG.REP_RANGES): Rep Range | Min Reps | Max Reps |
 * Target RIR | Built-in. Bodybuilding and Powerlifting are built in and locked; the
 * user adds their own. The "Default rep range" setting picks one for every exercise;
 * an exercise's own Rep Range column overrides it.
 */
var REP_RANGE_BUILTINS = [
  { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2', builtIn: true },
  { name: 'Powerlifting', min: 3, max: 6, targetRir: '1-2', builtIn: true },
];

/** Settings replaced by the rep-range table (removed from Master once migrated). */
var OLD_REP_SETTINGS = ['Rep range', 'Custom rep min', 'Custom rep max', 'Target RIR', 'Strength goal'];

function repRangeRowValues_(r) {
  return [r.name, r.min, r.max, r.targetRir, r.builtIn === true];
}

/** Creates the table (built-ins), and moves the old Rep range / Custom / Target RIR settings into it. */
function ensureRepRangesTable_() {
  var spec = CONFIG.REP_RANGES;
  var master = getMasterSheet_();
  var col = columnLetterToIndex(spec.column);
  var width = spec.headers.length;
  var top = master.getRange(1, col, 2, width).getValues();
  if (top[1][0] !== spec.headers[0]) {
    if (top[0].concat(top[1]).some(function (v) { return v !== '' && v !== spec.title; })) {
      throw new Error('Master ' + spec.column + '1 already has other content; change CONFIG.REP_RANGES.column.');
    }
    master.getRange(1, col).setValue(spec.title).setFontWeight('bold');
    master.getRange(2, col, 1, width).setValues([spec.headers]).setFontWeight('bold');
  }
  var ranges = readRepRangeRows_(master);
  var have = {};
  ranges.forEach(function (r) { have[r.name.toLowerCase()] = r; });
  REP_RANGE_BUILTINS.forEach(function (b) {
    if (!have[b.name.toLowerCase()]) { ranges.push(b); have[b.name.toLowerCase()] = b; }
    else have[b.name.toLowerCase()].builtIn = true;
  });

  // Old settings: "Rep range" (Bodybuilding/Powerlifting/Custom), Custom rep min/max, Target RIR, Strength goal.
  var old = readOldRepSettings_(master);
  var moved = false;
  if (old.present) {
    var targetRir = normalizeRir(old.values['target rir']) || '1-2';
    if (old.values['custom rep min'] !== undefined || old.values['custom rep max'] !== undefined) {
      if (!have.custom) {
        var custom = { name: 'Custom', min: parseInt(old.values['custom rep min'], 10) || 8,
          max: parseInt(old.values['custom rep max'], 10) || 12, targetRir: targetRir, builtIn: false };
        ranges.push(custom);
        have.custom = custom;
      }
    }
    var mode = String(old.values['rep range'] || '').trim().toLowerCase();
    var current = have[mode] ? have[mode].name : 'Bodybuilding';
    // A non-default Target RIR used to apply to the built-ins too; keep it on the chosen range.
    if (have[mode] && !have[mode].builtIn) have[mode].targetRir = targetRir;
    setMasterSetting_('Default rep range', current, true);
    if (old.values['strength goal'] !== undefined && String(old.values['strength goal']).trim()) {
      setMasterSetting_('Top set range', String(old.values['strength goal']).trim(), true);
    }
    old.rows.forEach(function (row) { master.getRange(row, 1, 1, 3).clearContent(); });
    moved = true;
  }
  writeRepRangeRows_(master, ranges);
  return moved;
}

function readOldRepSettings_(master) {
  var values = master.getRange(1, 1, SETTINGS_MAX_ROWS, 2).getValues();
  var wanted = {};
  OLD_REP_SETTINGS.forEach(function (l) { wanted[l.toLowerCase()] = true; });
  var out = { present: false, values: {}, rows: [] };
  values.forEach(function (r, i) {
    var label = String(r[0]).trim().toLowerCase();
    if (!wanted[label]) return;
    out.present = true;
    out.values[label] = r[1];
    out.rows.push(i + 1);
  });
  return out;
}

function readRepRangeRows_(master) {
  var col = columnLetterToIndex(CONFIG.REP_RANGES.column);
  var last = master.getLastRow();
  if (last < 3) return [];
  return master.getRange(3, col, last - 2, CONFIG.REP_RANGES.headers.length).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return { name: String(r[0]).trim(), min: parseInt(r[1], 10) || 0, max: parseInt(r[2], 10) || 0,
        targetRir: normalizeRir(r[3]) || '1-2', builtIn: r[4] === true };
    });
}

function writeRepRangeRows_(master, ranges) {
  var col = columnLetterToIndex(CONFIG.REP_RANGES.column);
  var width = CONFIG.REP_RANGES.headers.length;
  var existing = Math.max(master.getLastRow() - 2, 0);
  var height = Math.max(existing, ranges.length);
  if (!height) return;
  var rows = [];
  for (var i = 0; i < height; i++) rows.push(ranges[i] ? repRangeRowValues_(ranges[i]) : ['', '', '', '', '']);
  master.getRange(3, col + 3, height, 1).setNumberFormat('@'); // Target RIR "1-2" stays text
  master.getRange(3, col, height, width).setValues(rows);
  if (ranges.length) master.getRange(3, col + 4, ranges.length, 1).insertCheckboxes();
}

/** All rep ranges (built-ins first if the table is missing). */
function readRepRanges_() {
  var master = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.MASTER);
  if (!master) return REP_RANGE_BUILTINS.slice();
  var col = columnLetterToIndex(CONFIG.REP_RANGES.column);
  if (master.getRange(2, col).getValue() !== CONFIG.REP_RANGES.headers[0]) {
    ensureRepRangesTable_();
  }
  var rows = readRepRangeRows_(master);
  return rows.length ? rows : REP_RANGE_BUILTINS.slice();
}

/** The range named `name` (case-insensitive), else the default setting's, else Bodybuilding. */
function findRepRange_(ranges, name, settings) {
  var pick = function (n) {
    n = String(n || '').trim().toLowerCase();
    return n ? ranges.filter(function (r) { return r.name.toLowerCase() === n; })[0] : null;
  };
  return pick(name) || pick(settings && settings['default rep range']) || pick('Bodybuilding') || REP_RANGE_BUILTINS[0];
}

function validateRepRange_(r) {
  var name = String(r.name || '').trim();
  if (!name) throw new Error('The rep range needs a name.');
  var min = parseInt(r.min, 10), max = parseInt(r.max, 10);
  if (!(min > 0) || !(max > 0)) throw new Error('Min and max reps must be whole numbers above 0.');
  if (min > max) throw new Error('Min reps cannot be more than max reps.');
  var rir = normalizeRir(r.targetRir);
  if (RIR_OPTIONS.indexOf(rir) < 0) throw new Error('Pick a target RIR from the list.');
  return { name: name, min: min, max: max, targetRir: rir, builtIn: false };
}

/**
 * Adds or edits a custom range (r.originalName = the name being edited). A rename
 * updates exercises that use it and the default setting. Built-ins cannot change.
 */
function saveRepRange_(r) {
  var range = validateRepRange_(r);
  var master = getMasterSheet_();
  var ranges = readRepRanges_();
  var original = String(r.originalName || '').trim().toLowerCase();
  var existing = original ? ranges.filter(function (x) { return x.name.toLowerCase() === original; })[0] : null;
  if (existing && existing.builtIn) throw new Error(existing.name + ' is built in and cannot be changed.');
  if (ranges.some(function (x) { return x !== existing && x.name.toLowerCase() === range.name.toLowerCase(); })) {
    throw new Error('A rep range named "' + range.name + '" already exists.');
  }
  if (existing) ranges[ranges.indexOf(existing)] = range;
  else ranges.push(range);
  writeRepRangeRows_(master, ranges);
  if (existing && existing.name !== range.name) renameRepRangeUses_(existing.name, range.name);
  return readRepRanges_();
}

/** Deletes a custom range; exercises using it (and the default) fall back to Bodybuilding / the default. */
function deleteRepRange_(name) {
  var master = getMasterSheet_();
  var ranges = readRepRanges_();
  var target = ranges.filter(function (x) { return x.name.toLowerCase() === String(name || '').trim().toLowerCase(); })[0];
  if (!target) throw new Error('Unknown rep range "' + name + '".');
  if (target.builtIn) throw new Error(target.name + ' is built in and cannot be deleted.');
  writeRepRangeRows_(master, ranges.filter(function (x) { return x !== target; }));
  renameRepRangeUses_(target.name, '');
  return readRepRanges_();
}

function renameRepRangeUses_(oldName, newName) {
  var spec = CONFIG.REGISTRIES.exercises;
  var master = getMasterSheet_();
  var col = columnLetterToIndex(spec.column) + spec.headers.indexOf('Rep Range');
  readRegistryRows('exercises').forEach(function (r) {
    if (String(r['Rep Range']).trim().toLowerCase() === oldName.toLowerCase()) master.getRange(r._row, col).setValue(newName);
  });
  var settings = readSettings_();
  if (String(settings['default rep range']).trim().toLowerCase() === oldName.toLowerCase()) {
    setMasterSetting_('Default rep range', newName || 'Bodybuilding', true);
  }
  applyRepRangeDropdown_();
}

/** Exercise "Rep Range" column: dropdown of range names (blank = the default). */
function applyRepRangeDropdown_() {
  var spec = CONFIG.REGISTRIES.exercises;
  var master = getMasterSheet_();
  var rows = readRegistryRows('exercises');
  if (!rows.length) return;
  var names = readRepRangeRows_(master).map(function (r) { return r.name; });
  if (!names.length) return;
  var col = columnLetterToIndex(spec.column) + spec.headers.indexOf('Rep Range');
  master.getRange(REGISTRY_FIRST_DATA_ROW, col, rows[rows.length - 1]._row - REGISTRY_FIRST_DATA_ROW + 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true).build());
}
