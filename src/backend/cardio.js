/**
 * Cardio helpers: calorie estimates and the one-time merge of "Treadmill (N%)"
 * activities into a single "Treadmill" with an Incline (%) value per session.
 */

/**
 * Estimated calories (kcal) for a cardio session, or null when it can't be estimated.
 * o: {activity, durationMin, speed, speedUnit, inclinePct, distance, distanceUnit, handrails, weightKg}
 *
 * - Treadmill / walk / run: ACSM metabolic equations. Walking (≤ 4 mph):
 *   VO2 = 0.1·S + 1.8·S·G + 3.5; running: VO2 = 0.2·S + 0.9·S·G + 3.5
 *   (S in m/min, G = grade as a fraction, VO2 in ml/kg/min). Downhill grades lower the
 *   cost at one third of the uphill rate, and never below flat-ground walking at half cost.
 * - Stair climber: ACSM stepping equation with 16 steps of 0.2 m per floor.
 * - Holding the handrails: × 0.8 (supporting body weight cuts the work by roughly 20%).
 * - Bikes, rowers, ellipticals: typical MET values.
 * kcal = VO2 × kg × minutes / 1000 × 5.
 */
function estimateCardioCalories(o) {
  var kg = parseFloat(o.weightKg);
  var min = parseFloat(o.durationMin);
  if (!(kg > 0) || !(min > 0)) return null;
  var name = String(o.activity || '').toLowerCase();
  var rails = o.handrails === true || o.handrails === 'TRUE' ? 0.8 : 1;
  var vo2 = null;

  var speed = parseFloat(o.speed);
  var unit = String(o.speedUnit || '').toLowerCase();
  var mPerMin = null;
  if (speed > 0 && unit === 'mph') mPerMin = speed * 26.8224;
  else if (speed > 0 && unit === 'kph') mPerMin = speed * 16.6667;
  if (mPerMin === null) {
    var dist = parseFloat(o.distance), du = String(o.distanceUnit || '').toLowerCase();
    if (dist > 0 && du === 'mi') mPerMin = dist * 1609.344 / min;
    else if (dist > 0 && du === 'km') mPerMin = dist * 1000 / min;
  }

  if (/stair|step ?mill|stepper/.test(name)) {
    var floors = parseFloat(o.distance);
    if (String(o.distanceUnit || '').toLowerCase() === 'floors' && floors > 0) {
      var stepsPerMin = floors * 16 / min;
      vo2 = 0.2 * stepsPerMin + 1.33 * (1.8 * 0.2 * stepsPerMin) + 3.5;
    } else {
      vo2 = 9 * 3.5; // ~9 METs when floors aren't known
    }
  } else if (/treadmill|walk|run|jog|hike/.test(name)) {
    if (mPerMin === null) return null;
    var grade = (parseFloat(o.inclinePct) || 0) / 100;
    var running = mPerMin > 107; // > 4 mph
    var horizontal = (running ? 0.2 : 0.1) * mPerMin;
    var vertical = (running ? 0.9 : 1.8) * mPerMin * grade;
    if (grade < 0) vertical /= 3;
    vo2 = Math.max(horizontal + vertical + 3.5, 0.05 * mPerMin + 3.5);
  } else {
    var mets = /bike|cycl|spin/.test(name) ? 7 : /row/.test(name) ? 7 : /elliptical|arc/.test(name) ? 5 : /swim/.test(name) ? 7 : null;
    if (mets === null) return null;
    vo2 = mets * 3.5;
  }
  return Math.round(vo2 * kg * min / 1000 * 5 * rails);
}

/** Adds the newer Cardio columns (Incline, Handrails) to an existing tab. */
function ensureCardioHeaders_() {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.CARDIO, CONFIG.CARDIO_HEADERS, false);
  var headers = CONFIG.CARDIO_HEADERS;
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('|') !== headers.join('|')) sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  return sheet;
}

/** Bodyweight in kg on a date (the weigh-in in effect then), or null. */
function bodyweightKgOn_(dateIso) {
  var bw = bodyweightOn(dateIso, readBodyweightLog_());
  if (!bw) return null;
  return bw.unit === 'kg' ? bw.weight : bw.weight / 2.20462262;
}

/**
 * One-time merge: "Treadmill (10%)" style activities become "Treadmill" with the
 * incline stored on each session. The old activity names are made inactive.
 */
function mergeTreadmillVariants_() {
  var re = /^treadmill\s*\((-?\d+(?:\.\d+)?)\s*%\)$/i;
  var variants = readRegistryRows('cardio').filter(function (r) { return re.test(String(r['Name']).trim()); });
  if (!variants.length) return 0;
  var plainId = ensureRegistryEntries('cardio', ['Treadmill'], function () { return [true]; })['treadmill'];
  var inclineOf = {};
  variants.forEach(function (r) { inclineOf[String(r['Cardio ID'])] = parseFloat(String(r['Name']).match(re)[1]); });
  var sheet = ensureCardioHeaders_();
  var moved = 0;
  if (sheet.getLastRow() > 1) {
    var width = CONFIG.CARDIO_HEADERS.length;
    var actCol = CONFIG.CARDIO_HEADERS.indexOf('Activity ID'), incCol = CONFIG.CARDIO_HEADERS.indexOf('Incline (%)');
    var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, width);
    var rows = range.getValues().map(function (r) {
      var id = String(r[actCol]);
      if (id in inclineOf) {
        r[actCol] = plainId;
        if (r[incCol] === '' || r[incCol] === null) r[incCol] = inclineOf[id];
        moved++;
      }
      return r;
    });
    if (moved) range.setValues(rows);
  }
  variants.forEach(function (r) { updateRegistryValue('cardio', r['Cardio ID'], 'Active', false); });
  return moved;
}
