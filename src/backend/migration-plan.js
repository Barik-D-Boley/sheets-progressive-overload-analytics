/**
 * Turns parsed legacy entries into import records using the reviewed name map.
 *
 * nameMap: { '<legacy name lowercased>': { name: '<registry name>', type: 'lift'|'cardio'|'skip',
 *            unweightedName?: '<name used when every set has 0 load>' } }
 * e.g. hanging leg raises: "Hanging leg raises (DB)", or "(BW)" when no set used weight.
 *
 * Status per entry:
 *   ready   - imported as-is
 *   skipped - type "skip", or no usable sets (e.g. only unknown reps)
 *   flagged - imported; unparseable set cells are kept as their original text
 *             in the quarter tab so they can be fixed there later
 *   blocked - not imported (no date or no approved name); listed in the preview
 */
function normalizeLegacyKey(name) { return String(name).trim().replace(/\s+/g, ' ').toLowerCase(); }

function buildMigrationPlan(parsed, nameMap, options) {
  options = options || {};
  var unit = options.unit || CONFIG.LEGACY_UNIT;
  var lifts = [], cardio = [], issues = [];
  var counts = { ready: 0, flagged: 0, blocked: 0, skipped: 0 };

  parsed.flags.forEach(function (f) { issues.push({ ref: f.ref, status: 'blocked', message: f.message }); counts.blocked++; });

  parsed.entries.forEach(function (entry) {
    var mapped = nameMap[normalizeLegacyKey(entry.legacyName)];
    var base = { source: 'legacy:' + entry.ref, ref: entry.ref, date: entry.date, gym: entry.gym,
      workout: entry.block, legacyName: entry.legacyName, notes: entry.sessionNotes.join('; ') };

    if (!entry.date) return; // already reported by the parser
    if (entry.dateIssue) {
      issues.push({ ref: entry.ref, status: 'blocked', message: entry.dateIssue + ' - fix the date in the legacy tab' });
      counts.blocked++; return;
    }
    if (mapped && mapped.type === 'skip') { counts.skipped++; return; }
    if (!mapped || !mapped.name) {
      issues.push({ ref: entry.ref, status: 'blocked', message: 'No approved name for "' + entry.legacyName + '"' });
      counts.blocked++; return;
    }
    base.exercise = mapped.name;

    if (mapped.type === 'cardio') {
      var c = parseLegacyCardioCells(entry.cells.map(function (x) { return x.text; }));
      var rec = Object.assign(base, { durationMin: c.durationMin, speed: c.speed, speedUnit: c.speedUnit,
        distance: c.distance, distanceUnit: c.distanceUnit, calories: entry.calories, flags: c.flags });
      if (c.flags.length || c.notes.length) {
        rec.notes = [rec.notes, 'Legacy: ' + entry.cells.map(function (x) { return x.text; }).join(' | ')].filter(String).join('; ');
      }
      cardio.push(rec);
      tally(rec, c.flags);
      return;
    }

    var setFlags = [], legacyNotes = [], sets = [];
    entry.cells.forEach(function (cell, i) {
      if (!cell.text) return;
      var parsedSet = parseLegacySetCell(cell.text);
      if (parsedSet.ignore) { legacyNotes.push('S' + (i + 1) + ' "' + cell.text + '" ignored (' + parsedSet.ignore + ')'); return; }
      if (parsedSet.set) {
        if (parsedSet.note) legacyNotes.push('S' + (i + 1) + ' "' + cell.text + '" (' + parsedSet.note + ')');
        sets.push(formatSetCell(parsedSet.set));
        return;
      }
      setFlags.push(parsedSet.flag + ' at ' + cell.ref);
      sets.push(cell.text); // kept verbatim for later correction
    });
    if (legacyNotes.length) base.notes = [base.notes, 'Legacy: ' + legacyNotes.join('; ')].filter(String).join('; ');
    if (!sets.length) {
      issues.push({ ref: entry.ref, status: 'skipped', message: 'No usable sets for "' + entry.legacyName + '"' +
        (legacyNotes.length ? ' (' + legacyNotes.join('; ') + ')' : '') });
      counts.skipped++;
      return;
    }
    if (mapped.unweightedName) {
      var loads = sets.map(function (cell) {
        var ps = parseSetCell(cell);
        return ps ? ps.loadValue : null;
      }).filter(function (v) { return v !== null; });
      if (loads.length && loads.every(function (v) { return v === 0; })) base.exercise = mapped.unweightedName;
    }
    var lift = Object.assign(base, { unit: unit, sets: sets, flags: setFlags });
    lifts.push(lift);
    tally(lift, setFlags);
  });

  function tally(rec, flags) {
    rec.status = flags.length ? 'flagged' : 'ready';
    counts[rec.status]++;
    flags.forEach(function (f) { issues.push({ ref: rec.ref, status: 'flagged', message: f }); });
  }

  var bodyweights = parsed.bodyweights.map(function (b) {
    var first = lifts.concat(cardio).map(function (x) { return x.date; }).sort()[0] || null;
    return { source: 'legacy:' + b.ref, date: first, weight: b.weight, unit: b.unit,
      note: 'Legacy header value; dated to the first legacy workout' };
  });

  return { lifts: lifts, cardio: cardio, bodyweights: bodyweights, issues: issues, counts: counts };
}
