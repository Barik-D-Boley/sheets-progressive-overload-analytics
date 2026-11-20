/**
 * Goal recommendations (approved draft rules in FEATURES.md).
 *
 * history: sessions for one exercise, most recent first:
 *   [{ sets: [{ loadValue, reps, rir }] }]
 * Returns one goal per set: { load, reps } or null when there is no history,
 * plus a reason for display.
 */
var RIR_OPTIONS = ['0', '1-2', '3-4', '5+'];

/** Lower bound of an RIR value ('1-2' -> 1, '5+' -> 5); null when blank. */
function rirLow(value) {
  if (value === null || value === undefined || value === '') return null;
  var m = String(value).match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function rirHigh(value) {
  if (value === null || value === undefined || value === '') return null;
  var s = String(value);
  if (/\+$/.test(s)) return Infinity;
  var m = s.match(/(\d+(?:\.\d+)?)$/);
  return m ? parseFloat(m[1]) : null;
}

function progressionSettings(settings, exerciseIncrement) {
  var mode = String(settings['rep range'] || 'Bodybuilding').trim().toLowerCase();
  var pct = String(settings['strength goal'] || '90%').match(/(\d+(?:\.\d+)?)/);
  var ps = {
    mode: mode === 'powerlifting' ? 'powerlifting' : (mode === 'custom' ? 'custom' : 'bodybuilding'),
    repMin: 8, repMax: 12,
    targetRir: String(settings['target rir'] || '1-2'),
    increment: parseFloat(exerciseIncrement) || parseFloat(settings['load increment']) || 5,
    stall: parseInt(settings['stall threshold (sessions)'], 10) || 3,
    strengthPct: pct ? parseFloat(pct[1]) / 100 : 0.9,
    formula: settings['1rm formula'] || 'Epley',
  };
  if (ps.mode === 'powerlifting') { ps.repMin = 3; ps.repMax = 6; }
  if (ps.mode === 'custom') {
    ps.repMin = parseInt(settings['custom rep min'], 10) || 8;
    ps.repMax = parseInt(settings['custom rep max'], 10) || 12;
  }
  return ps;
}

function roundTo_(value, step) {
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

function bestOneRepMax_(sessions, formula) {
  var best = 0;
  sessions.forEach(function (s) {
    s.sets.forEach(function (set) { best = Math.max(best, estimateOneRepMax(set.loadValue, set.reps, formula)); });
  });
  return best;
}

/** @return {{goals: ({load: number, reps: number}|null)[], reason: string}} */
function computeGoals(history, setCount, ps) {
  var goals = [];
  var sessions = history.filter(function (s) { return s.sets.length; });
  if (!sessions.length) {
    for (var n = 0; n < setCount; n++) goals.push(null);
    return { goals: goals, reason: 'No history yet' };
  }
  var last = sessions[0].sets;
  var lastFor = function (i) { return last[Math.min(i, last.length - 1)]; };

  // Stall: no estimated-1RM gain over the last `stall` sessions -> 10% reset.
  if (sessions.length > ps.stall) {
    var recent = bestOneRepMax_(sessions.slice(0, ps.stall), ps.formula);
    var before = bestOneRepMax_(sessions.slice(ps.stall), ps.formula);
    if (recent > 0 && recent <= before) {
      for (var a = 0; a < setCount; a++) {
        goals.push({ load: roundTo_(lastFor(a).loadValue * 0.9, ps.increment), reps: ps.repMin });
      }
      return { goals: goals, reason: 'Stalled ' + ps.stall + ' sessions: reset 10%' };
    }
  }

  if (ps.mode === 'powerlifting') {
    var best = bestOneRepMax_(sessions.slice(0, 5), ps.formula);
    var load = roundTo_(best * ps.strengthPct, ps.increment);
    var reps = Math.max(ps.repMin, Math.min(ps.repMax, Math.round(30 * (1 / ps.strengthPct - 1))));
    var easy = last.every(function (s) { var r = rirLow(s.rir); return r !== null && r > rirHigh(ps.targetRir); });
    if (easy) load += ps.increment;
    for (var b = 0; b < setCount; b++) goals.push({ load: load, reps: reps });
    return { goals: goals, reason: easy ? 'Last session was easy: +' + ps.increment : Math.round(ps.strengthPct * 100) + '% of best 1RM' };
  }

  // Double progression (Bodybuilding / Custom).
  var targetLow = rirLow(ps.targetRir);
  var allTop = last.length >= Math.min(setCount, last.length) && last.every(function (s) {
    var r = rirLow(s.rir);
    return s.reps >= ps.repMax && (r === null || targetLow === null || r >= targetLow);
  });
  if (allTop) {
    for (var c = 0; c < setCount; c++) goals.push({ load: lastFor(c).loadValue + ps.increment, reps: ps.repMin });
    return { goals: goals, reason: 'Hit ' + ps.repMax + ' reps: +' + ps.increment };
  }
  var weakest = 0;
  for (var d = 0; d < setCount; d++) {
    goals.push({ load: lastFor(d).loadValue, reps: lastFor(d).reps });
    if (goals[d].reps < goals[weakest].reps) weakest = d;
  }
  goals[weakest].reps = Math.min(ps.repMax, Math.floor(goals[weakest].reps) + 1);
  return { goals: goals, reason: '+1 rep on set ' + (weakest + 1) };
}

function formatGoal(goal) {
  return goal ? goal.load + 'x' + goal.reps : '';
}
