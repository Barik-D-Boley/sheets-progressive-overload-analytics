// Minimal in-memory stand-in for the SpreadsheetApp APIs used by the migration.
class FakeSheet {
  constructor(name, data = []) { this.name = name; this.data = data.map(r => r.slice()); this.hidden = false; this.frozen = 0; }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length - 1; r >= 0; r--) if ((this.data[r] || []).some(v => v !== '' && v !== null && v !== undefined)) return r + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  clear() { this.data = []; }
  hideSheet() { this.hidden = true; }
  setFrozenRows(n) { this.frozen = n; }
}
class FakeRange {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
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
  getDisplayValues() { return this.getValues().map(r => r.map(v => String(v))); }
  setValues(values) {
    if (values.length !== this.nr || values.some(r => r.length !== this.nc)) throw new Error(`setValues size mismatch ${values.length}x${values[0] && values[0].length} vs ${this.nr}x${this.nc}`);
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.data.length <= idx) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  insertCheckboxes() {
    this.setValues(this.getValues().map(r => r.map(v => v === true)));
    return this;
  }
}
function createFakeApp(sheets) {
  const store = {};
  const ss = {
    sheets: Object.entries(sheets).map(([n, d]) => new FakeSheet(n, d)),
    toasts: [],
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    insertSheet(n) { if (this.getSheetByName(n)) throw new Error('exists ' + n); const s = new FakeSheet(n); this.sheets.push(s); return s; },
    setActiveSheet() {},
    toast(m) { this.toasts.push(m); },
  };
  const alerts = [];
  const ui = {
    ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES', NO: 'NO' },
    alert(...args) { alerts.push(args); return 'YES'; },
  };
  let uuid = 0;
  return {
    ss, alerts, store,
    globals: {
      SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui },
      PropertiesService: { getDocumentProperties: () => ({ getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; } }) },
      LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Utilities: { getUuid: () => (++uuid).toString(16).padStart(8, '0') + '-0000', formatDate: d => d.toISOString().slice(0, 10) },
      Session: { getScriptTimeZone: () => 'UTC' },
    },
  };
}
module.exports = { createFakeApp, FakeSheet };
