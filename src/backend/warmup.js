/**
 * Warm-up ladder for exercises with Warm-up checked in the registry.
 * Uses standard plate jumps below the working weight, heaviest first, with
 * reps 1, 2, 4, 6, 8 ... and skips any step within `skipWithin` of the working weight.
 * e.g. 275 lb -> 45x8, 95x6, 135x4, 185x2, 225x1 (returned lightest first)
 */
var WARMUP_DEFAULTS = {
  ladders: {
    lb: [45, 95, 135, 185, 225, 275, 315, 365, 405, 455, 495, 545, 585, 635, 675],
    kg: [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300],
  },
  reps: [1, 2, 4, 6, 8, 10, 12],
  skipWithin: 0.10,
};

function warmupLadder(workingLoad, unit, cfg) {
  cfg = cfg || WARMUP_DEFAULTS;
  if (!(workingLoad > 0)) return [];
  var limit = workingLoad * (1 - cfg.skipWithin);
  var steps = (cfg.ladders[unit] || cfg.ladders.lb).filter(function (w) { return w <= limit; }).reverse();
  return steps.map(function (load, i) {
    var reps = i < cfg.reps.length ? cfg.reps[i] : cfg.reps[cfg.reps.length - 1] + 2 * (i - cfg.reps.length + 1);
    return { load: load, reps: reps };
  }).reverse(); // lightest first, in the order you do them
}

function formatWarmup(ladder) {
  return ladder.map(function (s) { return s.load + '×' + s.reps; }).join(' · ');
}
