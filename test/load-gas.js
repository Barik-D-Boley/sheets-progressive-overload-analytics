// Loads the Apps Script files into one shared global scope, as Apps Script does.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PURE_FILES = ['config.js', 'naming.js', 'set-format.js', 'one-rm.js', 'progression.js', 'warmup.js', 'compiled.js', 'bodyweight.js',
  'legacy-parser.js', 'migration-plan.js', 'legacy-name-map.js'];
const SHEET_FILES = ['settings.js', 'registry.js', 'migration.js', 'workout-log.js', 'entry.js', 'routines.js', 'entry-setup.js', 'compiled-sheet.js', 'apple-health.js', 'webapp.js'];

module.exports = function loadGas(globals) {
  const context = vm.createContext(Object.assign({}, globals || {}));
  const files = globals ? PURE_FILES.concat(SHEET_FILES) : PURE_FILES;
  for (const f of files) {
    const file = path.join(__dirname, '..', 'src', 'backend', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: f });
  }
  return context;
};
