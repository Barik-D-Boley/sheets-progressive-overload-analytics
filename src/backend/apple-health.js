/**
 * Optional: Apple Health -> sheet via an iPhone Shortcut (Overload Tracker -> Advanced).
 *
 * The script is deployed as a web app; the Shortcut calls its URL with a secret
 * token and the latest weight. Only requests with the right token are accepted.
 *   GET <web app url>?token=...&weight=170.4&unit=lb&date=2026-11-20
 */
var APPLE_HEALTH = { PROP_TOKEN: 'APPLE_HEALTH_TOKEN' };

/** The web app URL serves the logging app; requests carrying a Health token log a weigh-in. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.token || p.weight) return handleHealthRequest_(e);
  return serveWebApp_(e);
}
function doPost(e) { return handleHealthRequest_(e); }

function handleHealthRequest_(e) {
  var p = (e && e.parameter) || {};
  if (e && e.postData && /json/.test(e.postData.type || '')) {
    try { var body = JSON.parse(e.postData.contents); for (var k in body) p[k] = body[k]; } catch (err) { /* ignore */ }
  }
  var result = healthLogFromParams_(p);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/** Validates and logs one weigh-in from request parameters. */
function healthLogFromParams_(p) {
  var token = PropertiesService.getDocumentProperties().getProperty(APPLE_HEALTH.PROP_TOKEN);
  if (!token || String(p.token || '') !== token) return { ok: false, error: 'Not authorized' };
  var parsed = parseBodyweightInput(String(p.weight || '').replace(',', '.'), /kg/i.test(p.unit || '') ? 'kg' : 'lb');
  if (!parsed) return { ok: false, error: 'Missing or invalid weight' };
  var date = String(p.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayIso_();
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var added = logBodyweight_(date, parsed.weight, parsed.unit, 'apple-health');
    return { ok: true, added: added, date: date, weight: parsed.weight, unit: parsed.unit };
  } finally {
    lock.releaseLock();
  }
}

/** Menu: shows the setup steps and the personal link (creates the token on first use). */
function showAppleHealthSetup() {
  var props = PropertiesService.getDocumentProperties();
  var token = props.getProperty(APPLE_HEALTH.PROP_TOKEN);
  if (!token) { token = Utilities.getUuid().replace(/-/g, ''); props.setProperty(APPLE_HEALTH.PROP_TOKEN, token); }
  var url = ScriptApp.getService().getUrl();
  var html = '<div style="font:14px sans-serif;line-height:1.5">' +
    '<p><b>Optional.</b> Logging bodyweight on the Workout Entry tab works without this.</p>' +
    (url ? '' : '<p style="color:#b00"><b>First:</b> Extensions → Apps Script → Deploy → New deployment → Web app. ' +
      'Execute as: <i>Me</i>. Who has access: <i>Anyone</i>. Then open this again.</p>') +
    '<p><b>Your link</b> (keep it private; it can add weigh-ins to this sheet):</p>' +
    '<textarea style="width:100%;height:70px" readonly>' + (url || '(deploy first)') + '?token=' + token +
    '&weight=WEIGHT&unit=UNIT&date=DATE</textarea>' +
    '<ol><li>iPhone Shortcuts → Automation → New → Time of Day (e.g. 9:00 PM daily) → Run Immediately.</li>' +
    '<li>Add <b>Find Health Samples</b>: Type is Weight, sort by Start Date, latest first, limit 1.</li>' +
    '<li>Add <b>Text</b>: paste the link, then replace WEIGHT with the sample\'s <i>Value</i>, UNIT with its <i>Unit</i>, ' +
    'and DATE with its <i>Start Date</i> (Format: ISO 8601).</li>' +
    '<li>Add <b>Get Contents of URL</b> with that Text.</li></ol>' +
    '<p>Running it twice for the same weigh-in does not duplicate it. To revoke the link, use ' +
    '<i>Advanced → Reset Apple Health link</i>.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(480), 'Connect Apple Health (optional)');
}

function resetAppleHealthLink() {
  PropertiesService.getDocumentProperties().setProperty(APPLE_HEALTH.PROP_TOKEN, Utilities.getUuid().replace(/-/g, ''));
  SpreadsheetApp.getUi().alert('The old link no longer works. Open "Connect Apple Health" for the new one.');
}
