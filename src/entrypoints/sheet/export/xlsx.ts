import type { Cell, Row, SheetData } from 'write-excel-file/universal';
import type { Job } from '@/store/job';
import { EXPORT_COLUMNS, exportRows, type ExportCell } from './columns';

// Excel counts a date as a number of days with no time zone, and the library counts from UTC. A
// date rebuilt with its local clock time as UTC shows the time the user saw in the app.
const toClockTime = (date: Date): Date =>
  new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ),
  );

// Text is always written as a text cell, so a spreadsheet never reads it as a formula.
const toCell = (cell: ExportCell): Cell => (cell instanceof Date ? toClockTime(cell) : cell);

/**
 * Writes jobs as an Excel file: one sheet named Applications with real date cells, sized columns
 * and a bold header row that stays in view. The library loads on the first call.
 *
 * @param jobs - The jobs to export.
 * @returns The file.
 */
export async function createXlsx(jobs: readonly Job[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/universal');
  const header: Row = EXPORT_COLUMNS.map((column) => ({
    value: column.header,
    fontWeight: 'bold',
  }));
  const rows: SheetData = [header].concat(exportRows(jobs).map((row) => row.map(toCell)));

  return writeXlsxFile(rows, {
    sheet: 'Applications',
    dateFormat: 'yyyy-mm-dd hh:mm',
    columns: EXPORT_COLUMNS.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
  }).toBlob();
}
