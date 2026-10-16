import { newestFirstThenId, type Job } from '@/store/job';

/** One cell of an exported row: text, a date, or nothing. */
export type ExportCell = string | Date | undefined;

type ExportColumn = {
  header: string;
  /** Width in characters, for the Excel file. */
  width: number;
  value: (job: Job) => ExportCell;
};

const toDate = (iso: string | undefined) => (iso ? new Date(iso) : undefined);

/** The exported columns, in the order of the sheet. */
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { header: 'Applied', width: 17, value: (job) => toDate(job.appliedAt) },
  { header: 'Saved', width: 17, value: (job) => toDate(job.savedAt) },
  { header: 'Title', width: 40, value: (job) => job.title },
  { header: 'Company', width: 28, value: (job) => job.company },
  { header: 'Location', width: 26, value: (job) => job.location },
  { header: 'Work arrangement', width: 18, value: (job) => job.workArrangement },
  { header: 'Employment type', width: 16, value: (job) => job.employmentType },
  { header: 'Salary', width: 22, value: (job) => job.salary },
  { header: 'Source', width: 10, value: (job) => job.source },
  { header: 'Apply type', width: 11, value: (job) => job.applyType },
  { header: 'Status', width: 14, value: (job) => job.status },
  { header: 'Notes', width: 40, value: (job) => job.notes },
  { header: 'Link', width: 45, value: (job) => job.url },
];

/**
 * Turns jobs into rows of cells, newest first. Exports never apply the sheet's filters.
 *
 * @param jobs - The jobs to export.
 * @returns One row per job, with a cell for each of `EXPORT_COLUMNS`.
 */
export const exportRows = (jobs: readonly Job[]): ExportCell[][] =>
  jobs.toSorted(newestFirstThenId).map((job) => EXPORT_COLUMNS.map((column) => column.value(job)));
