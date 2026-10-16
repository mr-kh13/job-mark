import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@/store/job';
import { localIso, makeJob } from '@/test-utils/make-job';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { openSelect, pickOption } from '@/test-utils/select';
import { typeInto } from '@/test-utils/text-field';
import { JobsTableToolbar } from './jobs-table-toolbar';
import { useJobsTable } from './use-jobs-table';

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

/** The toolbar over a table, with the titles that get through listed below it. */
function Harness({ jobs }: { jobs: readonly Job[] }) {
  const { table, rows } = useJobsTable(jobs);
  return (
    <>
      <JobsTableToolbar table={table} />
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
    company: 'Acme',
    status: 'Applied',
    savedAt: localIso(2026, 10, 3),
  }),
  makeJob({
    id: 'linkedin:2',
    title: 'Platform Designer',
    company: 'Globex',
    status: 'Offer',
    savedAt: localIso(2026, 10, 2),
  }),
  makeJob({
    id: 'manual:3',
    title: 'Analyst',
    company: 'Initech',
    status: 'Applied',
    savedAt: localIso(2026, 10, 1),
  }),
];

const byLabel = <T extends HTMLElement = HTMLElement>(screen: HTMLElement, label: string) =>
  screen.querySelector<T>(`[aria-label="${label}"]`)!;

const listed = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('li')).map((item) => item.textContent);

const searchBox = (screen: HTMLElement) =>
  byLabel<HTMLInputElement>(screen, 'Search title or company');

const filtersButton = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('button')).find((b) =>
    b.textContent.trim().startsWith('Filters'),
  )!;

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;

describe('JobsTableToolbar', () => {
  describe('search', () => {
    it('narrows the jobs as text is typed', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      await typeInto(searchBox(screen), 'engineer');

      expect(listed(screen)).toEqual(['Platform Engineer']);
    });

    it('shows the text that was typed', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      await typeInto(searchBox(screen), 'engineer');

      expect(searchBox(screen).value).toBe('engineer');
    });

    it('starts empty', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      expect(searchBox(screen).value).toBe('');
    });

    it('lists every job again once the text is cleared', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await typeInto(searchBox(screen), 'engineer');

      await typeInto(searchBox(screen), '');

      expect(listed(screen)).toHaveLength(3);
    });
  });

  it('has a Filters button and a Columns button', async () => {
    const screen = await render(<Harness jobs={jobs} />);

    expect(filtersButton(screen)).toBeDefined();
    expect(buttonNamed(screen, 'Columns')).toBeDefined();
  });

  it('has no picker outside the Filters dialog', async () => {
    const screen = await render(<Harness jobs={jobs} />);

    expect(screen.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(0);
  });

  it('does not count the search on the Filters button', async () => {
    const screen = await render(<Harness jobs={jobs} />);

    await typeInto(searchBox(screen), 'engineer');

    expect(filtersButton(screen).querySelector('[data-slot="badge"]')).toBeNull();
  });

  describe('search and pickers together', () => {
    const pickStatus = async (screen: HTMLElement, status: string) => {
      await settle(() => filtersButton(screen).click());
      await openSelect(fieldFor<HTMLElement>(dialog(), 'Status'));
      await pickOption(status);
    };

    it('keep only the jobs that match both', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await typeInto(searchBox(screen), 'platform');

      await pickStatus(screen, 'Offer');

      expect(listed(screen)).toEqual(['Platform Designer']);
    });

    it('keep the search when the pickers are cleared', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await typeInto(searchBox(screen), 'platform');
      await pickStatus(screen, 'Offer');

      await settle(() => buttonNamed(dialog(), 'Clear filters').click());

      expect(searchBox(screen).value).toBe('platform');
      expect(listed(screen)).toEqual(['Platform Engineer', 'Platform Designer']);
    });
  });
});
