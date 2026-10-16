import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/store/job';
import { makeJob } from '@/test-utils/make-job';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { openSelect, pickOption, selectOptions } from '@/test-utils/select';
import { JobsTableFiltersDialog } from './jobs-table-filters-dialog';
import { useJobsTable } from './use-jobs-table';

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

/** The Filters button over a table, with the titles that get through listed below it. */
function Harness({ jobs }: { jobs: readonly Job[] }) {
  const { table, rows } = useJobsTable(jobs);
  return (
    <>
      <JobsTableFiltersDialog table={table} />
      <ul>
        {rows.map((row) => (
          <li key={row.id}>{row.original.title}</li>
        ))}
      </ul>
    </>
  );
}

const jobs = [
  makeJob({
    id: 'seek:1',
    title: 'Platform Engineer',
    status: 'Applied',
    source: 'seek',
    workArrangement: 'Remote',
    employmentType: 'Contract',
  }),
  makeJob({
    id: 'linkedin:2',
    title: 'Designer',
    status: 'Offer',
    source: 'linkedin',
    workArrangement: 'Hybrid',
    employmentType: 'Full-time',
  }),
  makeJob({ id: 'manual:3', title: 'Analyst', source: 'other' }),
];

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const picker = (label: string) => fieldFor<HTMLElement>(dialog()!, label);
const listed = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('li')).map((item) => item.textContent);
const filtersButton = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('button')).find((b) =>
    b.textContent.trim().startsWith('Filters'),
  )!;
const badge = (screen: HTMLElement) => filtersButton(screen).querySelector('[data-slot="badge"]');
const open = (screen: HTMLElement) => settle(() => filtersButton(screen).click());
const pick = async (label: string, option: string) => {
  await openSelect(picker(label));
  await pickOption(option);
};

describe('JobsTableFiltersDialog', () => {
  it('has a Filters button and no dialog until it is clicked', async () => {
    const screen = await render(<Harness jobs={jobs} />);

    expect(filtersButton(screen)).toBeDefined();
    expect(dialog()).toBeNull();
  });

  it('opens a dialog that says what it is for', async () => {
    const screen = await render(<Harness jobs={jobs} />);

    await open(screen);

    expect(dialog()?.textContent).toContain('Filters');
    expect(dialog()?.textContent).toContain('The table updates as you pick.');
  });

  it.each([
    { label: 'Status', any: 'Any status' },
    { label: 'Source', any: 'Any source' },
    { label: 'Work arrangement', any: 'Any arrangement' },
    { label: 'Employment type', any: 'Any employment' },
  ])('has a $label picker that starts at "$any"', async ({ label, any }) => {
    const screen = await render(<Harness jobs={jobs} />);

    await open(screen);

    expect(picker(label).textContent).toBe(any);
  });

  describe('the options', () => {
    it.each([
      {
        label: 'Status',
        options: [
          'Any status',
          'Interested',
          'Applied',
          'Interviewing',
          'Offer',
          'Rejected',
          'Withdrawn',
          'No response',
        ],
      },
      { label: 'Source', options: ['Any source', 'Seek', 'LinkedIn', 'Other'] },
      {
        label: 'Work arrangement',
        options: ['Any arrangement', 'On-site', 'Hybrid', 'Remote'],
      },
      {
        label: 'Employment type',
        options: ['Any employment', 'Full-time', 'Part-time', 'Contract', 'Casual', 'Internship'],
      },
    ])('of the $label picker are $options', async ({ label, options }) => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);

      await openSelect(picker(label));

      expect(selectOptions().map((option) => option.textContent)).toEqual(options);
    });
  });

  describe('picking', () => {
    it.each([
      { label: 'Status', option: 'Offer', expected: ['Designer'] },
      { label: 'Source', option: 'LinkedIn', expected: ['Designer'] },
      { label: 'Work arrangement', option: 'Remote', expected: ['Platform Engineer'] },
      { label: 'Employment type', option: 'Full-time', expected: ['Designer'] },
    ])('$option in the $label picker narrows the jobs', async ({ label, option, expected }) => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);

      await pick(label, option);

      expect(listed(screen)).toEqual(expected);
      expect(picker(label).textContent).toBe(option);
    });

    it('lists every job again once a picker is set back to "Any status"', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);
      await pick('Status', 'Offer');

      await pick('Status', 'Any status');

      expect(listed(screen)).toHaveLength(3);
    });

    it('keeps only the jobs that match every picker', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);

      await pick('Status', 'Offer');
      await pick('Source', 'Seek');

      expect(listed(screen)).toEqual([]);
    });
  });

  describe('the count on the Filters button', () => {
    it('is missing while no picker is set', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      expect(badge(screen)).toBeNull();
    });

    it('counts the pickers that are set', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);

      await pick('Status', 'Offer');
      expect(badge(screen)?.textContent).toBe('1');

      await pick('Source', 'LinkedIn');
      expect(badge(screen)?.textContent).toBe('2');
    });

    it('drops a picker that is set back to "Any"', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);
      await pick('Status', 'Offer');
      await pick('Source', 'LinkedIn');

      await pick('Status', 'Any status');

      expect(badge(screen)?.textContent).toBe('1');
    });
  });

  describe('Clear filters', () => {
    it('sets every picker back to "Any" and lists every job', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);
      await pick('Status', 'Offer');
      await pick('Source', 'LinkedIn');

      await settle(() => buttonNamed(dialog()!, 'Clear filters').click());

      expect(listed(screen)).toHaveLength(3);
      expect(picker('Status').textContent).toBe('Any status');
      expect(picker('Source').textContent).toBe('Any source');
      expect(badge(screen)).toBeNull();
    });
  });

  describe('Done', () => {
    it('closes the dialog and keeps the filters', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);
      await pick('Status', 'Offer');

      await settle(() => buttonNamed(dialog()!, 'Done').click());

      await vi.waitFor(() => expect(dialog()).toBeNull());
      expect(listed(screen)).toEqual(['Designer']);
    });

    it('is followed by a dialog that still shows what was picked', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await open(screen);
      await pick('Status', 'Offer');
      await settle(() => buttonNamed(dialog()!, 'Done').click());
      await vi.waitFor(() => expect(dialog()).toBeNull());

      await open(screen);

      expect(picker('Status').textContent).toBe('Offer');
    });
  });
});
