/**
 * Exercise naming format. Everything is driven by a settings object so the
 * format can be changed without editing code; NAMING_DEFAULTS is used when no
 * settings are supplied (Module 2 reads overrides from a table on Master).
 *
 * Default format: "<Movement> (<Equipment>[, <Detail>])"
 *   Bench press (BB) · Tricep pushdowns (Cable, Rope) · Decline press (PL) · Treadmill (15°)
 * Movement is sentence case (first letter capitalized) except listed proper nouns;
 * equipment tags and details are capitalized.
 */
var NAMING_DEFAULTS = {
  template: '{movement} ({details})',   // {details} = equipment tag and detail joined by detailSeparator
  templateNoDetails: '{movement}',      // used when there is no equipment or detail
  detailSeparator: ', ',
  equipmentTags: {
    'Barbell': 'BB',
    'Dumbbell': 'DB',
    'Plate-loaded': 'PL',
    'Cable': 'Cable',
    'Machine': 'Machine',
    'Smith machine': 'Smith',
    'EZ bar': 'EZ',
    'Bodyweight': 'BW',
  },
  properNouns: ['Romanian', 'Bulgarian', 'Nordic', 'Roman', 'EZ', 'T-bar'],
};

function sentenceCase_(text, properNouns) {
  var proper = {};
  (properNouns || []).forEach(function (p) { proper[p.toLowerCase()] = p; });
  var words = String(text).trim().replace(/\s+/g, ' ').toLowerCase().split(' ');
  return words.map(function (w, i) {
    if (proper[w]) return proper[w];
    return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }).join(' ');
}

function capitalizeWords_(text) {
  return String(text).trim().replace(/\s+/g, ' ').split(' ').map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/**
 * @param {{movement: string, equipment?: string, detail?: string}} parts
 *   equipment is an equipment name (a key of equipmentTags) or a tag itself.
 */
function formatExerciseName(parts, settings) {
  var s = settings || NAMING_DEFAULTS;
  var movement = sentenceCase_(parts.movement, s.properNouns);
  var details = [];
  if (parts.equipment) {
    var tag = s.equipmentTags[parts.equipment];
    if (tag === undefined) {
      for (var key in s.equipmentTags) {
        if (key.toLowerCase() === String(parts.equipment).toLowerCase() ||
            s.equipmentTags[key].toLowerCase() === String(parts.equipment).toLowerCase()) { tag = s.equipmentTags[key]; break; }
      }
    }
    if (tag === undefined) throw new Error('Unknown equipment "' + parts.equipment + '"');
    details.push(tag);
  }
  if (parts.detail) details.push(capitalizeWords_(parts.detail));
  var template = details.length ? s.template : s.templateNoDetails;
  return template.replace('{movement}', movement).replace('{details}', details.join(s.detailSeparator));
}

/** Equipment name for a formatted exercise name ("Bench press (BB)" -> "Barbell"), or ''. */
function equipmentFromName(name, settings) {
  var s = settings || NAMING_DEFAULTS;
  var m = String(name).match(/\(([^)]*)\)\s*$/);
  if (!m) return '';
  var tag = m[1].split(s.detailSeparator.trim())[0].trim();
  for (var key in s.equipmentTags) if (s.equipmentTags[key] === tag) return key;
  return '';
}

/**
 * Suggests a registry name for a spelling that has no approved name yet, e.g.
 * "Shoulder presses (dB)" -> "Shoulder press (DB)" when that exercise exists.
 * Matching ignores case, hyphens, and plural "s"/"es" endings.
 * @return {{name: string, matched: boolean}}
 */
function suggestExerciseName(legacyName, knownNames, settings) {
  var s = settings || NAMING_DEFAULTS;
  var raw = String(legacyName).trim().replace(/\s+/g, ' ');
  var m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  var movement = m ? m[1] : raw, details = m ? m[2].split(',').map(function (x) { return x.trim(); }) : [];
  var tagByLower = {};
  Object.keys(s.equipmentTags).forEach(function (k) {
    tagByLower[s.equipmentTags[k].toLowerCase()] = k;
    tagByLower[k.toLowerCase()] = k;
  });
  var equipment = details.length && tagByLower[details[0].toLowerCase()] ? tagByLower[details[0].toLowerCase()] : '';
  var detail = (equipment ? details.slice(1) : details).join(', ');
  var name;
  try { name = formatExerciseName({ movement: movement, equipment: equipment, detail: detail }, s); } catch (e) { name = raw; }

  var key = function (n) {
    return String(n).toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9°(), ]/g, '').split(' ')
      .map(function (w) { return w.replace(/(ss|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1'); }).join(' ');
  };
  var target = key(name);
  for (var i = 0; i < knownNames.length; i++) {
    if (knownNames[i] && key(knownNames[i]) === target) return { name: knownNames[i], matched: true };
  }
  return { name: name, matched: false };
}
