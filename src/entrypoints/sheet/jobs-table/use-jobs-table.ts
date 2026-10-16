import { useMemo, useState } from 'react';
import {
  functionalUpdate,
  useTable,
  type ColumnFiltersState,
  type ColumnSort,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table';
import { newestFirstThenId, type Job } from '@/store/job';
import type { JobRequest } from '@/utils/open-sheet';
import { features, jobColumns } from './columns';
import { paginate } from './paginate';
import { useColumnVisibility } from './use-column-visibility';

export const PAGE_SIZES = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = 50;

const NEWEST_FIRST: SortingState = [{ id: 'date', desc: true }];
const isNewestFirst = (sort: ColumnSort) => sort.id === 'date' && sort.desc;

const SEARCHED_COLUMNS = ['title', 'company'];

// A job passes when the search is in its title or its company, ignoring case and outer spaces.
const includesSearch: FilterFn<typeof features, Job> = (row, columnId, search: string) => {
  const term = search.trim().toLowerCase();
  return (
    term === '' ||
    (row.getValue<string | undefined>(columnId)?.toLowerCase().includes(term) ?? false)
  );
};

/**
 * The jobs table: newest first, searchable, filterable, paged, with columns that can hide.
 * Any change to the sort, search, filters or page size goes back to page 1.
 *
 * A request for a stored job clears the search and filters and shows the page that holds the job.
 * That job stays in focus until the user pages, sorts, searches or filters.
 *
 * @param jobs - Every stored job.
 * @param request - The job to show, if any. A request with a new token is a new request.
 * @returns The table, the rows of the current page, the job in focus, and the paging state and
 * setters.
 */
export function useJobsTable(jobs: readonly Job[], request?: JobRequest) {
  const [sorting, setSorting] = useState<SortingState>(NEWEST_FIRST);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useColumnVisibility();
  const [requestedPage, setPage] = useState(1);
  const [pageSize, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [focus, setFocus] = useState<JobRequest>();
  const [handledToken, setHandledToken] = useState<string>();

  const goToPage = (next: number) => {
    setFocus(undefined);
    setPage(next);
  };

  if (request && request.token !== handledToken && jobs.some((job) => job.id === request.id)) {
    setHandledToken(request.token);
    setFocus(request);
    setColumnFilters([]);
    setGlobalFilter('');
  }

  const data = useMemo(() => Array.from(jobs).sort(newestFirstThenId), [jobs]);

  const table = useTable({
    features,
    columns: jobColumns,
    data,
    getRowId: (job) => job.id,
    state: { sorting, columnFilters, globalFilter, columnVisibility },
    onSortingChange: (updater) => {
      setSorting(updater);
      goToPage(1);
    },
    onColumnVisibilityChange: (updater) => {
      const next = functionalUpdate(updater, columnVisibility);
      setColumnVisibility(next);
      if (sorting.some((sort) => next[sort.id] === false && !isNewestFirst(sort))) {
        setSorting(NEWEST_FIRST);
        goToPage(1);
      }
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      goToPage(1);
    },
    onGlobalFilterChange: (updater) => {
      setGlobalFilter(updater);
      goToPage(1);
    },
    globalFilterFn: includesSearch,
    getColumnCanGlobalFilter: (column) => SEARCHED_COLUMNS.includes(column.id),
    enableSortingRemoval: false,
    enableMultiSort: false,
    sortDescFirst: false,
  });

  const matching = table.getRowModel().rows;
  const focusIndex = focus ? matching.findIndex((row) => row.id === focus.id) : -1;
  const {
    items: rows,
    page,
    pageCount,
  } = paginate(
    matching,
    focusIndex === -1 ? requestedPage : Math.floor(focusIndex / pageSize) + 1,
    pageSize,
  );

  return {
    table,
    rows,
    page,
    pageCount,
    pageSize,
    total: matching.length,
    focus,
    setPage: goToPage,
    setPageSize: (size: number) => {
      setSize(size);
      goToPage(1);
    },
  };
}
