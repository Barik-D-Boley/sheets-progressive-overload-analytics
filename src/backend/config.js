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
        'Setup Notes', 'Increment'] },
    workouts: { column: 'Q', idPrefix: 'WO-', idDigits: 2, title: 'Workouts',
      headers: ['Workout ID', 'Name'] },
    gyms: { column: 'T', idPrefix: 'GY-', idDigits: 2, title: 'Gyms',
      headers: ['Gym ID', 'Name'] },
    cardio: { column: 'W', idPrefix: 'CA-', idDigits: 2, title: 'Cardio',
      headers: ['Cardio ID', 'Name', 'Active'] },
  },

  /** Routine templates on Master: Routine | Workout | exercise names left to right. */
  ROUTINES: { column: 'AA', title: 'Routines (edit to change a workout template)', maxExercises: 15 },

  /** Equipment -> tag table on Master; overrides NAMING_DEFAULTS.equipmentTags when filled in. */
  NAMING_TABLE: { column: 'AR', title: 'Exercise name tags', headers: ['Equipment', 'Tag'] },

  QUARTER_HEADERS: ['Record ID', 'Date', 'Gym ID', 'Workout ID', 'Exercise ID', 'Unit', 'Notes', 'Source'],
  CARDIO_HEADERS: ['Record ID', 'Date', 'Gym ID', 'Activity ID', 'Duration (min)', 'Speed', 'Speed Unit',
    'Distance', 'Distance Unit', 'Calories', 'Notes', 'Source'],
  BODYWEIGHT_HEADERS: ['Date', 'Weight', 'Unit', 'Source'],

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
