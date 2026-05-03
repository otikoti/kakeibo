const SHEET_NAME = "entries";
const HEADERS = [
  "id",
  "type",
  "date",
  "bank",
  "partner",
  "category",
  "amount",
  "memo",
  "createdAt",
  "updatedAt",
  "deleted"
];

function doGet(event) {
  const requestedCallback = event.parameter.callback || "callback";
  const callback = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(requestedCallback)
    ? requestedCallback
    : "callback";
  const payload = JSON.stringify({ entries: readEntries() });
  return ContentService
    .createTextOutput(`${callback}(${payload});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(event) {
  const action = event.parameter.action;
  const payload = JSON.parse(event.parameter.payload || "{}");

  if (action === "replace") {
    replaceEntries(payload.entries || []);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ss.getSheetByName(SHEET_NAME);
  const target = existing || ss.insertSheet(SHEET_NAME);

  if (target.getLastRow() === 0) {
    target.appendRow(HEADERS);
  }

  return target;
}

function readEntries() {
  const target = sheet();
  const values = target.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  return values.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index];
    });
    entry.amount = Number(entry.amount) || 0;
    entry.deleted = entry.deleted === true || entry.deleted === "true";
    return entry;
  });
}

function replaceEntries(entries) {
  const target = sheet();
  target.clearContents();
  target.appendRow(HEADERS);

  if (!entries.length) return;

  const rows = entries.map((entry) => HEADERS.map((header) => entry[header] || ""));
  target.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}
