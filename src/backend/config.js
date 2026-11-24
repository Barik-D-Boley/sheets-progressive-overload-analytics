/**
 * Shared constants. Sheet names and registry locations live here so layout
 * changes only need to be made in one place.
 */
var CONFIG = {
  SHEETS: {
    ENTRY: 'Workout Entry',
    COMPILED: 'Compiled Data',
    MASTER: 'Master',
    LEGACY: 'All Data - Unorganized',
    CARDIO: 'Cardio',
    BODYWEIGHT: 'Bodyweight Log',
    MIGRATION_REVIEW: 'Migration Review',
    MIGRATION_PREVIEW: 'Migration Preview',
  },

  /** Registries on Master: title in row 1, headers in row 2, data from row 3. */
  REGISTRIES: {
    exercises: { column: 'G', idPrefix: 'EX-', idDigits: 4, title: 'Exercises',
      headers: ['Exercise ID', 'Name', 'Equipment', 'Primary Muscle', 'Secondary Muscle', 'Active', 'Warm-up',
        'Setup Notes', 'Increment', 'Same Gym Only'] },
    workouts: { column: 'Q', idPrefix: 'WO-', idDigits: 2, title: 'Workouts',
      headers: ['Workout ID', 'Name'] },
    gyms: { column: 'T', idPrefix: 'GY-', idDigits: 2, title: 'Gyms',
      headers: ['Gym ID', 'Name'] },
    cardio: { column: 'W', idPrefix: 'CA-', idDigits: 2, title: 'Cardio',
      headers: ['Cardio ID', 'Name', 'Active'] },
  },

  /** Registries kept sorted A-Z by name on Master (rows move; IDs never change). */
  SORTED_REGISTRIES: ['exercises', 'cardio'],

  /** Routine templates on Master: Routine | Workout | Active | exercise names left to right (see routines.js). */
  ROUTINES: { column: 'AA', title: 'Routines (edit to change a workout template)', maxExercises: 14 },

  /** Equipment -> tag table on Master; overrides NAMING_DEFAULTS.equipmentTags when filled in. */
  NAMING_TABLE: { column: 'AR', title: 'Exercise name tags', headers: ['Equipment', 'Tag'] },

  QUARTER_HEADERS: ['Record ID', 'Date', 'Gym ID', 'Workout ID', 'Exercise ID', 'Unit', 'Notes', 'Source'],
  CARDIO_HEADERS: ['Record ID', 'Date', 'Gym ID', 'Activity ID', 'Duration (min)', 'Speed', 'Speed Unit',
    'Distance', 'Distance Unit', 'Calories', 'Notes', 'Source', 'Incline (%)', 'Handrails'],
  BODYWEIGHT_HEADERS: ['Date', 'Weight', 'Unit', 'Source'],

  /**
   * Equipment whose loads differ between gyms (machines vary by brand). For these,
   * Last and Goal use history from the current gym first. Each exercise's
   * "Same Gym Only" checkbox on Master overrides this default.
   */
  GYM_SPECIFIC_EQUIPMENT: ['Machine', 'Cable', 'Plate-loaded', 'Smith machine'],

  DEFAULT_SET_COUNT: 3,
  ONE_RM_REP_CAP: 12,
  LEGACY_UNIT: 'lb',
  PROP_LEGACY_IMPORT_DONE: 'LEGACY_IMPORT_DONE',
  PROP_ENTRY_STATE: 'ENTRY_STATE',
};

/** Quarter tab name for a 'YYYY-MM-DD' date, e.g. '2026-11-20' -> 'Q4 2026'. */
function quarterTabName(isoDate) {
  var year = isoDate.slice(0, 4);
  var month = parseInt(isoDate.slice(5, 7), 10);
  return 'Q' + Math.ceil(month / 3) + ' ' + year;
}

/** Default for an exercise's "Same Gym Only" box, from its equipment name. */
function isGymSpecificEquipment(equipment) {
  return CONFIG.GYM_SPECIFIC_EQUIPMENT.indexOf(String(equipment || '')) >= 0;
}
