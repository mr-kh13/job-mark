import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equals,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  type ReactTable,
  type Row,
} from '@tanstack/react-table';
import { ExternalLink, Trash2 } from 'lucide-react';
import { OptionSelect } from '@/components/option-select';
import { StatusSelect } from '@/components/status-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SOURCE_LABELS } from '@/store/job-display';
import {
  EMPLOYMENT_TYPES,
  STATUSES,
  WORK_ARRANGEMENTS,
  listedAt,
  type Job,
  type JobPatch,
} from '@/store/job';
import { jobStore } from '@/store/job-store';
import { formatDate } from '@/utils/format-date';
import { writeOrReport } from '@/utils/write-or-report';
import { deleteJob } from './delete-job';
import { EditableText } from './editable-text';

export const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
});

export type JobTable = ReactTable<typeof features, Job>;
export type JobTableRow = Row<typeof features, Job>;

const helper = createColumnHelper<typeof features, Job>();

/** The column with the open and delete buttons. The table keeps it pinned to the right edge. */
export const ACTIONS_COLUMN_ID = 'actions';

const saveJob = (job: Job, patch: JobPatch) =>
  void writeOrReport(jobStore.update(job.id, patch), 'save the change');

// Blank text counts as missing, so the sort puts it last in both directions.
const textOrUndefined = (text: string | undefined) => text?.trim() || undefined;

const textColumn = (
  id: 'title' | 'company' | 'location' | 'salary',
  header: string,
  width: string,
  canHide = true,
) =>
  helper.accessor((job) => textOrUndefined(job[id]), {
    id,
    header,
    enableHiding: canHide,
    sortFn: sortFn_alphanumeric,
    sortUndefined: 'last',
    cell: ({ row }) => (
      <EditableText
        label={header}
        value={row.original[id] ?? ''}
        className={width}
        onCommit={(text) =>
          saveJob(row.original, { [id]: id === 'salary' ? text.trim() || undefined : text })
        }
      />
    ),
  });

const optionColumn = (
  id: 'workArrangement' | 'employmentType',
  header: string,
  width: string,
  options: readonly string[],
) =>
  helper.accessor((job) => job[id], {
    id,
    header,
    sortFn: sortFn_alphanumeric,
    sortUndefined: 'last',
    filterFn: filterFn_equals,
    cell: ({ row }) => (
      <OptionSelect
        variant="ghost"
        label={`${header} of ${row.original.title || 'job'}`}
        options={options}
        value={row.original[id]}
        className={width}
        onValueChange={(value) => saveJob(row.original, { [id]: value })}
      />
    ),
  });

export const jobColumns = helper.columns([
  helper.accessor((job) => Date.parse(listedAt(job)), {
    id: 'date',
    header: 'Date',
    sortFn: sortFn_basic,
    sortDescFirst: true,
    cell: ({ row }) => formatDate(new Date(listedAt(row.original)), 'yyyy-MM-dd HH:mm'),
  }),
  textColumn('title', 'Title', 'min-w-48', false),
  textColumn('company', 'Company', 'min-w-36'),
  textColumn('location', 'Location', 'min-w-40'),
  optionColumn('workArrangement', 'Arrangement', 'w-28', WORK_ARRANGEMENTS),
  optionColumn('employmentType', 'Employment', 'w-32', EMPLOYMENT_TYPES),
  textColumn('salary', 'Salary', 'min-w-36'),
  helper.accessor((job) => job.source, {
    id: 'source',
    header: 'Source',
    sortFn: sortFn_alphanumeric,
    filterFn: filterFn_equals,
    cell: ({ row }) => <Badge variant="outline">{SOURCE_LABELS[row.original.source]}</Badge>,
  }),
  helper.accessor((job) => job.status, {
    id: 'status',
    header: 'Status',
    sortFn: (a, b) => STATUSES.indexOf(a.original.status) - STATUSES.indexOf(b.original.status),
    filterFn: filterFn_equals,
    cell: ({ row }) => (
      <StatusSelect
        variant="ghost"
        value={row.original.status}
        label={`Status of ${row.original.title || 'job'}`}
        onValueChange={(status) =>
          void writeOrReport(jobStore.changeStatus(row.original.id, status), 'change the status')
        }
      />
    ),
  }),
  helper.display({
    id: 'notes',
    header: 'Notes',
    cell: ({ row }) => (
      <EditableText
        isMultiline
        label="Notes"
        value={row.original.notes}
        onCommit={(notes) => saveJob(row.original, { notes })}
      />
    ),
  }),
  helper.display({
    id: ACTIONS_COLUMN_ID,
    enableHiding: false,
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const job = row.original;
      const name = job.title || 'job';
      return (
        <div className="flex justify-end whitespace-nowrap">
          {job.url && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${name} in a new tab`}
                  title="Open job"
                />
              }
            >
              <ExternalLink />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${name}`}
            title="Delete job"
            onClick={() => void deleteJob(job)}
          >
            <Trash2 />
          </Button>
        </div>
      );
    },
  }),
]);
