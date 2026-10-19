import { useState } from 'react';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import type { Job } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { localIso, makeJob } from '@/test-utils/make-job';
import { putJobs } from '@/test-utils/put-jobs';
import { buttonNamed } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { calledOn, stubScrollAndAnimate } from '@/test-utils/scroll-stubs';
import { openSelect, pickOption } from '@/test-utils/select';
import { leave, typeInto } from '@/test-utils/text-field';
import type { JobRequest } from '@/utils/open-sheet';
import { JobsTable } from './jobs-table';
import { COLUMNS_STORAGE_KEY } from './use-column-visibility';
import { useJobsTable } from './use-jobs-table';

beforeEach(() => {
  fakeBrowser.reset();
  localStorage.clear();
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

/** The table the way the sheet builds it: the first page of the jobs. */
function Harness({ jobs }: { jobs: readonly Job[] }) {
  const { table, rows } = useJobsTable(jobs);
  return <JobsTable table={table} rows={rows} />;
}

const byLabel = <T extends HTMLElement = HTMLElement>(screen: HTMLElement, label: string) =>
  screen.querySelector<T>(`[aria-label="${label}"]`)!;

/** What a cell shows: the value of its text field, or else its text. */
const cellText = (cell: Element | undefined) => {
  const field = cell?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    '[data-slot="input"], [data-slot="textarea"]',
  );
  return field ? field.value : cell?.textContent;
};

/** Each body row as an object keyed by its column header. */
const readRows = (screen: HTMLElement) => {
  const headers = Array.from(screen.querySelectorAll('thead th')).map((th) => th.textContent);
  return Array.from(screen.querySelectorAll('tbody tr')).map((row) =>
    Object.fromEntries(headers.map((header, i) => [header, cellText(row.children[i])])),
  );
};

describe('JobsTable', () => {
  it('shows the listed date in local time', async () => {
    const job = makeJob({ appliedAt: localIso(2026, 10, 5, 9, 30) });

    const screen = await render(<Harness jobs={[job]} />);

    expect(readRows(screen)[0]?.Date).toBe('2026-10-05 09:30');
  });

  it("shows a job's details in their columns", async () => {
    const job = makeJob({
      title: 'Senior Engineer',
      company: 'Acme',
      location: 'Sydney NSW',
      workArrangement: 'Hybrid',
      employmentType: 'Full-time',
      salary: '$150k',
      source: 'linkedin',
      status: 'Interviewing',
      notes: 'Referral from Sam',
    });

    const screen = await render(<Harness jobs={[job]} />);

    expect(readRows(screen)[0]).toMatchObject({
      Title: 'Senior Engineer',
      Company: 'Acme',
      Location: 'Sydney NSW',
      Arrangement: 'Hybrid',
      Employment: 'Full-time',
      Salary: '$150k',
      Source: 'LinkedIn',
      Status: 'Interviewing',
      Notes: 'Referral from Sam',
    });
  });

  it('names every source', async () => {
    const jobs = [
      makeJob({ id: 'seek:1', source: 'seek', savedAt: localIso(2026, 10, 3) }),
      makeJob({ id: 'linkedin:2', source: 'linkedin', savedAt: localIso(2026, 10, 2) }),
      makeJob({ id: 'manual:3', source: 'other', savedAt: localIso(2026, 10, 1) }),
    ];

    const screen = await render(<Harness jobs={jobs} />);

    expect(readRows(screen).map((row) => row.Source)).toEqual(['Seek', 'LinkedIn', 'Other']);
  });

  it('shows a dash for the arrangement and employment that are not set, and no salary', async () => {
    const screen = await render(<Harness jobs={[makeJob()]} />);

    expect(readRows(screen)[0]).toMatchObject({ Arrangement: '-', Employment: '-', Salary: '' });
  });

  it('marks the jobs that need review', async () => {
    const flagged = makeJob({ id: 'seek:1', title: '', needsReview: true });
    const fine = makeJob({ id: 'seek:2', title: 'Fine', savedAt: localIso(2026, 10, 20) });

    const screen = await render(<Harness jobs={[flagged, fine]} />);

    const marked = screen.querySelectorAll('tbody tr[data-needs-review="true"]');
    expect(marked).toHaveLength(1);
    expect(cellText(marked[0]?.children[1])).toBe('');
  });

  it('has no link for a job without a URL', async () => {
    const screen = await render(<Harness jobs={[makeJob({ url: '' })]} />);

    expect(screen.querySelector('tbody a')).toBeNull();
  });

  it('links to the job in a new tab', async () => {
    const job = makeJob({ title: 'Engineer', url: 'https://au.seek.com/job/10000001' });

    const screen = await render(<Harness jobs={[job]} />);

    const link = screen.querySelector('tbody a')!;
    expect(link.getAttribute('href')).toBe('https://au.seek.com/job/10000001');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.getAttribute('aria-label')).toBe('Open Engineer in a new tab');
  });

  it('pins the actions to the right edge, so they stay in view when the table scrolls', async () => {
    const screen = await render(<Harness jobs={[makeJob({ title: 'Engineer' })]} />);

    const pinned = Array.from(screen.querySelectorAll('th.sticky, td.sticky'));

    expect(pinned).toHaveLength(2);
    expect(pinned[0]?.textContent).toBe('Actions');
    expect(pinned[1]?.contains(byLabel(screen, 'Delete Engineer'))).toBe(true);
  });

  it('changes a job’s status from its row', async () => {
    const job = makeJob({ title: 'Engineer' });
    await putJobs(job);
    const screen = await render(<Harness jobs={[job]} />);

    await openSelect(byLabel(screen, 'Status of Engineer'));
    await pickOption('Interviewing');

    await vi.waitFor(async () => expect((await jobStore.get(job.id))?.status).toBe('Interviewing'));
  });

  it('reports a status that cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = makeJob({ title: 'Engineer' });
    await putJobs(job);
    const screen = await render(<Harness jobs={[job]} />);
    const add = vi.spyOn(toast, 'add').mockReturnValue('toast-id');
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));

    await openSelect(byLabel(screen, 'Status of Engineer'));
    await pickOption('Interviewing');

    await vi.waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't change the status", type: 'error' }),
      ),
    );
    expect((await jobStore.get(job.id))?.status).toBe('Interested');
  });

  it('labels the status picker of a job without a title as "job"', async () => {
    const screen = await render(<Harness jobs={[makeJob({ title: '' })]} />);

    expect(byLabel(screen, 'Status of job')).not.toBeNull();
  });

  it('deletes a job from its row and leaves the others', async () => {
    const doomed = makeJob({ id: 'seek:1', title: 'Doomed' });
    const kept = makeJob({ id: 'seek:2', title: 'Kept' });
    await putJobs(doomed, kept);
    const screen = await render(<Harness jobs={[doomed, kept]} />);

    await settle(() => byLabel(screen, 'Delete Doomed').click());

    await vi.waitFor(async () =>
      expect((await jobStore.list()).map((job) => job.id)).toEqual(['seek:2']),
    );
  });

  it('labels the delete button of a job without a title as "job"', async () => {
    const screen = await render(<Harness jobs={[makeJob({ title: '' })]} />);

    expect(byLabel(screen, 'Delete job')).not.toBeNull();
  });

  describe('sorting from the header', () => {
    const jobs = [
      makeJob({ id: 'seek:1', title: 'banana' }),
      makeJob({ id: 'seek:2', title: 'Cherry' }),
      makeJob({ id: 'seek:3', title: 'Apple' }),
    ];
    const headerCell = (screen: HTMLElement, name: string) =>
      Array.from(screen.querySelectorAll('thead th')).find((th) => th.textContent === name)!;
    const sortedHeaders = (screen: HTMLElement) =>
      Array.from(screen.querySelectorAll('thead th[aria-sort]')).map((th) => th.textContent);
    const titles = (screen: HTMLElement) => readRows(screen).map((row) => row.Title);
    const clickHeader = (screen: HTMLElement, name: string) =>
      settle(() => buttonNamed(headerCell(screen, name), name).click());

    it.each([
      'Date',
      'Title',
      'Company',
      'Location',
      'Arrangement',
      'Employment',
      'Salary',
      'Source',
      'Status',
    ])('turns the %s header into a button', async (name) => {
      const screen = await render(<Harness jobs={jobs} />);

      expect(headerCell(screen, name).querySelector('button')).not.toBeNull();
    });

    it.each(['Notes', 'Actions'])('leaves the %s header as plain text', async (name) => {
      const screen = await render(<Harness jobs={jobs} />);

      expect(headerCell(screen, name).querySelector('button')).toBeNull();
    });

    it('marks the date as sorted, newest first, to begin with', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      expect(sortedHeaders(screen)).toEqual(['Date']);
      expect(headerCell(screen, 'Date').getAttribute('aria-sort')).toBe('descending');
    });

    it('sorts a column a to z when its header is clicked, and marks it', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      await clickHeader(screen, 'Title');

      expect(titles(screen)).toEqual(['Apple', 'banana', 'Cherry']);
      expect(headerCell(screen, 'Title').getAttribute('aria-sort')).toBe('ascending');
    });

    it('sorts z to a on the second click', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      await clickHeader(screen, 'Title');
      await clickHeader(screen, 'Title');

      expect(titles(screen)).toEqual(['Cherry', 'banana', 'Apple']);
      expect(headerCell(screen, 'Title').getAttribute('aria-sort')).toBe('descending');
    });

    it('sorts by one column only, even with the shift key held', async () => {
      const screen = await render(<Harness jobs={jobs} />);
      await clickHeader(screen, 'Title');

      await settle(() =>
        buttonNamed(headerCell(screen, 'Company'), 'Company').dispatchEvent(
          new MouseEvent('click', { bubbles: true, shiftKey: true }),
        ),
      );

      expect(sortedHeaders(screen)).toEqual(['Company']);
    });

    it('moves the mark to the header that was clicked last', async () => {
      const screen = await render(<Harness jobs={jobs} />);

      await clickHeader(screen, 'Title');
      await clickHeader(screen, 'Company');

      expect(sortedHeaders(screen)).toEqual(['Company']);
    });
  });

  describe('hidden columns', () => {
    const hide = (...columns: string[]) =>
      localStorage.setItem(
        COLUMNS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(columns.map((column) => [column, false]))),
      );
    const headers = (screen: HTMLElement) =>
      Array.from(screen.querySelectorAll('thead th')).map((th) => th.textContent);

    it('leave out the header and the cells of the column', async () => {
      hide('salary', 'notes');

      const screen = await render(<Harness jobs={[makeJob({ salary: '$90k' })]} />);

      expect(headers(screen)).not.toContain('Salary');
      expect(headers(screen)).not.toContain('Notes');
      expect(screen.querySelector('tbody tr')?.children).toHaveLength(9);
      expect(byLabel(screen, 'Salary')).toBeNull();
      expect(byLabel(screen, 'Notes')).toBeNull();
    });

    it('leave every other column as it was', async () => {
      hide('salary');

      const screen = await render(
        <Harness jobs={[makeJob({ title: 'Engineer', company: 'Acme', status: 'Offer' })]} />,
      );

      expect(readRows(screen)[0]).toMatchObject({
        Title: 'Engineer',
        Company: 'Acme',
        Status: 'Offer',
      });
    });

    it('are left out of the no-match row too', async () => {
      hide('salary', 'notes');

      const screen = await render(<Harness jobs={[]} />);

      expect(screen.querySelector('tbody td')?.getAttribute('colspan')).toBe('9');
    });
  });

  it('says no job matches when the table has no rows', async () => {
    const screen = await render(<Harness jobs={[]} />);

    expect(screen.querySelector('tbody')?.textContent).toBe('No jobs match these filters.');
    expect(screen.querySelector('tbody td')?.getAttribute('colspan')).toBe('11');
  });

  describe('editing a job in its row', () => {
    const putAndRender = async (job = makeJob()) => {
      await putJobs(job);
      return render(<Harness jobs={[job]} />);
    };

    it.each([
      { label: 'Title', field: 'title' },
      { label: 'Company', field: 'company' },
      { label: 'Location', field: 'location' },
      { label: 'Notes', field: 'notes' },
    ] as const)('saves an edited $label', async ({ label, field }) => {
      const screen = await putAndRender();
      const cell = byLabel<HTMLInputElement>(screen, label);

      await typeInto(cell, 'Changed');
      await leave(cell);

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.[field]).toBe('Changed'));
    });

    it('reports an edit that cannot be saved', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const screen = await putAndRender();
      const add = vi.spyOn(toast, 'add').mockReturnValue('toast-id');
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));
      const cell = byLabel<HTMLInputElement>(screen, 'Title');

      await typeInto(cell, 'Changed');
      await leave(cell);

      await vi.waitFor(() =>
        expect(add).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Couldn't save the change", type: 'error' }),
        ),
      );
      expect((await jobStore.get('seek:1'))?.title).toBe('Engineer');
    });

    it('saves a salary without the spaces around it', async () => {
      const screen = await putAndRender();
      const cell = byLabel<HTMLInputElement>(screen, 'Salary');

      await typeInto(cell, '  $90k  ');
      await leave(cell);

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.salary).toBe('$90k'));
    });

    it.each(['', '   '])('clears the salary when it is edited to %j', async (blank) => {
      const screen = await putAndRender(makeJob({ salary: '$100k' }));
      const cell = byLabel<HTMLInputElement>(screen, 'Salary');

      await typeInto(cell, blank);
      await leave(cell);

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.salary).toBeUndefined());
    });

    it.each([
      { column: 'Arrangement', field: 'workArrangement', option: 'Remote' },
      { column: 'Employment', field: 'employmentType', option: 'Contract' },
    ] as const)('sets the $column from its picker', async ({ column, field, option }) => {
      const screen = await putAndRender(makeJob({ title: 'Engineer' }));

      await openSelect(byLabel(screen, `${column} of Engineer`));
      await pickOption(option);

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.[field]).toBe(option));
    });

    it.each([
      { column: 'Arrangement', field: 'workArrangement', current: 'Remote' },
      { column: 'Employment', field: 'employmentType', current: 'Contract' },
    ] as const)('clears the $column with “Not set”', async ({ column, field, current }) => {
      const screen = await putAndRender(makeJob({ title: 'Engineer', [field]: current }));

      await openSelect(byLabel(screen, `${column} of Engineer`));
      await pickOption('Not set');

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.[field]).toBeUndefined());
    });

    it('stops flagging a job for review once its title and company are filled in', async () => {
      const flagged = makeJob({ title: '', company: 'Acme', needsReview: true });
      const screen = await putAndRender(flagged);
      const cell = byLabel<HTMLInputElement>(screen, 'Title');

      await typeInto(cell, 'Engineer');
      await leave(cell);

      await vi.waitFor(async () => expect((await jobStore.get('seek:1'))?.needsReview).toBe(false));
    });
  });
});

describe('JobsTable: the requested job', () => {
  /** The table with buttons that send it another request or just redraw it. */
  function RequestHarness({ jobs, request }: { jobs: readonly Job[]; request: JobRequest }) {
    const [current, setCurrent] = useState(request);
    const [, setRedraws] = useState(0);
    const { table, rows, focus } = useJobsTable(jobs, current);
    return (
      <>
        <button onClick={() => setCurrent({ id: request.id, token: 'again' })}>Ask again</button>
        <button onClick={() => setRedraws((count) => count + 1)}>Redraw</button>
        <JobsTable table={table} rows={rows} focus={focus} />
      </>
    );
  }

  const request = (id: string): JobRequest => ({ id, token: `#job=${id}&t=1` });
  const titleIn = (row: HTMLElement) =>
    row.querySelector<HTMLInputElement>('[aria-label="Title"]')?.value;

  const two = [
    makeJob({ id: 'seek:1', title: 'Wanted', savedAt: localIso(2026, 10, 1) }),
    makeJob({ id: 'seek:2', title: 'Other', savedAt: localIso(2026, 10, 2) }),
  ];

  it('scrolls the row of the job to the middle of the screen', async () => {
    const { scrollIntoView } = stubScrollAndAnimate();

    await render(<RequestHarness jobs={two} request={request('seek:1')} />);

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center' });
    expect(titleIn(calledOn(scrollIntoView))).toBe('Wanted');
  });

  it('fades a highlight out of that row over two seconds', async () => {
    const { animate } = stubScrollAndAnimate();

    await render(<RequestHarness jobs={two} request={request('seek:1')} />);

    expect(animate).toHaveBeenCalledExactlyOnceWith(
      { backgroundColor: [expect.any(String), 'var(--card)'] },
      { duration: 2000 },
    );
    expect(titleIn(calledOn(animate))).toBe('Wanted');
  });

  it('leaves the rows alone when no job is requested', async () => {
    const { scrollIntoView, animate } = stubScrollAndAnimate();

    await render(<Harness jobs={two} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it('finds the row on a later page', async () => {
    const { scrollIntoView } = stubScrollAndAnimate();
    const many = Array.from({ length: 120 }, (_, i) =>
      makeJob({
        id: `seek:${i + 1}`,
        title: `Job ${i + 1}`,
        savedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      }),
    );

    await render(<RequestHarness jobs={many} request={request('seek:10')} />);

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(titleIn(calledOn(scrollIntoView))).toBe('Job 10');
  });

  it('scrolls and highlights again when the same job is asked for again', async () => {
    const { scrollIntoView, animate } = stubScrollAndAnimate();
    const screen = await render(<RequestHarness jobs={two} request={request('seek:1')} />);

    await settle(() => buttonNamed(screen, 'Ask again').click());

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('does not scroll again when the table is only redrawn', async () => {
    const { scrollIntoView, animate } = stubScrollAndAnimate();
    const screen = await render(<RequestHarness jobs={two} request={request('seek:1')} />);

    await settle(() => buttonNamed(screen, 'Redraw').click());

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
  });
});
