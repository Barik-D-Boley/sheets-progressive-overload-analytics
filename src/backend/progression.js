/**
 * Goal recommendations (approved draft rules in FEATURES.md).
 *
 * history: sessions for one exercise, most recent first:
 *   [{ sets: [{ loadValue, reps, rir }] }]
 * Returns one goal per set: { load, reps } or null when there is no history,
 * plus a reason for display.
 */
var RIR_OPTIONS = ['0', '1-2', '3-4', '5+'];

/**
 * Google Sheets turns "1-2" and "3-4" into dates (Jan 2, Mar 4). Converts such a
 * date back to the RIR text; anything else is returned as trimmed text.
 */
function normalizeRir(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return (value.getMonth() + 1) + '-' + value.getDate();
  }
  return String(value === null || value === undefined ? '' : value).trim();
}

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

/**
 * @param settings Master settings (readSettings_)
 * @param exerciseIncrement the exercise's Increment column ('' = the Load increment setting)
 * @param range {name, min, max, targetRir} from findRepRange_ (defaults to 8-12 @ 1-2)
 * @param topSet the exercise's Top Set box
 */
function progressionSettings(settings, exerciseIncrement, range, topSet) {
  range = range || { name: 'Bodybuilding', min: 8, max: 12, targetRir: '1-2' };
  var pct = parsePercentRange_(settings['top set range']);
  var week = WEEK_DAYS.map(function (d) { return d.toLowerCase(); })
    .indexOf(String(settings['start of week'] || 'Monday').trim().toLowerCase());
  return {
    rangeName: range.name,
    repMin: range.min || 8, repMax: Math.max(range.max || 12, range.min || 8),
    targetRir: normalizeRir(range.targetRir) || '1-2',
    increment: parseFloat(exerciseIncrement) || parseFloat(settings['load increment']) || 5,
    stall: parseInt(settings['stall threshold (sessions)'], 10) || 3,
    formula: settings['1rm formula'] || 'Epley',
    topSet: topSet === true,
    topPctMin: pct[0], topPctMax: pct[1],
    weekStart: week >= 0 ? week : 1,
  };
}

/** "90-93%" -> [0.90, 0.93]; "90%" -> [0.9, 0.9]; anything else -> [0.90, 0.93]. */
function parsePercentRange_(text) {
  var nums = String(text === null || text === undefined ? '' : text).match(/\d+(?:\.\d+)?/g);
  if (typeof text === 'number') nums = [String(text <= 1 ? text * 100 : text)];
  if (!nums || !nums.length) return [0.9, 0.93];
  var a = parseFloat(nums[0]) / 100, b = parseFloat(nums[nums.length > 1 ? 1 : 0]) / 100;
  if (!(a > 0) || !(b > 0) || a > 1.2 || b > 1.2) return [0.9, 0.93];
  return [Math.min(a, b), Math.max(a, b)];
}

/** 'YYYY-MM-DD' of the first day of the week containing iso (weekStart: 0 = Sunday ... 6 = Saturday). */
function weekStartIso_(iso, weekStart) {
  var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  var back = (d.getUTCDay() - weekStart + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
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

/**
 * Top-set load and reps: the heaviest multiple of `increment` within
 * [pctMin, pctMax] of the 1RM (else the step nearest the middle of the range), and
 * the most reps that load allows by the 1RM formula (at least 1).
 */
function topSetGoal(oneRm, ps) {
  if (!(oneRm > 0)) return null;
  var lo = oneRm * ps.topPctMin, hi = oneRm * ps.topPctMax;
  var step = ps.increment;
  var load = Math.floor(hi / step + 1e-9) * step;
  if (load < lo - 1e-9) load = Math.round(((lo + hi) / 2) / step) * step;
  load = Math.round(load * 100) / 100;
  if (!(load > 0)) return null;
  var reps = 1;
  for (var r = 2; r <= CONFIG.ONE_RM_REP_CAP; r++) {
    if (estimateOneRepMax(load, r, ps.formula) <= oneRm + 1e-9) reps = r; else break;
  }
  return { load: load, reps: reps, top: true };
}

/**
 * True when session i (sessions newest first) had a top set: a Top Set exercise, the
 * first session of its week, and set 1 heavier than set 2 (so sessions logged before
 * Top Set was ticked are not mistaken for one).
 */
function wasTopSession_(sessions, i, ps) {
  var sets = sessions[i].sets;
  if (!ps.topSet || !sessions[i].date || sets.length < 2 || !(sets[0].loadValue > sets[1].loadValue)) return false;
  var week = weekStartIso_(sessions[i].date, ps.weekStart);
  for (var j = i + 1; j < sessions.length; j++) {
    if (sessions[j].date && sessions[j].date >= week && sessions[j].date <= sessions[i].date) return false;
  }
  return true;
}

/**
 * opts.date: the workout date ('YYYY-MM-DD'); with ps.topSet, set 1 is the week's top
 * set when no earlier session falls in the same week.
 * @return {{goals: ({load: number, reps: number, top?: boolean}|null)[], reason: string}}
 */
function computeGoals(history, setCount, ps, opts) {
  opts = opts || {};
  var goals = [];
  var sessions = history.filter(function (s) { return s.sets.length; });
  if (!sessions.length) {
    for (var n = 0; n < setCount; n++) goals.push(null);
    return { goals: goals, reason: 'No history yet' };
  }

  // Weekly top set: first session of the week (Top Set exercises), heavy single set 1.
  var top = null, topNote = '';
  if (ps.topSet && opts.date && setCount > 1) {
    var week = weekStartIso_(opts.date, ps.weekStart);
    var thisWeek = sessions.some(function (s) { return s.date && s.date >= week && s.date <= opts.date; });
    if (!thisWeek) {
      var best = bestOneRepMax_(sessions.slice(0, 5), ps.formula);
      top = topSetGoal(best, ps);
      if (top) {
        topNote = 'Set 1: top set ' + Math.round(ps.topPctMin * 100) +
          (ps.topPctMax > ps.topPctMin ? '-' + Math.round(ps.topPctMax * 100) : '') + '% of 1RM ' + formatOneRepMax(best);
      }
    }
  }
  var working = top ? setCount - 1 : setCount;
  var offset = top ? 1 : 0;
  var withTop = function (res) {
    if (top) { res.goals.unshift(top); res.reason = topNote + ' · ' + res.reason; }
    return res;
  };

  // Last session's working sets (a top set from last week's first session is left out).
  var last = sessions[0].sets;
  if (wasTopSession_(sessions, 0, ps) && last.length > 1) last = last.slice(1);
  var lastFor = function (i) { return last[Math.min(i, last.length - 1)]; };

  // Stall: no estimated-1RM gain over the last `stall` sessions -> 10% reset.
  if (sessions.length > ps.stall) {
    var recent = bestOneRepMax_(sessions.slice(0, ps.stall), ps.formula);
    var before = bestOneRepMax_(sessions.slice(ps.stall), ps.formula);
    if (recent > 0 && recent <= before) {
      for (var a = 0; a < working; a++) {
        goals.push({ load: roundTo_(lastFor(a).loadValue * 0.9, ps.increment), reps: ps.repMin });
      }
      return withTop({ goals: goals, reason: 'Stalled ' + ps.stall + ' sessions: reset 10%' });
    }
  }

  // Double progression: every working set at the top of the range (RIR at or above target) -> add load.
  var targetLow = rirLow(ps.targetRir);
  var allTop = last.every(function (s) {
    var r = rirLow(s.rir);
    return s.reps >= ps.repMax && (r === null || targetLow === null || r >= targetLow);
  });
  if (allTop) {
    for (var c = 0; c < working; c++) goals.push({ load: lastFor(c).loadValue + ps.increment, reps: ps.repMin });
    return withTop({ goals: goals, reason: 'Hit ' + ps.repMax + ' reps: +' + ps.increment });
  }
  var weakest = 0;
  for (var d = 0; d < working; d++) {
    goals.push({ load: lastFor(d).loadValue, reps: Math.min(lastFor(d).reps, ps.repMax) });
    if (goals[d].reps < goals[weakest].reps) weakest = d;
  }
  goals[weakest].reps = Math.min(ps.repMax, Math.floor(goals[weakest].reps) + 1);
  return withTop({ goals: goals, reason: '+1 rep on set ' + (weakest + 1 + offset) });
}

function formatGoal(goal) {
  return goal ? goal.load + 'x' + goal.reps + (goal.top ? ' (top)' : '') : '';
}
