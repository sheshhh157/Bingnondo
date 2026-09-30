/**
 * csv.js — RFC 4180 CSV generation for the manager exports.
 *
 * The exports used to do `row.join(',')`, which silently corrupts the file the
 * moment a value contains a comma, a quote or a newline, and turns a value
 * starting with `=`, `+`, `-` or `@` into a live formula when the file is opened
 * in Excel or Sheets. Ingredient and item names are free text typed by staff, so
 * both cases are reachable in normal use.
 */

const NEEDS_QUOTING = /[",\r\n]/;
// Leading characters Excel/Sheets treat as the start of a formula.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Quote one field.
 * @param {unknown} value
 * @returns {string}
 */
// Module-private: `toCsv` is the only caller, and it already quotes every
// field it writes. Kept out of the module's surface so a new export has to be
// asked for deliberately.
function csvField(value) {
  if (value === null || value === undefined) return '';
  // Objects and arrays are almost always a caller passing the wrong thing
  // (e.g. a whole order instead of one of its fields). `String()` would quietly
  // produce `[object Object]`, which looks like real data in the sheet — emit
  // JSON so the mistake is visible in the file instead.
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralise formula injection before quoting — a quoted string is still
  // executed as a formula by Excel, so the quote alone is not enough.
  const safe = FORMULA_LEAD.test(str) ? `'${str}` : str;
  if (NEEDS_QUOTING.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * Build a CSV document from a header row and a list of row objects.
 *
 * @param {string[]} headers
 * @param {Array<Record<string, unknown>>} rows
 * @param {(row: Record<string, unknown>) => Array<unknown>} mapRow
 *   Maps each row to the values, positionally aligned with `headers`.
 * @returns {string} CSV text, prefixed with a UTF-8 BOM so Excel reads the
 *   peso sign and accented names as UTF-8 instead of the system codepage.
 */
export function toCsv(headers, rows, mapRow) {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) lines.push(mapRow(row).map(csvField).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Trigger a browser download for CSV text.
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
