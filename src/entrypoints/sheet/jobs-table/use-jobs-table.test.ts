import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STATUSES, type Job } from '@/store/job';
import { localIso, makeJob } from '@/test-utils/make-job';
import { cleanup, settle } from '@/test-utils/render';
import { renderHook } from '@/test-utils/render-hook';
import type { JobRequest } from '@/utils/open-sheet';
import { DEFAULT_PAGE_SIZE, useJobsTable } from './use-jobs-table';

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

const setup = (jobs: readonly Job[]) => renderHook(() => useJobsTable(jobs));
type View = Awaited<ReturnType<typeof setup>>;

/** The ids on the current page, in row order. */
const ids = (view: View) => view.current.rows.map((row) => row.original.id);

const toggleSort = (view: View, column: string) =>
  settle(() => view.current.table.getColumn(column)!.toggleSorting());
const search = (view: View, text: string) => settle(() => view.current.table.setGlobalFilter(text));
const pick = (view: View, column: string, value: string) =>
  settle(() => view.current.table.getColumn(column)!.setFilterValue(value));

/** `count` jobs, `seek:1` the oldest. */
const manyJobs = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeJob({
      id: `seek:${i + 1}`,
      title: `Job ${i + 1}`,
      savedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    }),
  );

describe('useJobsTable', () => {
  describe('sorting', () => {
    it('lists the newest first, by applied date when a job has one', async () => {
      const oldest = makeJob({ id: 'seek:1', savedAt: localIso(2026, 10, 1) });
      const applied = makeJob({
        id: 'seek:2',
        savedAt: localIso(2026, 10, 2),
        appliedAt: localIso(2026, 10, 5),
      });
      const middle = makeJob({ id: 'seek:3', savedAt: localIso(2026, 10, 3) });

      const view = await setup([oldest, applied, middle]);

      expect(ids(view)).toEqual(['seek:2', 'seek:3', 'seek:1']);
    });

    it('starts sorted by date, newest first', async () => {
      const view = await setup([makeJob()]);

      expect(view.current.table.getColumn('date')!.getIsSorted()).toBe('desc');
    });

    it('identifies each row by its job id, so an edit stays with its job when the order changes', async () => {
      const view = await setup([makeJob({ id: 'seek:1' }), makeJob({ id: 'linkedin:2' })]);

      expect(view.current.rows.map((row) => row.id)).toEqual(['linkedin:2', 'seek:1']);
    });

    it('does not reorder the array it was given', async () => {
      const first = makeJob({ id: 'seek:1', savedAt: localIso(2026, 10, 1) });
      const second = makeJob({ id: 'seek:2', savedAt: localIso(2026, 10, 2) });
      const jobs = [first, second];

      await setup(jobs);

      expect(jobs).toEqual([first, second]);
    });

    it('sorts oldest first when the date is toggled', async () => {
      const older = makeJob({ id: 'seek:1', savedAt: localIso(2026, 10, 1) });
      const newer = makeJob({ id: 'seek:2', savedAt: localIso(2026, 10, 2) });
      const view = await setup([newer, older]);

      await toggleSort(view, 'date');

      expect(ids(view)).toEqual(['seek:1', 'seek:2']);
    });

    describe('text columns', () => {
      const titled = (id: string, title: string) => makeJob({ id, title });

      it('sorts a to z on the first toggle, ignoring case', async () => {
        const view = await setup([
          titled('seek:1', 'banana'),
          titled('seek:2', 'Cherry'),
          titled('seek:3', 'Apple'),
        ]);

        await toggleSort(view, 'title');

        expect(ids(view)).toEqual(['seek:3', 'seek:1', 'seek:2']);
      });

      it('sorts z to a on the second toggle', async () => {
        const view = await setup([
          titled('seek:1', 'banana'),
          titled('seek:2', 'Cherry'),
          titled('seek:3', 'Apple'),
        ]);

        await toggleSort(view, 'title');
        await toggleSort(view, 'title');

        expect(ids(view)).toEqual(['seek:2', 'seek:1', 'seek:3']);
      });

      it('keeps alternating between the two directions', async () => {
        const view = await setup([titled('seek:1', 'b'), titled('seek:2', 'a')]);

        await toggleSort(view, 'title');
        await toggleSort(view, 'title');
        await toggleSort(view, 'title');

        expect(view.current.table.getColumn('title')!.getIsSorted()).toBe('asc');
      });

      it('puts numbers in numeric order', async () => {
        const view = await setup([
          titled('seek:1', 'Job 10'),
          titled('seek:2', 'Job 9'),
          titled('seek:3', 'Job 100'),
        ]);

        await toggleSort(view, 'title');

        expect(ids(view)).toEqual(['seek:2', 'seek:1', 'seek:3']);
      });

      it.each(['company', 'location'] as const)('sorts by %s', async (column) => {
        const view = await setup([
          makeJob({ id: 'seek:1', [column]: 'Perth' }),
          makeJob({ id: 'seek:2', [column]: 'Adelaide' }),
        ]);

        await toggleSort(view, column);

        expect(ids(view)).toEqual(['seek:2', 'seek:1']);
      });

      it('sorts a salary of $90k before a salary of $100k', async () => {
        const view = await setup([
          makeJob({ id: 'seek:1', salary: '$100k' }),
          makeJob({ id: 'seek:2', salary: '$90k' }),
        ]);

        await toggleSort(view, 'salary');

        expect(ids(view)).toEqual(['seek:2', 'seek:1']);
      });
    });

    describe('blank values', () => {
      const jobs = [
        makeJob({ id: 'seek:1', salary: undefined }),
        makeJob({ id: 'seek:2', salary: '$90k' }),
        makeJob({ id: 'seek:3', salary: '   ' }),
        makeJob({ id: 'seek:4', salary: '$120k' }),
      ];

      it('come last when ascending', async () => {
        const view = await setup(jobs);

        await toggleSort(view, 'salary');

        expect(ids(view).slice(0, 2)).toEqual(['seek:2', 'seek:4']);
      });

      it('come last when descending', async () => {
        const view = await setup(jobs);

        await toggleSort(view, 'salary');
        await toggleSort(view, 'salary');

        expect(ids(view).slice(0, 2)).toEqual(['seek:4', 'seek:2']);
      });

      it('go newest first among themselves', async () => {
        const view = await setup([
          makeJob({ id: 'seek:1', savedAt: localIso(2026, 10, 1) }),
          makeJob({ id: 'seek:2', savedAt: localIso(2026, 10, 2), salary: '  ' }),
          makeJob({ id: 'seek:3', savedAt: localIso(2026, 10, 3), salary: '$90k' }),
        ]);

        await toggleSort(view, 'salary');

        expect(ids(view)).toEqual(['seek:3', 'seek:2', 'seek:1']);
      });

      it.each([
        { column: 'workArrangement', low: 'Hybrid', high: 'Remote' },
        { column: 'employmentType', low: 'Casual', high: 'Part-time' },
      ] as const)('come last in the $column column', async ({ column, low, high }) => {
        const view = await setup([
          makeJob({ id: 'seek:1' }),
          makeJob({ id: 'seek:2', [column]: high }),
          makeJob({ id: 'seek:3', [column]: low }),
        ]);

        await toggleSort(view, column);
        expect(ids(view)).toEqual(['seek:3', 'seek:2', 'seek:1']);

        await toggleSort(view, column);
        expect(ids(view)).toEqual(['seek:2', 'seek:3', 'seek:1']);
      });
    });

    it('sorts the sources alphabetically', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', source: 'seek' }),
        makeJob({ id: 'manual:2', source: 'other' }),
        makeJob({ id: 'linkedin:3', source: 'linkedin' }),
      ]);

      await toggleSort(view, 'source');

      expect(ids(view)).toEqual(['linkedin:3', 'manual:2', 'seek:1']);
    });

    describe('status', () => {
      const inOrder = Array.from(STATUSES);
      const jobs = Array.from(STATUSES)
        .reverse()
        .map((status, i) => makeJob({ id: `seek:${i}`, status }));
      const statuses = (view: View) => view.current.rows.map((row) => row.original.status);

      it('follows the pipeline order when ascending', async () => {
        const view = await setup(jobs);

        await toggleSort(view, 'status');

        expect(statuses(view)).toEqual(inOrder);
      });

      it('follows the reverse pipeline order when descending', async () => {
        const view = await setup(jobs);

        await toggleSort(view, 'status');
        await toggleSort(view, 'status');

        expect(statuses(view)).toEqual(inOrder.reverse());
      });
    });

    describe('ties', () => {
      const older = makeJob({ id: 'seek:1', title: 'Engineer', savedAt: localIso(2026, 10, 1) });
      const newer = makeJob({ id: 'seek:2', title: 'ENGINEER', savedAt: localIso(2026, 10, 2) });

      it('go newest first when ascending', async () => {
        const view = await setup([older, newer]);

        await toggleSort(view, 'title');

        expect(ids(view)).toEqual(['seek:2', 'seek:1']);
      });

      it('go newest first when descending', async () => {
        const view = await setup([older, newer]);

        await toggleSort(view, 'title');
        await toggleSort(view, 'title');

        expect(ids(view)).toEqual(['seek:2', 'seek:1']);
      });

      it('fall back to the id when the dates are equal too', async () => {
        const view = await setup([makeJob({ id: 'seek:2' }), makeJob({ id: 'seek:1' })]);

        expect(ids(view)).toEqual(['seek:1', 'seek:2']);
        await toggleSort(view, 'date');
        expect(ids(view)).toEqual(['seek:1', 'seek:2']);
      });
    });

    it('starts the date column newest first after another column was sorted', async () => {
      const view = await setup([makeJob()]);
      await toggleSort(view, 'title');

      await toggleSort(view, 'date');

      expect(view.current.table.getColumn('date')!.getIsSorted()).toBe('desc');
    });

    it('starts a column ascending even when no job has a value in it', async () => {
      const view = await setup([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await toggleSort(view, 'salary');

      expect(view.current.table.getColumn('salary')!.getIsSorted()).toBe('asc');
    });

    it('starts another column ascending', async () => {
      const view = await setup([makeJob()]);

      await toggleSort(view, 'company');

      expect(view.current.table.getColumn('company')!.getIsSorted()).toBe('asc');
    });

    it('cannot sort the notes or the actions', async () => {
      const view = await setup([makeJob()]);

      expect(view.current.table.getColumn('notes')!.getCanSort()).toBe(false);
      expect(view.current.table.getColumn('actions')!.getCanSort()).toBe(false);
    });
  });

  describe('search', () => {
    const jobs = [
      makeJob({ id: 'seek:1', title: 'Platform Engineer', company: 'Acme', location: 'Perth' }),
      makeJob({ id: 'seek:2', title: 'Designer', company: 'Engine Co', notes: 'warm intro' }),
      makeJob({ id: 'seek:3', title: 'Analyst', company: 'Globex' }),
    ];
    const found = async (text: string) => {
      const view = await setup(jobs);
      await search(view, text);
      return ids(view);
    };

    it('matches the title, ignoring case', async () => {
      expect(await found('PLATFORM')).toEqual(['seek:1']);
    });

    it('matches the company, ignoring case', async () => {
      expect(await found('globex')).toEqual(['seek:3']);
    });

    it('matches part of a word', async () => {
      expect(await found('engine')).toEqual(['seek:1', 'seek:2']);
    });

    it('ignores spaces around the search text', async () => {
      expect(await found('   acme  ')).toEqual(['seek:1']);
    });

    it('matches neither the location nor the notes', async () => {
      expect(await found('perth')).toEqual([]);
      expect(await found('warm intro')).toEqual([]);
    });

    it.each(['', '   '])('treats %j as no search', async (blank) => {
      expect(await found(blank)).toEqual(['seek:1', 'seek:2', 'seek:3']);
    });

    it('returns nothing when no job matches', async () => {
      expect(await found('zzz')).toEqual([]);
    });

    it('lists a job with no title and no company when the search is spaces only', async () => {
      const view = await setup([makeJob({ id: 'seek:1', title: '', company: '' })]);

      await search(view, '   ');

      expect(ids(view)).toEqual(['seek:1']);
    });

    it('matches a job whose title is blank by its company', async () => {
      const view = await setup([makeJob({ id: 'seek:1', title: '', company: 'Acme' })]);

      await search(view, 'acme');

      expect(ids(view)).toEqual(['seek:1']);
    });
  });

  describe('the pickers', () => {
    it('keep only the jobs with the chosen status', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', status: 'Applied' }),
        makeJob({ id: 'seek:2', status: 'Offer' }),
        makeJob({ id: 'seek:3', status: 'Applied' }),
      ]);

      await pick(view, 'status', 'Applied');

      expect(ids(view)).toEqual(['seek:1', 'seek:3']);
    });

    it('keep only the jobs from the chosen source', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', source: 'seek' }),
        makeJob({ id: 'linkedin:2', source: 'linkedin' }),
        makeJob({ id: 'manual:3', source: 'other' }),
      ]);

      await pick(view, 'source', 'linkedin');

      expect(ids(view)).toEqual(['linkedin:2']);
    });

    it('keep only the jobs with the chosen work arrangement', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', workArrangement: 'Remote' }),
        makeJob({ id: 'seek:2', workArrangement: 'Hybrid' }),
        makeJob({ id: 'seek:3' }),
      ]);

      await pick(view, 'workArrangement', 'Remote');

      expect(ids(view)).toEqual(['seek:1']);
    });

    it('keep only the jobs with the chosen employment type', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', employmentType: 'Contract' }),
        makeJob({ id: 'seek:2', employmentType: 'Casual' }),
        makeJob({ id: 'seek:3' }),
      ]);

      await pick(view, 'employmentType', 'Contract');

      expect(ids(view)).toEqual(['seek:1']);
    });

    it('show every job again when set back to the empty value', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', status: 'Applied' }),
        makeJob({ id: 'seek:2', status: 'Offer' }),
      ]);
      await pick(view, 'status', 'Applied');

      await pick(view, 'status', '');

      expect(ids(view)).toEqual(['seek:1', 'seek:2']);
      expect(view.current.table.state.columnFilters).toEqual([]);
    });

    it('clear together with the search', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', title: 'Engineer', status: 'Applied' }),
        makeJob({ id: 'seek:2', title: 'Designer', status: 'Offer' }),
      ]);
      await pick(view, 'status', 'Applied');
      await search(view, 'zzz');

      await settle(() => {
        view.current.table.resetColumnFilters(true);
        view.current.table.setGlobalFilter('');
      });

      expect(ids(view)).toEqual(['seek:1', 'seek:2']);
    });

    it('keep the sort order of the jobs that remain', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', title: 'B', status: 'Applied' }),
        makeJob({ id: 'seek:2', title: 'C', status: 'Offer' }),
        makeJob({ id: 'seek:3', title: 'A', status: 'Applied' }),
      ]);
      await toggleSort(view, 'title');

      await pick(view, 'status', 'Applied');

      expect(ids(view)).toEqual(['seek:3', 'seek:1']);
    });
  });

  it('keeps only the jobs that match the search and every picker', async () => {
    const view = await setup([
      makeJob({ id: 'seek:1', title: 'Engineer', status: 'Applied', workArrangement: 'Remote' }),
      makeJob({ id: 'seek:2', title: 'Engineer', status: 'Offer', workArrangement: 'Remote' }),
      makeJob({ id: 'seek:3', title: 'Designer', status: 'Applied', workArrangement: 'Remote' }),
      makeJob({ id: 'seek:4', title: 'Engineer', status: 'Applied', workArrangement: 'Hybrid' }),
    ]);

    await search(view, 'engineer');
    await pick(view, 'status', 'Applied');
    await pick(view, 'workArrangement', 'Remote');

    expect(ids(view)).toEqual(['seek:1']);
  });

  describe('paging', () => {
    const jobs = manyJobs(120);

    it('shows one page of the newest jobs, 50 to a page', async () => {
      const view = await setup(jobs);

      expect(DEFAULT_PAGE_SIZE).toBe(50);
      expect(view.current.rows).toHaveLength(50);
      expect(ids(view)[0]).toBe('seek:120');
      expect(ids(view)[49]).toBe('seek:71');
    });

    it('reports the page, the number of pages and the number of matching jobs', async () => {
      const view = await setup(jobs);

      expect(view.current).toMatchObject({ page: 1, pageCount: 3, pageSize: 50, total: 120 });
    });

    it('moves to another page', async () => {
      const view = await setup(jobs);

      await settle(() => view.current.setPage(2));

      expect(view.current.page).toBe(2);
      expect(ids(view)[0]).toBe('seek:70');
    });

    it('shows what is left on the last page', async () => {
      const view = await setup(jobs);

      await settle(() => view.current.setPage(3));

      expect(view.current.rows).toHaveLength(20);
      expect(ids(view)[19]).toBe('seek:1');
    });

    it('moves a page past the end back to the last page', async () => {
      const view = await setup(jobs);

      await settle(() => view.current.setPage(9));

      expect(view.current.page).toBe(3);
    });

    it('moves page 0 forward to the first page', async () => {
      const view = await setup(jobs);

      await settle(() => view.current.setPage(0));

      expect(view.current.page).toBe(1);
    });

    it('shows as many rows as the page size says', async () => {
      const view = await setup(jobs);

      await settle(() => view.current.setPageSize(10));

      expect(view.current).toMatchObject({ pageSize: 10, pageCount: 12 });
      expect(view.current.rows).toHaveLength(10);
    });

    it('goes back to page 1 when the page size changes', async () => {
      const view = await setup(jobs);
      await settle(() => view.current.setPage(2));

      await settle(() => view.current.setPageSize(25));

      expect(view.current.page).toBe(1);
    });

    it('counts the matching jobs and not all of them', async () => {
      const view = await setup(jobs);

      await search(view, 'Job 11');

      expect(view.current).toMatchObject({ total: 11, pageCount: 1 });
    });

    it('goes back to page 1 when the search changes', async () => {
      const view = await setup(jobs);
      await settle(() => view.current.setPage(2));

      await search(view, 'Job');

      expect(view.current.page).toBe(1);
    });

    it('goes back to page 1 when a picker changes', async () => {
      const view = await setup(jobs);
      await settle(() => view.current.setPage(2));

      await pick(view, 'status', 'Interested');

      expect(view.current.page).toBe(1);
    });

    it('goes back to page 1 when the sort changes', async () => {
      const view = await setup(jobs);
      await settle(() => view.current.setPage(2));

      await toggleSort(view, 'title');

      expect(view.current.page).toBe(1);
    });
  });

  describe('column visibility', () => {
    const ALL_COLUMNS = [
      'date',
      'title',
      'company',
      'location',
      'workArrangement',
      'employmentType',
      'salary',
      'source',
      'status',
      'notes',
      'actions',
    ];
    const visible = (view: View) =>
      view.current.table.getVisibleLeafColumns().map((column) => column.id);
    const hide = (view: View, column: string) =>
      settle(() => view.current.table.getColumn(column)!.toggleVisibility(false));

    it('shows every column to begin with', async () => {
      const view = await setup([makeJob()]);

      expect(visible(view)).toEqual(ALL_COLUMNS);
    });

    it('hides a column', async () => {
      const view = await setup([makeJob()]);

      await hide(view, 'salary');

      expect(visible(view)).toEqual(ALL_COLUMNS.filter((id) => id !== 'salary'));
    });

    it('shows a hidden column again', async () => {
      const view = await setup([makeJob()]);
      await hide(view, 'salary');

      await settle(() => view.current.table.getColumn('salary')!.toggleVisibility(true));

      expect(visible(view)).toEqual(ALL_COLUMNS);
    });

    it.each(['title', 'actions'])('cannot hide the %s column', async (column) => {
      const view = await setup([makeJob()]);

      await hide(view, column);

      expect(view.current.table.getColumn(column)!.getCanHide()).toBe(false);
      expect(visible(view)).toEqual(ALL_COLUMNS);
    });

    it.each(ALL_COLUMNS.filter((id) => id !== 'title' && id !== 'actions'))(
      'can hide the %s column',
      async (column) => {
        const view = await setup([makeJob()]);

        expect(view.current.table.getColumn(column)!.getCanHide()).toBe(true);
      },
    );

    it('remembers the hidden columns on the next visit', async () => {
      const first = await setup([makeJob()]);
      await hide(first, 'salary');
      await cleanup();

      const second = await setup([makeJob()]);

      expect(visible(second)).toEqual(ALL_COLUMNS.filter((id) => id !== 'salary'));
    });

    it('returns the sort to newest first when the sorted column is hidden', async () => {
      const view = await setup([makeJob()]);
      await toggleSort(view, 'company');

      await hide(view, 'company');

      expect(view.current.table.state.sorting).toEqual([{ id: 'date', desc: true }]);
    });

    it('keeps the sort when another column is hidden', async () => {
      const view = await setup([makeJob()]);
      await toggleSort(view, 'company');

      await hide(view, 'salary');

      expect(view.current.table.state.sorting).toEqual([{ id: 'company', desc: false }]);
    });

    it('goes back to page 1 when hiding the sorted column resets the sort', async () => {
      const view = await setup(manyJobs(120));
      await toggleSort(view, 'company');
      await settle(() => view.current.setPage(2));

      await hide(view, 'company');

      expect(view.current.page).toBe(1);
    });

    it('stays on the page when the date is hidden while the list is newest first', async () => {
      const view = await setup(manyJobs(120));
      await settle(() => view.current.setPage(2));

      await hide(view, 'date');

      expect(view.current.page).toBe(2);
    });

    it('returns to newest first when the date is hidden while it sorts oldest first', async () => {
      const view = await setup([makeJob()]);
      await toggleSort(view, 'date');

      await hide(view, 'date');

      expect(view.current.table.state.sorting).toEqual([{ id: 'date', desc: true }]);
    });

    it('stays on the page when a column that is not sorted is hidden', async () => {
      const view = await setup(manyJobs(120));
      await settle(() => view.current.setPage(2));

      await hide(view, 'salary');

      expect(view.current.page).toBe(2);
    });

    it('still filters by a hidden column', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', status: 'Applied' }),
        makeJob({ id: 'seek:2', status: 'Offer' }),
      ]);
      await hide(view, 'status');

      await pick(view, 'status', 'Applied');

      expect(ids(view)).toEqual(['seek:1']);
    });

    it('still searches the company when its column is hidden', async () => {
      const view = await setup([
        makeJob({ id: 'seek:1', company: 'Acme' }),
        makeJob({ id: 'seek:2', company: 'Globex' }),
      ]);
      await hide(view, 'company');

      await search(view, 'acme');

      expect(ids(view)).toEqual(['seek:1']);
    });
  });
});

describe('useJobsTable: showing a requested job', () => {
  const jobs = manyJobs(120);

  /** The table with a way to send it requests, as the sheet does from its address. */
  const setupWithRequests = (stored: readonly Job[], first?: JobRequest) =>
    renderHook(() => {
      const [request, setRequest] = useState(first);
      return { list: useJobsTable(stored, request), request: setRequest };
    });
  type RequestView = Awaited<ReturnType<typeof setupWithRequests>>;

  const pageIds = (view: RequestView) => view.current.list.rows.map((row) => row.original.id);
  const ask = (view: RequestView, id: string, token = `#job=${id}&t=1`) =>
    settle(() => view.current.request({ id, token }));

  const toggleTitleSort = (view: RequestView) =>
    settle(() => view.current.list.table.getColumn('title')!.toggleSorting());
  const searchFor = (view: RequestView, text: string) =>
    settle(() => view.current.list.table.setGlobalFilter(text));
  const pickStatus = (view: RequestView, value: string) =>
    settle(() => view.current.list.table.getColumn('status')!.setFilterValue(value));

  it('goes to the page that holds the job', async () => {
    const view = await setupWithRequests(jobs);

    await ask(view, 'seek:10');

    expect(view.current.list.page).toBe(3);
    expect(pageIds(view)).toContain('seek:10');
  });

  it('stays on the first page when the job is on it', async () => {
    const view = await setupWithRequests(jobs);

    await ask(view, 'seek:100');

    expect(view.current.list.page).toBe(1);
  });

  it('counts pages of the size in use', async () => {
    const view = await setupWithRequests(jobs);
    await settle(() => view.current.list.setPageSize(10));

    await ask(view, 'seek:100');

    expect(view.current.list.page).toBe(3);
  });

  it('counts pages in the order the table is sorted in', async () => {
    const view = await setupWithRequests(jobs);
    await toggleTitleSort(view);

    await ask(view, 'seek:120');

    expect(view.current.list.page).toBe(3);
  });

  it('shows the job a request made before the first render asks for', async () => {
    const view = await setupWithRequests(jobs, { id: 'seek:10', token: '#job=seek:10&t=1' });

    expect(view.current.list.page).toBe(3);
  });

  it('puts the job in focus', async () => {
    const view = await setupWithRequests(jobs);

    await ask(view, 'seek:10', '#job=seek:10&t=7');

    expect(view.current.list.focus).toEqual({ id: 'seek:10', token: '#job=seek:10&t=7' });
  });

  it('clears a search that hides the job', async () => {
    const view = await setupWithRequests(jobs);
    await searchFor(view, 'Job 11');

    await ask(view, 'seek:5');

    expect(view.current.list.table.state.globalFilter).toBe('');
    expect(view.current.list.total).toBe(120);
  });

  it('clears the filters that hide the job', async () => {
    const view = await setupWithRequests(jobs);
    await pickStatus(view, 'Offer');

    await ask(view, 'seek:5');

    expect(view.current.list.table.state.columnFilters).toEqual([]);
    expect(view.current.list.total).toBe(120);
  });

  it('ignores a request for a job that is not stored', async () => {
    const view = await setupWithRequests(jobs);
    await searchFor(view, 'Job 11');

    await ask(view, 'seek:999');

    expect(view.current.list.focus).toBeUndefined();
    expect(view.current.list.total).toBe(11);
  });

  it('does not pull the table back to a job it has already shown', async () => {
    const view = await setupWithRequests(jobs);
    await ask(view, 'seek:10', '#job=seek:10&t=1');
    await settle(() => view.current.list.setPage(1));

    await ask(view, 'seek:10', '#job=seek:10&t=1');

    expect(view.current.list.page).toBe(1);
  });

  it('goes back to the job when it is asked for again', async () => {
    const view = await setupWithRequests(jobs);
    await ask(view, 'seek:10', '#job=seek:10&t=1');
    await settle(() => view.current.list.setPage(1));

    await ask(view, 'seek:10', '#job=seek:10&t=2');

    expect(view.current.list.page).toBe(3);
    expect(view.current.list.focus?.token).toBe('#job=seek:10&t=2');
  });

  describe('once the user moves on', () => {
    const actions: [string, (view: RequestView) => Promise<void>][] = [
      ['picks a page', (view) => settle(() => view.current.list.setPage(1))],
      ['changes the page size', (view) => settle(() => view.current.list.setPageSize(25))],
      ['changes the sort', toggleTitleSort],
      ['searches', (view) => searchFor(view, 'Job')],
      ['picks a filter', (view) => pickStatus(view, 'Interested')],
      [
        'hides the sorted column',
        async (view) => {
          await settle(() => view.current.list.table.getColumn('salary')!.toggleSorting());
          await ask(view, 'seek:10', '#job=seek:10&t=2');
          await settle(() => view.current.list.table.getColumn('salary')!.toggleVisibility(false));
        },
      ],
    ];

    it.each(actions)('takes the job out of focus when the user %s', async (_, act) => {
      const view = await setupWithRequests(jobs);
      await ask(view, 'seek:10', '#job=seek:10&t=1');
      expect(view.current.list.focus).toBeDefined();

      await act(view);

      expect(view.current.list.focus).toBeUndefined();
    });

    it('keeps the job in focus when a column that is not sorted is hidden', async () => {
      const view = await setupWithRequests(jobs);
      await ask(view, 'seek:10');

      await settle(() => view.current.list.table.getColumn('salary')!.toggleVisibility(false));

      expect(view.current.list.focus).toBeDefined();
    });
  });
});
