/**
 * Reads the grid of "All Data - Unorganized" into exercise entries.
 *
 * The legacy layout has side-by-side blocks (Push, Pull, Legs, Cardio/Abs).
 * Each entry row is: [anchor] [exercise name] [set 1] [set 2] [set 3].
 * The anchor is a date (starts a session), the gym (row after the date), or a
 * session note such as "Deload". Block columns shift partway down the sheet,
 * so blocks are found per row from the cell contents and assigned by column band.
 * Column X holds cardio calories; the header row holds a bodyweight ("165 lbs").
 */

var LEGACY_BLOCK_BANDS = [
  { name: 'Push', maxNameCol: 4 },
  { name: 'Pull', maxNameCol: 10 },
  { name: 'Legs', maxNameCol: 16 },
  { name: 'Cardio/Abs', maxNameCol: 22 },
];
var LEGACY_CALORIES_COL = 23; // column X
var LEGACY_SETS_PER_ENTRY = 3;

var LEGACY_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
var LEGACY_VALUE_RE = /(\bfor\b|^-?[\d.*+()?]+$|\d\s*(min|mph|kph|speed|miles?|mi|km|floors?|cal|sec|hours?)$)/i;

/** 'M/D/YY' -> 'YYYY-MM-DD', or null. */
function parseLegacyDate(text) {
  var m = String(text).trim().match(LEGACY_DATE_RE);
  if (!m) return null;
  var year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  var month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
}

function isLegacyValue(text) { return LEGACY_VALUE_RE.test(String(text).trim()); }

/** Zero-based (row, col) -> A1 reference. */
function a1Ref(rowIndex, colIndex) {
  var col = '', n = colIndex + 1;
  while (n > 0) { var r = (n - 1) % 26; col = String.fromCharCode(65 + r) + col; n = Math.floor((n - 1) / 26); }
  return col + (rowIndex + 1);
}

function legacyBlockForNameCol(col) {
  for (var i = 0; i < LEGACY_BLOCK_BANDS.length; i++) {
    if (col <= LEGACY_BLOCK_BANDS[i].maxNameCol) return LEGACY_BLOCK_BANDS[i].name;
  }
  return null;
}

/**
 * @param {string[][]} grid Display values of the legacy sheet (row 0 = header).
 * @return {{entries: Object[], bodyweights: Object[], flags: Object[]}}
 */
function parseLegacyGrid(grid, options) {
  var today = (options && options.today) || new Date().toISOString().slice(0, 10);
  var entries = [], bodyweights = [], flags = [];
  var sessions = {}; // block -> current session {date, gym, notes, dateRow, dateIssue}

  (grid[0] || []).forEach(function (cell, c) {
    var m = String(cell).trim().match(/^(\d+(?:\.\d+)?)\s*(lbs?|kg)$/i);
    if (m) bodyweights.push({ ref: a1Ref(0, c), weight: parseFloat(m[1]), unit: /^kg/i.test(m[2]) ? 'kg' : 'lb' });
  });

  for (var r = 1; r < grid.length; r++) {
    var row = (grid[r] || []).map(function (v) { return String(v === null || v === undefined ? '' : v).trim(); });
    var rowEntries = [];
    var c = 0;
    var limit = Math.min(row.length, LEGACY_CALORIES_COL);
    while (c < limit) {
      var cell = row[c];
      if (!cell || isLegacyValue(cell)) { c++; continue; }
      var anchorCol = -1, nameCol = c;
      if (parseLegacyDate(cell)) {
        anchorCol = c; nameCol = c + 1;
      } else if (c + 1 < limit && row[c + 1] && !isLegacyValue(row[c + 1]) && !parseLegacyDate(row[c + 1])) {
        anchorCol = c; nameCol = c + 1; // gym or session note followed by an exercise name
      }
      var name = row[nameCol] || '';
      // A lone text cell directly under a block's date cell is that session's gym.
      if (anchorCol < 0 && !row[c + 1]) {
        var underBlock = legacyBlockForNameCol(c + 1);
        var above = underBlock && sessions[underBlock];
        if (above && above.dateRow === r - 1 && above.dateCol === c && !above.gym) {
          above.gym = cell.replace(/\s+/g, ' ');
          c++; continue;
        }
      }
      var block = legacyBlockForNameCol(nameCol);
      if (!block) { c = nameCol + 1; continue; }
      var session = sessions[block];
      if (!name) {
        flags.push({ ref: a1Ref(r, anchorCol), block: block, message: 'Date "' + cell + '" without an exercise name' });
        c = nameCol + 1; continue;
      }
      if (isLegacyValue(name) || parseLegacyDate(name)) {
        flags.push({ ref: a1Ref(r, c), block: block, message: 'Anchor "' + cell + '" without an exercise name' });
        c = nameCol + 1; continue;
      }

      var anchor = anchorCol >= 0 ? row[anchorCol] : '';
      var anchorGym = '';
      var dateAndGym = anchor.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*,\s*(.+)$/); // "5/9/26, Eos"
      if (dateAndGym) { anchor = dateAndGym[1]; anchorGym = dateAndGym[2].trim(); }
      var date = anchor ? parseLegacyDate(anchor) : null;
      if (date) {
        var previous = session ? (session.compareDate || session.date) : null;
        var dateIssue = '';
        if (date > today) dateIssue = 'Date ' + date + ' is in the future';
        else if (previous && date < previous) dateIssue = 'Date ' + date + ' is earlier than the previous ' + block + ' date ' + previous;
        session = sessions[block] = { date: date, gym: anchorGym, notes: [], dateRow: r, dateIssue: dateIssue,
          dateRef: a1Ref(r, anchorCol), dateCol: anchorCol };
        // An out-of-order date should not move the order check for later sessions.
        if (dateIssue && previous) session.compareDate = previous;
      } else if (anchor && session) {
        if (!session.gym && r === session.dateRow + 1) session.gym = anchor.replace(/\s+/g, ' ');
        else session.notes.push(anchor);
      }

      var cells = [];
      for (var k = nameCol + 1; k <= nameCol + LEGACY_SETS_PER_ENTRY && k < limit; k++) {
        if (row[k] && !isLegacyValue(row[k])) break;
        cells.push({ ref: a1Ref(r, k), text: row[k] });
      }
      while (cells.length && !cells[cells.length - 1].text) cells.pop();

      var entry = { ref: a1Ref(r, nameCol), row: r + 1, block: block, legacyName: name,
        session: session || null, cells: cells, calories: null };
      if (!session) flags.push({ ref: entry.ref, block: block, message: 'Exercise before any date in its block' });
      entries.push(entry);
      rowEntries.push(entry);
      c = nameCol + 1 + cells.length;
    }

    var cal = row[LEGACY_CALORIES_COL] || '';
    var calMatch = cal.match(/^(\d+(?:\.\d+)?)\s*cal$/i);
    if (cal) {
      var cardioEntry = rowEntries.filter(function (e) { return e.block === 'Cardio/Abs'; })[0];
      if (calMatch && cardioEntry) cardioEntry.calories = parseFloat(calMatch[1]);
      else flags.push({ ref: a1Ref(r, LEGACY_CALORIES_COL), block: 'Cardio/Abs', message: 'Calories "' + cal + '" without a matching cardio entry' });
    }
  }
  // Resolve session fields last: the gym is written on the row after the date.
  entries.forEach(function (e) {
    var s = e.session;
    e.date = s ? s.date : null;
    e.gym = s ? s.gym : '';
    e.sessionNotes = s ? s.notes.slice() : [];
    e.dateIssue = s && s.dateIssue ? s.dateIssue + ' (' + s.dateRef + ')' : '';
    delete e.session;
  });
  return { entries: entries, bodyweights: bodyweights, flags: flags };
}
