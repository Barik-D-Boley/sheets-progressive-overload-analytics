/**
 * Set-cell formats.
 *
 * Quarter tabs store each working set in one cell:
 *   <load>x<reps>[ a<assisted>][ p<partial>][ @<rir>][ @rpe<rpe>]
 *   e.g. "205x8", "-70x7.5", "2*45+25x10 a1", "185x6 p2 @1"
 * The load is kept exactly as written (plate notation such as "2*45+25" is
 * the number of plates and is preserved); loadValue is the evaluated total.
 */

var LOAD_EXPR_RE = /^-?\d+(?:\.\d+)?(?:[*+]\d+(?:\.\d+)?)*$/;
var NUM = '\\d+(?:\\.\\d+)?';

/** Evaluates a load expression ("205", "-70", "2*45+25"); null if invalid. */
function evalLoadExpr(expr) {
  var s = String(expr).replace(/\s+/g, '');
  if (!LOAD_EXPR_RE.test(s)) return null;
  var negative = s.charAt(0) === '-';
  if (negative) s = s.slice(1);
  var total = s.split('+').reduce(function (sum, term) {
    return sum + term.split('*').reduce(function (product, f) { return product * parseFloat(f); }, 1);
  }, 0);
  total = Math.round(total * 1000) / 1000;
  return negative ? -total : total;
}

function formatSetCell(set) {
  var out = String(set.load).replace(/\s+/g, '') + 'x' + set.reps;
  if (set.assisted) out += ' a' + set.assisted;
  if (set.partial) out += ' p' + set.partial;
  if (set.rir !== null && set.rir !== undefined && set.rir !== '') out += ' @' + set.rir;
  if (set.rpe !== null && set.rpe !== undefined && set.rpe !== '') out += ' @rpe' + set.rpe;
  return out;
}

var SET_CELL_RE = new RegExp('^(\\S+?)x(' + NUM + ')((?:\\s+(?:a' + NUM + '|p' + NUM + '|@rpe' + NUM + '|@' + NUM + '))*)\\s*$', 'i');

/** Parses a packed set cell; returns null when blank or not in the packed format. */
function parseSetCell(text) {
  var raw = String(text === null || text === undefined ? '' : text).trim();
  if (!raw) return null;
  var m = raw.match(SET_CELL_RE);
  if (!m) return null;
  var loadValue = evalLoadExpr(m[1]);
  if (loadValue === null) return null;
  var set = { load: m[1], loadValue: loadValue, reps: parseFloat(m[2]), assisted: 0, partial: 0, rir: null, rpe: null };
  m[3].trim().split(/\s+/).filter(String).forEach(function (token) {
    var t = token.toLowerCase();
    if (t.indexOf('@rpe') === 0) set.rpe = parseFloat(t.slice(4));
    else if (t.charAt(0) === '@') set.rir = parseFloat(t.slice(1));
    else if (t.charAt(0) === 'a') set.assisted = parseFloat(t.slice(1));
    else if (t.charAt(0) === 'p') set.partial = parseFloat(t.slice(1));
  });
  return set;
}

var LEGACY_SET_RE = /^(-?[\d.*+\s]+?)\s+for\s+(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?$/i;

/**
 * Parses a legacy "<load> for <reps>[+<assisted>]" cell.
 * Returns {set} on success or {flag} describing why it could not be parsed.
 */
function parseLegacySetCell(text) {
  var raw = String(text).trim();
  var m = raw.match(LEGACY_SET_RE);
  if (m) {
    var load = m[1].replace(/\s+/g, '');
    var loadValue = evalLoadExpr(load);
    if (loadValue !== null) {
      return { set: { load: load, loadValue: loadValue, reps: parseFloat(m[2]),
        assisted: m[3] ? parseFloat(m[3]) : 0, partial: 0, rir: null, rpe: null } };
    }
  }
  return { flag: 'Unrecognized set "' + raw + '"' };
}

/** Parses legacy cardio cells ("30 min", "3 mph", "7 speed", "1.5 miles", "42 floors"). */
function parseLegacyCardioCells(cells) {
  var out = { durationMin: null, speed: null, speedUnit: '', distance: null, distanceUnit: '', flags: [] };
  cells.forEach(function (cell) {
    var raw = String(cell).trim();
    var s = raw.toLowerCase();
    if (!s) return;
    var m;
    if ((m = s.match(/^(?:(\d+(?:\.\d+)?)\s*hours?)?\s*(?:(\d+(?:\.\d+)?)\s*min)?$/)) && (m[1] || m[2])) {
      out.durationMin = parseFloat(m[1] || 0) * 60 + parseFloat(m[2] || 0);
    } else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(mph|kph|km\/h|speed)$/))) {
      out.speed = parseFloat(m[1]);
      out.speedUnit = m[2] === 'speed' ? 'level' : (m[2] === 'km/h' ? 'kph' : m[2]);
    } else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(miles?|mi|km|floors?)$/))) {
      out.distance = parseFloat(m[1]);
      out.distanceUnit = /^mi/.test(m[2]) ? 'mi' : (/^floor/.test(m[2]) ? 'floors' : m[2]);
    } else {
      out.flags.push('Unrecognized cardio value "' + raw + '"');
    }
  });
  return out;
}
