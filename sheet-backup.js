/**
 * @OnlyCurrentDoc
 */

// Planner backup: a copy of your planner, kept in this Google Sheet.
//
// Paste this whole file into the Apps Script editor of your own Google Sheet
// (in the sheet: Extensions, Apps Script). Then choose Deploy, New deployment, Web app,
// with "Execute as: Me" and "Who has access: Anyone", and paste the web app address into the app.
//
// What it does: keeps the copy the app sends in the tab "Planner backup", hands it back to your
// own devices, and writes your money entries to a second tab that you can read. It can touch only
// this one spreadsheet. Only a device that knows your device code is answered; the first device
// that connects sets that code. Please leave the "Planner backup" tab as it is. To go back to an
// earlier day, use File, Version history.

var TAB = 'Planner backup';
var NOTE = 'This tab is written by your planner app. Please leave it as it is. To go back to an earlier day use File, Version history.';
var CHUNK = 40000;   // one cell holds 50,000 characters at most
var TOP = 4;         // the copy starts in this row; columns A and B take turns holding it

function doGet() {
  return out(reply(200, { ok: true, about: 'Your planner backup is running. Paste this address into the app: Settings, Personal cloud.' }));
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return out(reply(503, { error: 'The sheet is busy. The app tries again by itself.' })); }
  try {
    return out(answer(JSON.parse(e.postData.contents)));
  } catch (err) {
    return out(reply(500, { error: String((err && err.message) || err) }));
  } finally {
    lock.releaseLock();
  }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function reply(status, data) { return { status: status, data: data }; }

function sha(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8), s = '', i;
  for (i = 0; i < bytes.length; i++) s += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  return s;
}

/* Everything this code stores is wrapped in ~ ~, so the sheet never reads it as a number, a date or a formula and never trims it. */
function wrap(s) { return '~' + s + '~'; }
function unwrap(v) { v = String(v); return v.length > 1 && v.charAt(0) === '~' && v.charAt(v.length - 1) === '~' ? v.slice(1, -1) : null; }

/* One cell says where the copy is and who may ask for it. An empty cell means a new sheet; null means it was changed by hand. */
function readMeta(sh) {
  var v = sh.getRange(2, 1).getValue();
  if (v === '' || v == null) return {};
  try { return JSON.parse(unwrap(v)) || null; } catch (err) { return null; }
}
function writeMeta(sh, meta) {
  sh.getRange(2, 1).setNumberFormat('@').setValue(wrap(JSON.stringify(meta)));
  SpreadsheetApp.flush();
}
function makeTab(book) {
  var sh = book.insertSheet(TAB);
  sh.getRange(1, 1).setValue(NOTE);
  return sh;
}

function load(sh, col, n) {
  if (!n) return null;
  var v = sh.getRange(TOP, col, n, 1).getValues(), s = '', i, part;
  for (i = 0; i < v.length; i++) {
    part = unwrap(v[i][0]);
    if (part == null) return null;
    s += part;
  }
  return s;
}

/* The new copy goes into the column that is not in use, and is read back before the old one is let go. */
function save(sh, meta, blob) {
  var col = meta.slot === 1 ? 2 : 1, grid = [], i, rows, range;
  for (i = 0; i < blob.length; i += CHUNK) grid.push([wrap(blob.substr(i, CHUNK))]);
  if (sh.getMaxColumns() < 2) sh.insertColumnsAfter(1, 1);
  rows = sh.getMaxRows();
  if (rows < TOP + grid.length) sh.insertRowsAfter(rows, TOP + grid.length - rows);
  sh.getRange(TOP, col, sh.getMaxRows() - TOP + 1, 1).clearContent();
  range = sh.getRange(TOP, col, grid.length, 1);
  range.setNumberFormat('@');
  range.setValues(grid);
  SpreadsheetApp.flush();
  if (load(sh, col, grid.length) !== blob) throw new Error('Google Sheets did not keep the copy exactly, so the earlier copy was left in place.');
  return { slot: col, chunks: grid.length };
}

/* A text that starts like a formula is written as plain text. */
function plain(v) {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  v = String(v).slice(0, 40000);
  return /^[=+\-@']/.test(v) ? "'" + v : v;
}

/* The tabs you can read. Only tabs this code made itself are written or removed; a tab of your own with the same name is left alone. */
function tables(book, list, mine) {
  var made = [], i, j, k, name, sh, rows, width, grid, row;
  for (i = 0; i < list.length && i < 10; i++) {
    name = String(list[i].name || '').replace(/[\[\]\*\?\/\\:']/g, ' ').slice(0, 80);
    rows = list[i].rows || [];
    if (!name || name === TAB || made.indexOf(name) >= 0) continue;
    sh = book.getSheetByName(name);
    if (sh && mine.indexOf(name) < 0) continue;
    if (!sh) sh = book.insertSheet(name);
    made.push(name);
    sh.clearContents();
    width = 1;
    for (j = 0; j < rows.length; j++) width = Math.max(width, rows[j].length);
    grid = [];
    for (j = 0; j < rows.length; j++) {
      row = [];
      for (k = 0; k < width; k++) row.push(plain(rows[j][k]));
      grid.push(row);
    }
    if (!grid.length) continue;
    if (sh.getMaxRows() < grid.length + 1) sh.insertRowsAfter(sh.getMaxRows(), grid.length + 1 - sh.getMaxRows());
    if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
    sh.getRange(1, 1, grid.length, width).setValues(grid);
    sh.setFrozenRows(1);
  }
  for (i = 0; i < mine.length; i++) {
    sh = made.indexOf(mine[i]) < 0 ? book.getSheetByName(mine[i]) : null;
    if (sh) { try { book.deleteSheet(sh); } catch (err) { /* it stays */ } }
  }
  return made;
}

function answer(req) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) return reply(500, { error: 'This code has to live inside a Google Sheet. Open your sheet, choose Extensions, Apps Script, and paste it there.' });
  var path = String(req.path || ''), method = String(req.method || 'GET'), body = req.body || {}, query = req.query || {};
  var sh = book.getSheetByName(TAB), meta = sh ? readMeta(sh) : {};
  if (!meta) return reply(500, { error: 'The "' + TAB + '" tab was changed by hand. Use File, Version history to go back, or delete that tab and connect again.' });

  if (path === '/claim' && method === 'POST') {
    if (!body.key || String(body.key).length < 16) return reply(400, { error: 'Missing key.' });
    var hash = sha(String(body.key));
    if (!meta.auth) {
      meta.auth = hash;
      writeMeta(sh || makeTab(book), meta);
      return reply(200, { ok: true, fresh: true });
    }
    return meta.auth === hash ? reply(200, { ok: true }) : reply(401, { error: 'This sheet is already connected with a different device code.' });
  }
  if (!meta.auth || !req.key || sha(String(req.key)) !== meta.auth) return reply(401, { error: 'Not allowed.' });

  /* the copy as it stands in the sheet, or null if it is no longer the size it was saved with */
  var held = meta.chunks ? load(sh, meta.slot, meta.chunks) : null;
  if (held != null && held.length !== meta.len) held = null;

  if (path === '/data' && method === 'GET') {
    if (!meta.chunks) return reply(200, { empty: true });
    if (held != null && query.since != null && String(meta.updatedAt) === String(query.since)) return reply(200, { same: true, updatedAt: meta.updatedAt });
    return reply(200, { blob: held, sum: meta.sum, updatedAt: meta.updatedAt });
  }
  if (path === '/data' && method === 'PUT') {
    if (!body.blob) return reply(400, { error: 'Nothing to save.' });
    /* Another device saved since this one last synced: hand back that copy instead of overwriting it. */
    if (meta.chunks && body.base != null && meta.updatedAt !== body.base) {
      return reply(409, { error: 'Changed on another device.', blob: held, sum: meta.sum, updatedAt: meta.updatedAt });
    }
    var kept = save(sh, meta, String(body.blob)), wrote = false;
    meta.slot = kept.slot;
    meta.chunks = kept.chunks;
    meta.len = String(body.blob).length;
    meta.sum = String(body.sum || '');
    meta.updatedAt = body.updatedAt || Date.now();
    meta.saved = new Date().toISOString();
    meta.name = String(body.name || '').slice(0, 80);
    writeMeta(sh, meta);
    if (body.tables) {
      /* the tabs you can read are a courtesy: if one cannot be written, the copy itself is already safe */
      try { meta.tabs = tables(book, body.tables, meta.tabs || []); writeMeta(sh, meta); wrote = true; } catch (err) { wrote = false; }
    }
    return reply(200, { ok: true, updatedAt: meta.updatedAt, tables: wrote });
  }
  if (path === '/data' && method === 'DELETE') {
    var names = (meta.tabs || []).concat([TAB]), i, t;
    for (i = 0; i < names.length; i++) {
      t = book.getSheetByName(names[i]);
      /* the last tab of a spreadsheet cannot be removed, so it is emptied */
      if (t) { try { book.deleteSheet(t); } catch (err) { t.clear(); } }
    }
    return reply(200, { ok: true });
  }
  if (path === '/unsubscribe' && method === 'POST') return reply(200, { ok: true });
  return reply(404, { error: 'Not found.' });
}
