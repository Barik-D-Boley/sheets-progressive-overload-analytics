// Minimal in-memory stand-in for the SpreadsheetApp APIs used by the scripts.
// Formatting methods that do not affect data are accepted and ignored (chainable).
function chainable(target) {
  const proxy = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

function a1ToRc(a1) {
  const m = String(a1).match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!m) throw new Error('Bad A1 ' + a1);
  const col = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const r1 = m[2] ? +m[2] : 1, c1 = col(m[1]);
  const r2 = m[3] ? (m[4] ? +m[4] : 1000) : r1, c2 = m[3] ? col(m[3]) : c1;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}
function rcToA1(row, col) {
  let s = '', n = col;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s + row;
}

class FakeSheet {
  constructor(name, data = []) {
    this.name = name; this.data = data.map(r => r.slice()); this.hidden = false; this.frozen = 0;
    this.hiddenRows = new Set(); this.validations = {}; this.notes = {};
    return chainable(this);
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some(v => v !== '' && v !== null && v !== undefined)) return r + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, numRows = 1, numCols = 1) {
    if (typeof row === 'string') [row, col, numRows, numCols] = a1ToRc(row);
    return new FakeRange(this, row, col, numRows, numCols);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  clear() { this.data = []; return this; }
  hideSheet() { this.hidden = true; return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  hideRows(start, n) { for (let i = 0; i < n; i++) this.hiddenRows.add(start + i); }
  showRows(start, n) { for (let i = 0; i < n; i++) this.hiddenRows.delete(start + i); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  value(a1) { return this.getRange(a1).getValue(); }
}
class FakeRange {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); return chainable(this); }
  getSheet() { return this.sheet; }
  getA1Notation() {
    const a = rcToA1(this.row, this.col);
    return this.nr === 1 && this.nc === 1 ? a : a + ':' + rcToA1(this.row + this.nr - 1, this.col + this.nc - 1);
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined || v === null ? '' : v); }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.getValues().map(r => r.map(v => String(v))); }
  setValues(values) {
    if (values.length !== this.nr || values.some(r => r.length !== this.nc)) throw new Error(`setValues size mismatch ${values.length}x${values[0] && values[0].length} vs ${this.nr}x${this.nc} at ${this.getA1Notation()}`);
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues(Array.from({ length: this.nr }, () => Array(this.nc).fill(v))); }
  clearContent() { return this.setValues(Array.from({ length: this.nr }, () => Array(this.nc).fill(''))); }
  insertCheckboxes() { this.setValues(this.getValues().map(r => r.map(v => v === true))); return this; }
  setDataValidation(rule) { this.sheet.validations[this.getA1Notation()] = rule; return this; }
  getNote() { return this.sheet.notes[this.getA1Notation()] || ''; }
  setNote(n) { this.sheet.notes[this.getA1Notation()] = n; return this; }
}
function validationBuilder() {
  const rule = {};
  const b = chainable({
    requireValueInList(values) { rule.list = values.slice(); return b; },
    requireValueInRange(range) { rule.range = range; return b; },
    setAllowInvalid(v) { rule.allowInvalid = v; return b; },
    build() { return rule; },
  });
  return b;
}
function createFakeApp(sheets) {
  const store = {};
  const ss = {
    sheets: Object.entries(sheets).map(([n, d]) => new FakeSheet(n, d)),
    toasts: [],
    getSheets() { return this.sheets.slice(); },
    getSheetByName(n) { return this.sheets.find(s => s.getName() === n) || null; },
    insertSheet(n, index) {
      if (this.getSheetByName(n)) throw new Error('exists ' + n);
      const s = new FakeSheet(n);
      if (index === undefined) this.sheets.push(s); else this.sheets.splice(index, 0, s);
      return s;
    },
    setActiveSheet() {},
    toast(m) { this.toasts.push(m); },
  };
  const alerts = [];
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES', NO: 'NO' },
    alert(...args) { alerts.push(args); return 'YES'; },
  };
  let uuid = 0;
  let now = new Date(Date.UTC(2026, 10, 20, 12));
  return {
    ss, alerts, store, setNow: d => { now = d; },
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, newDataValidation: validationBuilder },
      PropertiesService: { getDocumentProperties: () => ({ getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; } }) },
      LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Utilities: {
        getUuid: () => (++uuid).toString(16).padStart(8, '0') + '-0000',
        formatDate: (d, tz, fmt) => d.toISOString().slice(0, 10),
      },
      Session: { getScriptTimeZone: () => 'UTC' },
      ScriptApp: {
        triggers: [],
        getProjectTriggers() { return this.triggers; },
        newTrigger(fn) {
          const self = this;
          const b = chainable({ create() { const t = { getHandlerFunction: () => fn }; self.triggers.push(t); return t; } });
          return b;
        },
      },
      Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } },
    },
  };
}
module.exports = { createFakeApp, FakeSheet };
