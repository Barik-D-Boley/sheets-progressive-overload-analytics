/**
 * "Compiled Data": a read-only, readable view of every quarter tab.
 * One row per exercise per day, newest first, loads converted to the Master
 * unit (display only). Rebuilt on Finish workout, from the menu, nightly, and
 * whenever a filter at the top changes. Corrections go in the quarter tabs.
 */
var COMPILED = {
  FIRST_DATA_ROW: 4, HEADER_ROW: 3, STATUS: 'A2',
  TIMEFRAME: 'B1', GYM: 'D1', WORKOUT: 'F1', SEARCH: 'H1', CLEAR_BTN: 'K1',
  ALL_TIME: 'All time', ALL_GYMS: 'All gyms', ALL_WORKOUTS: 'All workouts',
  TIMEFRAMES: ['All time', 'This month', 'Last 3 months', 'This year'],
};
var LB_PER_KG = 2.20462262;

function convertLoad_(value, fromUnit, toUnit) {
  if (fromUnit === toUnit || !fromUnit) return value;
  return toUnit === 'kg' ? value / LB_PER_KG : value * LB_PER_KG;
}

function roundLoad_(value) { return Math.round(value * 2) / 2; }

/** "205 × 8 · +1 assisted · +2 partial · RIR 1-2"; unparseable text is shown with a warning sign. */
function readableSet_(cell, fromUnit, toUnit) {
  var raw = String(cell === null || cell === undefined ? '' : cell).trim();
  if (!raw) return { text: '', set: null };
  var set = parseSetCell(raw);
  if (!set) return { text: '⚠ ' + raw, set: null };
  var load = roundLoad_(convertLoad_(set.loadValue, fromUnit, toUnit));
  var parts = [load + ' × ' + set.reps];
  if (set.assisted) parts.push('+' + set.assisted + ' assisted');
  if (set.partial) parts.push('+' + set.partial + ' partial');
  if (set.rir !== null && set.rir !== '') parts.push('RIR ' + set.rir);
  if (set.rpe !== null && set.rpe !== '') parts.push('RPE ' + set.rpe);
  return { text: parts.join(' · '), set: set, load: load };
}

/** Start date (inclusive, 'YYYY-MM-DD') and end date for a time-frame choice. */
function timeframeRange_(choice, todayIso) {
  var y = parseInt(todayIso.slice(0, 4), 10), m = parseInt(todayIso.slice(5, 7), 10);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var q = String(choice || '').match(/^Q([1-4]) (\d{4})$/);
  if (q) {
    var startMonth = (parseInt(q[1], 10) - 1) * 3 + 1;
    return { from: q[2] + '-' + pad(startMonth) + '-01', to: q[2] + '-' + pad(startMonth + 2) + '-31' };
  }
  if (choice === 'This month') return { from: y + '-' + pad(m) + '-01', to: '9999' };
  if (choice === 'Last 3 months') {
    var mm = m - 2, yy = y;
    if (mm < 1) { mm += 12; yy--; }
    return { from: yy + '-' + pad(mm) + '-01', to: '9999' };
  }
  if (choice === 'This year') return { from: y + '-01-01', to: '9999' };
  return { from: '0000', to: '9999' };
}

/**
 * Pure compile step.
 * @param {Object[]} records {tab, date (iso), gymId, workoutId, exerciseId, unit, notes, sets: string[]}
 * @param {{exercises, gyms, workouts}} names id -> name maps
 * @param {{unit, formula, setCount}} opts
 * @param {{timeframe, gym, workout, search}} filters
 */
function compileRecords(records, names, opts, filters, todayIso) {
  var range = timeframeRange_(filters.timeframe, todayIso);
  var search = String(filters.search || '').trim().toLowerCase();
  var gymFilter = filters.gym && filters.gym !== COMPILED.ALL_GYMS ? filters.gym : '';
  var workoutFilter = filters.workout && filters.workout !== COMPILED.ALL_WORKOUTS ? filters.workout : '';
  var setCount = Math.max(opts.setCount, records.reduce(function (n, r) { return Math.max(n, r.sets.filter(String).length); }, 0));

  var rows = [];
  records.forEach(function (r) {
    if (r.date < range.from || r.date > range.to) return;
    var exercise = names.exercises[r.exerciseId] || r.exerciseId;
    var gym = names.gyms[r.gymId] || r.gymId;
    var workout = names.workouts[r.workoutId] || r.workoutId;
    if (gymFilter && gym !== gymFilter) return;
    if (workoutFilter && workout !== workoutFilter) return;
    if (search && exercise.toLowerCase().indexOf(search) < 0) return;

    var setTexts = [], oneRms = [], best = 0;
    for (var i = 0; i < setCount; i++) {
      var rs = readableSet_(r.sets[i], r.unit, opts.unit);
      setTexts.push(rs.text);
      if (rs.set) {
        var orm = formatOneRepMax(estimateOneRepMax(rs.load, rs.set.reps, opts.formula));
        oneRms.push(orm);
        best = Math.max(best, orm);
      } else {
        oneRms.push('');
      }
    }
    rows.push({ date: r.date, exercise: exercise, best: best,
      values: [r.tab, r.date, gym, workout, exercise].concat(setTexts, oneRms, [best || '', r.notes || '']) });
  });
  rows.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  var headers = ['Quarter', 'Date', 'Gym', 'Workout', 'Exercise'];
  for (var s = 1; s <= setCount; s++) headers.push('Set ' + s);
  for (var t = 1; t <= setCount; t++) headers.push('1RM (Set ' + t + ')');
  headers.push('Best 1RM', 'Notes');

  return { headers: headers, rows: rows, total: records.length, panel: exercisePanel_(rows, opts.unit) };
}

/** Stats when the filtered rows contain exactly one exercise. */
function exercisePanel_(rows, unit) {
  var distinct = {};
  rows.forEach(function (r) { distinct[r.exercise] = true; });
  var list = Object.keys(distinct);
  if (list.length !== 1) {
    return [['Exercise data', list.length ? 'Search for one exercise to see its stats' : 'No matching rows']];
  }
  var byDate = rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var best = rows.reduce(function (m, r) { return Math.max(m, r.best); }, 0);
  var first = byDate[0], last = byDate[byDate.length - 1];
  var gain = '';
  if (byDate.length > 1 && first.best > 0) {
    var diff = formatOneRepMax(last.best - first.best);
    gain = (diff >= 0 ? '+' : '') + diff + ' ' + unit + ' (' + (diff >= 0 ? '+' : '') +
      Math.round((last.best - first.best) / first.best * 100) + '%)';
  } else if (byDate.length > 1) {
    gain = 'No 1RM to compare';
  } else {
    gain = 'Only one session';
  }
  return [
    ['Exercise data', list[0]],
    ['Times done', rows.length],
    ['Best 1RM', best ? best + ' ' + unit : '—'],
    ['Last done', last.date],
    ['Strength gain in time frame', gain],
  ];
}
