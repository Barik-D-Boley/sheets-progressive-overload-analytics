/**
 * Estimated one-rep max. Reps above CONFIG.ONE_RM_REP_CAP are treated as the
 * cap; zero/negative (assisted) loads and zero reps estimate 0. Only solo reps
 * count (assisted and partial reps are ignored).
 */
var ONE_RM_FORMULAS = {
  'Epley': function (w, r) { return r === 1 ? w : w * (1 + r / 30); },
  'Brzycki': function (w, r) { return w * 36 / (37 - r); },
  'Lombardi': function (w, r) { return w * Math.pow(r, 0.10); },
  'Mayhew': function (w, r) { return 100 * w / (52.2 + 41.9 * Math.exp(-0.055 * r)); },
  "O'Conner": function (w, r) { return w * (1 + 0.025 * r); },
  'Wathan': function (w, r) { return 100 * w / (48.8 + 53.8 * Math.exp(-0.075 * r)); },
  'Lander': function (w, r) { return 100 * w / (101.3 - 2.67123 * r); },
};

function estimateOneRepMax(load, reps, formulaName) {
  if (!(load > 0) || !(reps > 0)) return 0;
  var formula = ONE_RM_FORMULAS[formulaName || 'Epley'];
  if (!formula) throw new Error('Unknown 1RM formula: ' + formulaName);
  return formula(load, Math.min(reps, CONFIG.ONE_RM_REP_CAP));
}

/** One decimal place under 100, whole numbers at or above 100. */
function formatOneRepMax(value) {
  return value < 100 ? Math.round(value * 10) / 10 : Math.round(value);
}
