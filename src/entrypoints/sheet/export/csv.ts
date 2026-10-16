import type { Job } from '@/store/job';
import { formatDate } from '@/utils/format-date';
import { EXPORT_COLUMNS, exportRows, type ExportCell } from './columns';

// Built from a char code so no tool or formatter can turn it into an invisible literal.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

// Characters a spreadsheet reads as the start of a formula.
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

const toText = (cell: ExportCell): string =>
  cell instanceof Date ? formatDate(cell, 'yyyy-MM-dd HH:mm') : (cell ?? '');

// Scraped titles and notes are untrusted, so text that starts like a formula gets an apostrophe
// in front and a spreadsheet shows it as text.
function csvCell(cell: ExportCell): string {
  const text = toText(cell);
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Writes jobs as a CSV file that Excel opens with accents intact: UTF-8 with a byte-order mark,
 * CRLF row endings and local-time dates.
 *
 * @param jobs - The jobs to export.
 * @returns The file's text.
 */
export function createCsv(jobs: readonly Job[]): string {
  const header: ExportCell[] = EXPORT_COLUMNS.map((column) => column.header);
  const rows = [header].concat(exportRows(jobs));
  return BYTE_ORDER_MARK + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
