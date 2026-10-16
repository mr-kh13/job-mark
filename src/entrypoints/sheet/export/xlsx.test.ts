import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Job } from '@/store/job';
import { makeJob } from '@/test-utils/make-job';
import { EXPORT_COLUMNS } from './columns';
import { createXlsx } from './xlsx';

// Dates are checked as the user sees them, so the clock must not depend on this machine.
// Adelaide is 10:30 ahead of UTC in October and 9:30 ahead in July, so its half-hour offset also
// shows whether the minutes come from local time.
let originalZone: string | undefined;
beforeAll(() => {
  originalZone = process.env.TZ;
  process.env.TZ = 'Australia/Adelaide';
});
afterAll(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

/** The spreadsheet letter of a zero-based column, for the first 26 columns. */
const columnLetter = (index: number) => String.fromCharCode('A'.charCodeAt(0) + index);

const EXCEL_DAY_ZERO_IN_UNIX_DAYS = 25569;
const MS_PER_DAY = 86_400_000;

/** Opens the file the way Excel would and gives access to its sheet, cell by cell. */
async function open(jobs: Job[]) {
  const blob = await createXlsx(jobs);
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = (path: string) =>
    new DOMParser().parseFromString(strFromU8(files[path]!), 'text/xml');

  const workbook = xml('xl/workbook.xml');
  const sheet = xml('xl/worksheets/sheet1.xml');
  const styles = xml('xl/styles.xml');
  const strings = Array.from(xml('xl/sharedStrings.xml').querySelectorAll('si')).map(
    (item) => item.textContent,
  );

  const cell = (ref: string) => sheet.querySelector(`c[r="${ref}"]`);
  const style = (ref: string) => {
    const index = Number(cell(ref)?.getAttribute('s') ?? 0);
    return styles.querySelectorAll('cellXfs > xf')[index];
  };

  return {
    blob,
    sheetNames: Array.from(workbook.querySelectorAll('sheet')).map((s) => s.getAttribute('name')),
    rowCount: sheet.querySelectorAll('sheetData > row').length,
    hasFormula: sheet.querySelector('f') !== null,
    columnWidths: Array.from(sheet.querySelectorAll('cols > col')).map((col) =>
      Number(col.getAttribute('width')),
    ),
    frozenRows: Number(sheet.querySelector('pane[state="frozen"]')?.getAttribute('ySplit') ?? 0),
    /** The text in a cell, or undefined when the cell is empty or holds no text. */
    textAt: (ref: string) => {
      const value = cell(ref)?.querySelector('v')?.textContent;
      return cell(ref)?.getAttribute('t') === 's' ? strings[Number(value)] : undefined;
    },
    /** The date in a cell, as the clock time it shows. */
    dateAt: (ref: string) => {
      const serial = Number(cell(ref)?.querySelector('v')?.textContent);
      const shown = new Date(Math.round((serial - EXCEL_DAY_ZERO_IN_UNIX_DAYS) * MS_PER_DAY));
      return shown.toISOString().slice(0, 16);
    },
    isBold: (ref: string) => {
      const fontId = style(ref)?.getAttribute('fontId');
      return Boolean(styles.querySelectorAll('fonts > font')[Number(fontId)]?.querySelector('b'));
    },
    formatAt: (ref: string) => {
      const formatId = style(ref)?.getAttribute('numFmtId');
      return Array.from(styles.querySelectorAll('numFmts > numFmt'))
        .find((format) => format.getAttribute('numFmtId') === formatId)
        ?.getAttribute('formatCode');
    },
    isEmpty: (ref: string) => !cell(ref)?.querySelector('v'),
  };
}

describe('createXlsx', () => {
  it('makes an Excel file', async () => {
    const { blob } = await open([makeJob()]);

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('puts everything on one sheet named Applications', async () => {
    const file = await open([makeJob()]);

    expect(file.sheetNames).toEqual(['Applications']);
  });

  it('writes the column names in bold as the first row', async () => {
    const file = await open([makeJob()]);

    const names = EXPORT_COLUMNS.map((_, index) => file.textAt(`${columnLetter(index)}1`));
    expect(names).toEqual(EXPORT_COLUMNS.map((column) => column.header));
    expect(EXPORT_COLUMNS.every((_, index) => file.isBold(`${columnLetter(index)}1`))).toBe(true);
  });

  it('leaves the rows of jobs in regular weight', async () => {
    const file = await open([makeJob()]);

    expect(file.isBold('C2')).toBe(false);
  });

  it('keeps the column names in view while scrolling', async () => {
    const file = await open([makeJob()]);

    expect(file.frozenRows).toBe(1);
  });

  it('sizes the columns', async () => {
    const file = await open([makeJob()]);

    expect(file.columnWidths).toEqual(EXPORT_COLUMNS.map((column) => column.width));
  });

  it('writes a row for each job, most recent first', async () => {
    const file = await open([
      makeJob({ id: 'seek:old', title: 'Old', savedAt: '2026-09-01T00:00:00.000Z' }),
      makeJob({ id: 'seek:new', title: 'New', savedAt: '2026-10-01T00:00:00.000Z' }),
    ]);

    expect(file.rowCount).toBe(3);
    expect([file.textAt('C2'), file.textAt('C3')]).toEqual(['New', 'Old']);
  });

  it('writes only the column names when there are no jobs', async () => {
    const file = await open([]);

    expect(file.rowCount).toBe(1);
  });

  it('writes text fields as text', async () => {
    const file = await open([
      makeJob({ company: 'Zoë & Co', salary: '$120k', url: 'https://au.seek.com/job/1' }),
    ]);

    expect(file.textAt('D2')).toBe('Zoë & Co');
    expect(file.textAt('H2')).toBe('$120k');
    expect(file.textAt('M2')).toBe('https://au.seek.com/job/1');
  });

  it('keeps text that looks like a formula as text', async () => {
    const file = await open([makeJob({ title: '=HYPERLINK("http://evil","x")' })]);

    expect(file.textAt('C2')).toBe('=HYPERLINK("http://evil","x")');
    expect(file.hasFormula).toBe(false);
  });

  describe('dates', () => {
    it('are date cells in the format year-month-day hour:minute', async () => {
      const file = await open([
        makeJob({ savedAt: '2026-10-13T01:27:00.000Z', appliedAt: '2026-10-14T01:35:00.000Z' }),
      ]);

      expect(file.formatAt('A2')).toBe('yyyy-mm-dd hh:mm');
      expect(file.formatAt('B2')).toBe('yyyy-mm-dd hh:mm');
    });

    it('show the local time, not UTC', async () => {
      const file = await open([
        makeJob({ savedAt: '2026-10-13T01:27:00.000Z', appliedAt: '2026-10-14T01:35:00.000Z' }),
      ]);

      expect(file.dateAt('A2')).toBe('2026-10-14T12:05');
      expect(file.dateAt('B2')).toBe('2026-10-13T11:57');
    });

    it('show the local day when it differs from the UTC day', async () => {
      const file = await open([makeJob({ savedAt: '2026-12-31T21:00:00.000Z' })]);

      // 21:00 UTC on New Year's Eve is already 07:30 on New Year's Day in Adelaide.
      expect(file.dateAt('B2')).toBe('2027-01-01T07:30');
    });

    it('show local time outside daylight saving too', async () => {
      const file = await open([makeJob({ savedAt: '2026-07-01T01:00:00.000Z' })]);

      expect(file.dateAt('B2')).toBe('2026-07-01T10:30');
    });

    it('leave the Applied cell empty for a job never applied for', async () => {
      const file = await open([makeJob({ appliedAt: undefined })]);

      expect(file.isEmpty('A2')).toBe(true);
      expect(file.isEmpty('B2')).toBe(false);
    });
  });

  it('leaves the cell of a blank value empty', async () => {
    const file = await open([makeJob({ title: 'Engineer', salary: undefined, notes: '' })]);

    expect(file.isEmpty('H2')).toBe(true);
    expect(file.isEmpty('L2')).toBe(true);
    expect(file.isEmpty('C2')).toBe(false);
  });
});
