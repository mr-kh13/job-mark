// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeJob } from '@/test-utils/make-job';
import { EXPORT_COLUMNS, exportRows, type ExportCell } from './columns';

const cellIn = (row: ExportCell[] | undefined, header: string) =>
  row?.[EXPORT_COLUMNS.findIndex((column) => column.header === header)];

describe('EXPORT_COLUMNS', () => {
  it('lists the columns in the order of the sheet', () => {
    expect(EXPORT_COLUMNS.map((column) => column.header)).toEqual([
      'Applied',
      'Saved',
      'Title',
      'Company',
      'Location',
      'Work arrangement',
      'Employment type',
      'Salary',
      'Source',
      'Apply type',
      'Status',
      'Notes',
      'Link',
    ]);
  });

  it('sizes each column for the text it holds', () => {
    expect(EXPORT_COLUMNS.map((column) => column.width)).toEqual([
      17, 17, 40, 28, 26, 18, 16, 22, 10, 11, 14, 40, 45,
    ]);
  });
});

describe('exportRows', () => {
  it('turns a job into one cell per column', () => {
    const job = makeJob({
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      workArrangement: 'Hybrid',
      employmentType: 'Contract',
      salary: '$120k',
      source: 'linkedin',
      applyType: 'easy',
      status: 'Interviewing',
      notes: 'Call on Monday',
      url: 'https://www.linkedin.com/jobs/view/9',
      savedAt: '2026-10-05T01:00:00.000Z',
      appliedAt: '2026-10-07T02:30:00.000Z',
    });

    expect(exportRows([job])).toEqual([
      [
        new Date('2026-10-07T02:30:00.000Z'),
        new Date('2026-10-05T01:00:00.000Z'),
        'Engineer',
        'Acme',
        'Sydney',
        'Hybrid',
        'Contract',
        '$120k',
        'linkedin',
        'easy',
        'Interviewing',
        'Call on Monday',
        'https://www.linkedin.com/jobs/view/9',
      ],
    ]);
  });

  it('leaves the cells of missing values empty', () => {
    const job = makeJob({
      appliedAt: undefined,
      workArrangement: undefined,
      employmentType: undefined,
      salary: undefined,
    });

    const [row] = exportRows([job]);

    expect(cellIn(row, 'Applied')).toBeUndefined();
    expect(cellIn(row, 'Work arrangement')).toBeUndefined();
    expect(cellIn(row, 'Employment type')).toBeUndefined();
    expect(cellIn(row, 'Salary')).toBeUndefined();
  });

  it('puts the most recently listed job first, listing an unapplied job by its saved date', () => {
    const jobs = [
      makeJob({ id: 'seek:old', title: 'Old', appliedAt: '2026-09-01T00:00:00.000Z' }),
      makeJob({ id: 'seek:saved', title: 'Saved', savedAt: '2026-10-20T00:00:00.000Z' }),
      makeJob({ id: 'seek:mid', title: 'Mid', appliedAt: '2026-10-02T00:00:00.000Z' }),
    ];

    const titles = exportRows(jobs).map((row) => cellIn(row, 'Title'));

    expect(titles).toEqual(['Saved', 'Mid', 'Old']);
  });

  it('writes a row for every job, whatever its status', () => {
    const jobs = [
      makeJob({ id: 'seek:1', status: 'Interested' }),
      makeJob({ id: 'seek:2', status: 'Rejected' }),
      makeJob({ id: 'seek:3', status: 'Withdrawn' }),
    ];

    expect(exportRows(jobs)).toHaveLength(3);
  });

  it('leaves the order of the jobs it was given alone', () => {
    const jobs = [
      makeJob({ id: 'seek:old', savedAt: '2026-09-01T00:00:00.000Z' }),
      makeJob({ id: 'seek:new', savedAt: '2026-10-01T00:00:00.000Z' }),
    ];

    exportRows(jobs);

    expect(jobs.map((job) => job.id)).toEqual(['seek:old', 'seek:new']);
  });

  it('writes no rows for no jobs', () => {
    expect(exportRows([])).toEqual([]);
  });
});
