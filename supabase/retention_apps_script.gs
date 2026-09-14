// Retention Tracking Sheet — write-back bridge for the Coach Portal.
// Paste this whole file into Extensions > Apps Script on the
// "Retention Tracking Sheet" spreadsheet, then follow the deployment
// steps Claude gave you in chat.

var SHEET_NAME = 'Retention Tracking Sheet';

var COL = {
  name: 1,
  lastName: 2,
  email: 3,
  startDate: 4,
  endDate: 5,
  bonus: 6,
  coach: 7,
  retained: 8,
  program: 9,
  notes: 10,
};

var MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var expected = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
  if (!expected || body.token !== expected) {
    return jsonResponse({ error: 'unauthorized' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ error: 'sheet not found: ' + SHEET_NAME });
  }

  if (body.action === 'ping') {
    return jsonResponse({ version: 'v3-tolerant-match' });
  }

  if (body.action === 'list') {
    return jsonResponse({ rows: readAllRows(sheet) });
  }

  if (body.action === 'upsert') {
    return jsonResponse(upsertRow(sheet, body.row));
  }

  return jsonResponse({ error: 'unknown action: ' + body.action });
}

// Reads dates exactly as DISPLAYED in the sheet ("October 14, 2024") instead
// of as Date objects — this sidesteps a real timezone bug where converting
// a cell's Date object back to text (getValues + Utilities.formatDate)
// shifted the date by a day whenever the spreadsheet's own timezone and the
// reformatting timezone disagreed. Reading the display string can't drift:
// it's exactly what a human sees in the cell, no timezone math involved.
function parseDisplayDate(display) {
  if (!display) return '';
  var m = String(display).trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return '';
  var month = MONTHS[m[1]];
  if (!month) return '';
  var day = ('0' + m[2]).slice(-2);
  var monthStr = ('0' + month).slice(-2);
  return m[3] + '-' + monthStr + '-' + day;
}

function readAllRows(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var email = r[COL.email - 1];
    if (!email) continue;
    rows.push({
      email: String(email).trim().toLowerCase(),
      startDate: parseDisplayDate(r[COL.startDate - 1]),
      retained: r[COL.retained - 1] || '',
      program: r[COL.program - 1] || '',
      notes: r[COL.notes - 1] || '',
    });
  }
  return rows;
}

// The business's own Master→Retention sync (Code.gs, not this file) copies
// dates across two separate Google Sheets documents; when they don't share
// the same timezone setting, Apps Script can shift a copied date by a day.
// Matching within a couple days (not requiring an exact string match)
// absorbs that without needing to touch Code.gs.
function daysApart(isoA, isoB) {
  if (!isoA || !isoB) return Infinity;
  var da = new Date(isoA + 'T00:00:00');
  var db = new Date(isoB + 'T00:00:00');
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return Infinity;
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
}

function upsertRow(sheet, row) {
  var values = sheet.getDataRange().getDisplayValues();
  var targetEmail = String(row.email).trim().toLowerCase();
  var targetStart = row.startDate; // 'yyyy-MM-dd'

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var email = String(r[COL.email - 1]).trim().toLowerCase();
    var start = parseDisplayDate(r[COL.startDate - 1]);
    if (email === targetEmail && daysApart(start, targetStart) <= 2) {
      sheet.getRange(i + 1, COL.retained).setValue(row.retained || '');
      sheet.getRange(i + 1, COL.program).setValue(row.program || '');
      sheet.getRange(i + 1, COL.notes).setValue(row.notes || '');
      return { updated: true, rowNumber: i + 1 };
    }
  }

  // No existing row for this client's contract — append a new one. Build
  // real Date objects from the yyyy-MM-dd parts (local, no UTC parsing) so
  // the new row's dates display correctly under the column's date format.
  var newRow = [];
  newRow[COL.name - 1] = row.name || '';
  newRow[COL.lastName - 1] = row.lastName || '';
  newRow[COL.email - 1] = row.email || '';
  newRow[COL.startDate - 1] = dateFromIso(row.startDate);
  newRow[COL.endDate - 1] = dateFromIso(row.endDate);
  newRow[COL.bonus - 1] = '';
  newRow[COL.coach - 1] = row.coach || '';
  newRow[COL.retained - 1] = row.retained || '';
  newRow[COL.program - 1] = row.program || '';
  newRow[COL.notes - 1] = row.notes || '';
  sheet.appendRow(newRow);
  return { appended: true, rowNumber: sheet.getLastRow() };
}

function dateFromIso(iso) {
  if (!iso) return '';
  var parts = String(iso).split('-');
  if (parts.length !== 3) return '';
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function jsonResponse(obj) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
