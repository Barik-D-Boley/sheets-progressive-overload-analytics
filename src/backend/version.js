/**
 * App version and the "update available" check.
 *
 * Every copy of the sheet carries the version it was copied at (APP_VERSION). The
 * latest released version is published in version.json at the root of the GitHub
 * repo; copies read it (cached for a few hours) to tell their owner an update exists.
 *
 * Releasing: bump APP_VERSION here and "version" in version.json (and package.json)
 * together; tests fail if they disagree.
 */
var APP_VERSION = '2.0.0';

var VERSION_CHECK = {
  URL: 'https://raw.githubusercontent.com/Barik-D-Boley/sheets-progressive-overload-analytics/main/version.json',
  CACHE_KEY: 'latestVersionInfo',
  CACHE_SECONDS: 6 * 60 * 60,
};

/** "2.10.0" vs "2.9.1" -> 1; equal -> 0; lower -> -1. Missing parts count as 0; non-numeric versions compare as equal. */
function compareVersions(a, b) {
  var parse = function (v) {
    var m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    return m ? [m[1], m[2] || 0, m[3] || 0].map(Number) : null;
  };
  var x = parse(a), y = parse(b);
  if (!x || !y) return 0;
  for (var i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Update status from the published info ({version, released, notes, url}) or null.
 * @return {{current: string, latest: string, updateAvailable: boolean, released: string, notes: string[], url: string}}
 */
function updateStatus(current, info) {
  var latest = info && info.version ? String(info.version) : '';
  var notes = info && info.notes ? (Array.isArray(info.notes) ? info.notes : [info.notes]).map(String) : [];
  return {
    current: String(current),
    latest: latest,
    updateAvailable: !!latest && compareVersions(latest, current) > 0,
    released: info && info.released ? String(info.released) : '',
    notes: notes,
    url: info && info.url ? String(info.url) : '',
  };
}

/** Latest published version info, cached; null when it can't be read (offline, repo moved, no permission yet). */
function fetchLatestVersionInfo_(force) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = force ? null : cache.get(VERSION_CHECK.CACHE_KEY);
    if (cached) return JSON.parse(cached);
    var res = UrlFetchApp.fetch(VERSION_CHECK.URL, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    if (!info || !info.version) return null;
    cache.put(VERSION_CHECK.CACHE_KEY, JSON.stringify(info), VERSION_CHECK.CACHE_SECONDS);
    return info;
  } catch (e) {
    return null;
  }
}

function checkForUpdate_(force) {
  return updateStatus(APP_VERSION, fetchLatestVersionInfo_(force));
}

/** Menu: About / check for updates. */
function showAbout() {
  var s = checkForUpdate_(true);
  var msg = 'You have version ' + s.current + '.\n\n';
  if (s.updateAvailable) {
    msg += 'Version ' + s.latest + ' is available' + (s.released ? ' (released ' + s.released + ')' : '') + '.\n' +
      (s.notes.length ? '\nWhat\'s new:\n' + s.notes.map(function (n) { return '• ' + n; }).join('\n') + '\n' : '') +
      (s.url ? '\nHow to update: ' + s.url : '');
  } else if (s.latest) {
    msg += 'You\'re up to date.';
  } else {
    msg += 'Couldn\'t check for updates right now.';
  }
  SpreadsheetApp.getUi().alert('Overload Tracker', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}
