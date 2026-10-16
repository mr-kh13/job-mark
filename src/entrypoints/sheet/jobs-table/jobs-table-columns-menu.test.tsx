import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Job } from '@/store/job';
import { makeJob } from '@/test-utils/make-job';
import { openMenu } from '@/test-utils/menu';
import { buttonNamed } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { JobsTable } from './jobs-table';
import { JobsTableColumnsMenu } from './jobs-table-columns-menu';
import { COLUMNS_STORAGE_KEY } from './use-column-visibility';
import { useJobsTable } from './use-jobs-table';

beforeEach(() => {
  fakeBrowser.reset();
  localStorage.clear();
});

afterEach(cleanup);

/** The menu over a table, so a hidden column can be seen to leave the table. */
function Harness({ jobs }: { jobs: readonly Job[] }) {
  const { table, rows } = useJobsTable(jobs);
  return (
    <>
      <JobsTableColumnsMenu table={table} />
      <JobsTable table={table} rows={rows} />
    </>
  );
}

const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'));
const item = (name: string) => items().find((candidate) => candidate.textContent === name)!;
const headers = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('thead th')).map((th) => th.textContent);

const openColumns = (screen: HTMLElement) => openMenu(buttonNamed(screen, 'Columns'));

describe('JobsTableColumnsMenu', () => {
  it('opens a list of the columns that can be hidden, in table order', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);

    await openColumns(screen);

    expect(items().map((candidate) => candidate.textContent)).toEqual([
      'Date',
      'Company',
      'Location',
      'Arrangement',
      'Employment',
      'Salary',
      'Source',
      'Status',
      'Notes',
    ]);
  });

  it('is closed until the button is clicked', async () => {
    await render(<Harness jobs={[makeJob()]} />);

    expect(items()).toHaveLength(0);
  });

  it('checks every column while all of them are shown', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);

    await openColumns(screen);

    expect(items().map((candidate) => candidate.getAttribute('aria-checked'))).toEqual(
      Array.from({ length: 9 }, () => 'true'),
    );
  });

  it('hides a column when its item is clicked', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);
    await openColumns(screen);

    await settle(() => item('Salary').click());

    expect(headers(screen)).not.toContain('Salary');
    expect(item('Salary').getAttribute('aria-checked')).toBe('false');
  });

  it('stays open so several columns can be toggled', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);
    await openColumns(screen);

    await settle(() => item('Salary').click());
    await settle(() => item('Notes').click());

    expect(headers(screen)).not.toContain('Salary');
    expect(headers(screen)).not.toContain('Notes');
    expect(items()).toHaveLength(9);
  });

  it('shows the column again when its item is clicked a second time', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);
    await openColumns(screen);
    await settle(() => item('Salary').click());

    await settle(() => item('Salary').click());

    expect(headers(screen)).toContain('Salary');
    expect(item('Salary').getAttribute('aria-checked')).toBe('true');
  });

  it('leaves the other columns in place', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);
    await openColumns(screen);

    await settle(() => item('Salary').click());

    expect(headers(screen)).toEqual([
      'Date',
      'Title',
      'Company',
      'Location',
      'Arrangement',
      'Employment',
      'Source',
      'Status',
      'Notes',
      'Actions',
    ]);
  });

  it('shows a column hidden on an earlier visit as unchecked', async () => {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify({ location: false }));
    const screen = await render(<Harness jobs={[makeJob()]} />);

    await openColumns(screen);

    expect(item('Location').getAttribute('aria-checked')).toBe('false');
    expect(item('Company').getAttribute('aria-checked')).toBe('true');
  });
});
