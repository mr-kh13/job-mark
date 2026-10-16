import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRequests } from '@/components/inspiration/generated-line';
import { SETTINGS_STORAGE_KEY } from '@/hooks/use-settings';
import { createBackup } from './backup/backup';
import { jobStore } from '@/store/job-store';
import { captureDownloads } from '@/test-utils/downloads';
import { stubLanguageModel } from '@/test-utils/language-model';
import { localIso, makeJob } from '@/test-utils/make-job';
import { openMenu } from '@/test-utils/menu';
import { putJobs } from '@/test-utils/put-jobs';
import { cleanup, render, settle } from '@/test-utils/render';
import { calledOn, stubScrollAndAnimate } from '@/test-utils/scroll-stubs';
import { chooseFile } from '@/test-utils/file-input';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { openSelect, pickOption } from '@/test-utils/select';
import { leave, typeInto } from '@/test-utils/text-field';
import { logger } from '@/utils/logger';
import App from './App';

beforeEach(() => {
  fakeBrowser.reset();
  localStorage.clear();
  forgetRequests();
  // Drops any hash without firing a hashchange.
  history.replaceState(null, '', location.pathname);
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const byLabel = <T extends HTMLElement = HTMLElement>(screen: HTMLElement, label: string) =>
  screen.querySelector<T>(`[aria-label="${label}"]`)!;

/** The titles shown in the table, in row order. */
const titles = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll<HTMLInputElement>('[aria-label="Title"]')).map(
    (field) => field.value,
  );

describe('App', () => {
  it('names the extension with its logo', async () => {
    const screen = await render(<App />);

    expect(screen.querySelector('h1 img')?.getAttribute('alt')).toBe('Jobmark');
  });

  it('says nothing is tracked yet, and how jobs get here, when there are no jobs', async () => {
    const screen = await render(<App />);

    expect(screen.textContent).toContain(
      'Nothing tracked yet. Jobs you save or apply for on a supported site will appear here.',
    );
    expect(screen.querySelector('table')).toBeNull();
  });

  it('shows the jobs and how many there are', async () => {
    await putJobs(
      makeJob({ id: 'seek:1', title: 'First', savedAt: localIso(2026, 10, 1) }),
      makeJob({ id: 'seek:2', title: 'Second', savedAt: localIso(2026, 10, 2) }),
    );

    const screen = await render(<App />);

    expect(screen.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.textContent).toContain('2 jobs');
    expect(screen.textContent).not.toContain('Nothing tracked yet');
  });

  it('says "1 job" for a single job', async () => {
    await putJobs(makeJob());

    const screen = await render(<App />);

    expect(screen.textContent).toContain('1 job');
    expect(screen.textContent).not.toContain('1 jobs');
  });

  it('shows neither the table nor the empty message until the first read finishes', async () => {
    vi.spyOn(jobStore, 'list').mockReturnValue(new Promise(() => {}));

    const screen = await render(<App />);

    expect(screen.querySelector('h1')).not.toBeNull();
    expect(screen.querySelector('table')).toBeNull();
    expect(screen.textContent).not.toContain('Nothing tracked yet');
  });

  it('ends with a warm line about how the week went, below the table and its pager', async () => {
    const today = new Date().toISOString();
    await putJobs(
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: today }),
      makeJob({ id: 'seek:2', status: 'Applied', appliedAt: today }),
      makeJob({ id: 'seek:3', status: 'Applied', appliedAt: today }),
    );

    const screen = await render(<App />);

    const line = screen.querySelector('[data-slot="inspiration"]');
    expect(line?.textContent).toBe('Your best week so far: 3 applications. Well done.');
    const pager = screen.querySelector('[aria-label="Next page"]');
    expect(pager?.compareDocumentPosition(line!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows a warm line when nothing is tracked yet', async () => {
    const screen = await render(<App />);

    expect(screen.querySelector('[data-slot="inspiration"]')?.textContent).toMatch(/\S/);
  });

  it('shows no warm line until the first read finishes', async () => {
    vi.spyOn(jobStore, 'list').mockReturnValue(new Promise(() => {}));

    const screen = await render(<App />);

    expect(screen.querySelector('[data-slot="inspiration"]')).toBeNull();
  });

  it('shows a job captured while the page is open', async () => {
    const screen = await render(<App />);
    expect(screen.textContent).toContain('Nothing tracked yet');

    await settle(() => putJobs(makeJob({ title: 'Just captured' })));

    expect(titles(screen)).toEqual(['Just captured']);
    expect(screen.textContent).not.toContain('Nothing tracked yet');
  });

  it('shows a job’s new status once it is changed', async () => {
    await putJobs(makeJob({ title: 'Engineer', status: 'Interested' }));
    const screen = await render(<App />);

    await openSelect(byLabel(screen, 'Status of Engineer'));
    await pickOption('Offer');

    await vi.waitFor(() => expect(screen.querySelector('tbody')?.textContent).toContain('Offer'));
  });

  describe('finding jobs', () => {
    const tracked = () =>
      putJobs(
        makeJob({ id: 'seek:1', title: 'Platform Engineer', savedAt: localIso(2026, 10, 1) }),
        makeJob({ id: 'seek:2', title: 'Designer', savedAt: localIso(2026, 10, 2) }),
        makeJob({ id: 'seek:3', title: 'Analyst', savedAt: localIso(2026, 10, 3) }),
      );
    const search = (screen: HTMLElement, text: string) =>
      typeInto(byLabel<HTMLInputElement>(screen, 'Search title or company'), text);

    const filtersButton = (screen: HTMLElement) =>
      Array.from(screen.querySelectorAll('button')).find((button) =>
        button.textContent.trim().startsWith('Filters'),
      );

    it('offers no search, filters or columns while nothing is tracked', async () => {
      const screen = await render(<App />);

      expect(byLabel(screen, 'Search title or company')).toBeNull();
      expect(filtersButton(screen)).toBeUndefined();
      expect(buttonNamed(screen, 'Columns')).toBeUndefined();
    });

    it('offers a search, filters and columns once there are jobs', async () => {
      await tracked();

      const screen = await render(<App />);

      expect(byLabel(screen, 'Search title or company')).not.toBeNull();
      expect(filtersButton(screen)).toBeDefined();
      expect(buttonNamed(screen, 'Columns')).toBeDefined();
    });

    it('narrows the table and the count to what the search finds', async () => {
      await tracked();
      const screen = await render(<App />);

      await search(screen, 'engineer');

      expect(titles(screen)).toEqual(['Platform Engineer']);
      expect(screen.textContent).toContain('1 of 3 jobs');
    });

    it('narrows the table to the chosen status', async () => {
      await putJobs(
        makeJob({ id: 'seek:1', title: 'Applied job', status: 'Applied' }),
        makeJob({ id: 'seek:2', title: 'Offer job', status: 'Offer' }),
      );
      const screen = await render(<App />);

      await settle(() => filtersButton(screen)!.click());
      await openSelect(fieldFor<HTMLElement>(document.querySelector('[role="dialog"]')!, 'Status'));
      await pickOption('Offer');

      expect(titles(screen)).toEqual(['Offer job']);
      expect(screen.textContent).toContain('1 of 2 jobs');
    });

    it('says all the jobs when the search matches every one of them', async () => {
      await tracked();
      const screen = await render(<App />);

      await search(screen, 'a');

      expect(screen.textContent).toContain('3 jobs');
      expect(screen.textContent).not.toContain('of 3 jobs');
    });

    it('says no job matches, without paging, and lists everything again once the search is cleared', async () => {
      await tracked();
      const screen = await render(<App />);

      await search(screen, 'zzz');

      expect(screen.textContent).toContain('No jobs match these filters.');
      expect(screen.textContent).toContain('0 of 3 jobs');
      expect(byLabel(screen, 'Next page')).toBeNull();

      await search(screen, '');

      expect(titles(screen)).toHaveLength(3);
      expect(screen.textContent).not.toContain('No jobs match');
    });

    it('hides a column chosen in the Columns menu', async () => {
      await tracked();
      const screen = await render(<App />);
      const trigger = buttonNamed(screen, 'Columns');
      await settle(() => {
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        trigger.click();
      });

      await settle(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'))
          .find((item) => item.textContent === 'Salary')!
          .click(),
      );

      const headers = Array.from(screen.querySelectorAll('thead th')).map((th) => th.textContent);
      expect(headers).not.toContain('Salary');
      expect(headers).toContain('Title');
    });

    it('sorts by a column when its header is clicked', async () => {
      await tracked();
      const screen = await render(<App />);

      await settle(() => buttonNamed(screen.querySelector('thead')!, 'Title').click());

      expect(titles(screen)).toEqual(['Analyst', 'Designer', 'Platform Engineer']);
    });
  });

  describe('paging', () => {
    const manyJobs = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        makeJob({
          id: `seek:${i + 1}`,
          title: `Job ${i + 1}`,
          savedAt: localIso(2026, 1, 1, 0, i),
        }),
      );
    const rowsPerPage = async (screen: HTMLElement, size: string) => {
      await openSelect(byLabel(screen, 'Rows per page'));
      await pickOption(size);
    };
    const goNext = (screen: HTMLElement) => settle(() => byLabel(screen, 'Next page').click());

    it('shows the first 50 jobs, the newest first', async () => {
      await jobStore.saveMany(manyJobs(60));

      const screen = await render(<App />);

      expect(titles(screen)).toHaveLength(50);
      expect(titles(screen)[0]).toBe('Job 60');
      expect(screen.textContent).toContain('1–50 of 60');
    });

    it('shows the rest of the jobs on the next page', async () => {
      await jobStore.saveMany(manyJobs(60));
      const screen = await render(<App />);

      await goNext(screen);

      expect(titles(screen)).toHaveLength(10);
      expect(titles(screen)[0]).toBe('Job 10');
      expect(screen.textContent).toContain('51–60 of 60');
    });

    it('shows as many rows as the chosen page size', async () => {
      await jobStore.saveMany(manyJobs(25));
      const screen = await render(<App />);

      await rowsPerPage(screen, '10');

      expect(titles(screen)).toHaveLength(10);
      expect(screen.textContent).toContain('1–10 of 25');
    });

    it('stays on the page when a job on it is edited', async () => {
      await jobStore.saveMany(manyJobs(25));
      const screen = await render(<App />);
      await rowsPerPage(screen, '10');
      await goNext(screen);
      const field = byLabel<HTMLInputElement>(screen, 'Title');

      await typeInto(field, 'Renamed');
      await leave(field);

      await vi.waitFor(() => expect(titles(screen)[0]).toBe('Renamed'));
      expect(screen.textContent).toContain('11–20 of 25');
    });

    it('moves back to the last page that exists when the only job on the last page is deleted', async () => {
      await jobStore.saveMany(manyJobs(11));
      const screen = await render(<App />);
      await rowsPerPage(screen, '10');
      await goNext(screen);
      expect(titles(screen)).toEqual(['Job 1']);

      await settle(() => byLabel(screen, 'Delete Job 1').click());

      await vi.waitFor(() => expect(titles(screen)).toHaveLength(10));
      expect(screen.textContent).toContain('1–10 of 10');
    });
  });

  describe('backing up and importing', () => {
    it('offers Back up and Import once the jobs are loaded', async () => {
      await putJobs(makeJob());

      const screen = await render(<App />);

      expect(buttonNamed(screen, 'Back up')).toBeDefined();
      expect(buttonNamed(screen, 'Import')).toBeDefined();
      expect(screen.textContent).toContain('Last backup: never');
    });

    it('offers neither until the first read finishes', async () => {
      vi.spyOn(jobStore, 'list').mockReturnValue(new Promise(() => {}));

      const screen = await render(<App />);

      expect(screen.textContent).not.toContain('Back up');
      expect(screen.textContent).not.toContain('Import');
    });

    it('lists the jobs from an imported backup file', async () => {
      const screen = await render(<App />);

      await chooseFile(
        screen,
        createBackup([makeJob({ id: 'seek:1', title: 'Imported Engineer' })]),
      );

      await vi.waitFor(() => expect(titles(screen)).toEqual(['Imported Engineer']));
      expect(document.body.textContent).toContain('Imported: 1 added, 0 updated, 0 skipped.');
    });

    it('says so when the storage is too full to hold the imported jobs', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const screen = await render(<App />);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
        new Error('Resource::kQuotaBytes quota exceeded'),
      );

      await chooseFile(
        screen,
        createBackup([makeJob({ id: 'seek:1', title: 'Imported Engineer' })]),
      );

      await vi.waitFor(() => expect(document.body.textContent).toContain("Couldn't import"));
      expect(document.body.textContent).toContain('is full');
      expect(document.body.textContent).not.toContain('Imported:');
      expect(await jobStore.list()).toEqual([]);
    });
  });

  describe('opening a job from the address', () => {
    /** 60 jobs, "Job 60" the newest, so "Job 5" is on the second page. */
    const sixty = () =>
      jobStore.saveMany(
        Array.from({ length: 60 }, (_, i) =>
          makeJob({
            id: `seek:${i + 1}`,
            title: `Job ${i + 1}`,
            savedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          }),
        ),
      );
    const askFor = (id: string, token = 1) => `#job=${encodeURIComponent(id)}&t=${token}`;
    const titleOf = (row: HTMLElement) =>
      row.querySelector<HTMLInputElement>('[aria-label="Title"]')?.value;

    it('shows the job the address names, on the page that holds it, once the jobs have loaded', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();
      history.replaceState(null, '', askFor('seek:5'));

      const screen = await render(<App />);

      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
      expect(titleOf(calledOn(scrollIntoView))).toBe('Job 5');
      expect(titles(screen)).toContain('Job 5');
      expect(screen.textContent).toContain('51–60 of 60');
    });

    it('shows a job asked for while the sheet is already open', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();
      const screen = await render(<App />);
      await vi.waitFor(() => expect(titles(screen)).toHaveLength(50));

      await settle(() => {
        location.hash = askFor('seek:5');
      });

      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
      expect(titleOf(calledOn(scrollIntoView))).toBe('Job 5');
      expect(screen.textContent).toContain('51–60 of 60');
    });

    it('clears a search that hides the job', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();
      const screen = await render(<App />);
      await vi.waitFor(() => expect(titles(screen)).toHaveLength(50));
      await typeInto(byLabel<HTMLInputElement>(screen, 'Search title or company'), 'Job 6');
      expect(screen.textContent).toContain('2 of 60 jobs');

      await settle(() => {
        location.hash = askFor('seek:5');
      });

      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
      expect(byLabel<HTMLInputElement>(screen, 'Search title or company').value).toBe('');
      expect(screen.textContent).toContain('60 jobs');
    });

    it('scrolls to the job again when it is asked for again', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();
      history.replaceState(null, '', askFor('seek:5', 1));
      await render(<App />);
      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());

      await settle(() => {
        location.hash = askFor('seek:5', 2);
      });

      await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    });

    it('ignores an address that names a job that is not stored', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();
      history.replaceState(null, '', askFor('seek:999'));

      const screen = await render(<App />);

      await vi.waitFor(() => expect(titles(screen)).toHaveLength(50));
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('leaves the table alone when the address names no job', async () => {
      const { scrollIntoView } = stubScrollAndAnimate();
      await sixty();

      const screen = await render(<App />);

      await vi.waitFor(() => expect(titles(screen)).toHaveLength(50));
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(screen.textContent).toContain('1–50 of 60');
    });
  });

  describe('exporting', () => {
    it('offers Export once the jobs are loaded', async () => {
      await putJobs(makeJob());

      const screen = await render(<App />);

      expect(buttonNamed(screen, 'Export')).toBeDefined();
    });

    it('offers no Export until the first read finishes', async () => {
      vi.spyOn(jobStore, 'list').mockReturnValue(new Promise(() => {}));

      const screen = await render(<App />);

      expect(buttonNamed(screen, 'Export')).toBeUndefined();
    });

    it('exports every job, even while a search narrows the table', async () => {
      const files = captureDownloads();
      await putJobs(
        makeJob({ id: 'seek:1', title: 'Platform Engineer' }),
        makeJob({ id: 'seek:2', title: 'Designer' }),
        makeJob({ id: 'seek:3', title: 'Analyst' }),
      );
      const screen = await render(<App />);
      await typeInto(byLabel<HTMLInputElement>(screen, 'Search title or company'), 'engineer');
      expect(titles(screen)).toEqual(['Platform Engineer']);

      await openMenu(buttonNamed(screen, 'Export'));
      await settle(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
          .find((choice) => choice.textContent === 'CSV')!
          .click(),
      );

      const csv = await files[0]!.blob.text();
      expect(csv).toContain('Platform Engineer');
      expect(csv).toContain('Designer');
      expect(csv).toContain('Analyst');
    });
  });

  describe('adding a job', () => {
    let scroll: ReturnType<typeof stubScrollAndAnimate>;
    beforeEach(() => {
      scroll = stubScrollAndAnimate();
    });

    const addJob = async (screen: HTMLElement, title: string) => {
      await settle(() => buttonNamed(screen, 'Add job').click());
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
      await typeInto(fieldFor(dialog, 'Title'), title);
      await typeInto(fieldFor(dialog, 'Company'), 'Acme');
      await settle(() => buttonNamed(dialog, 'Add job').click());
    };

    it('offers the Add job button even when nothing is tracked yet', async () => {
      const screen = await render(<App />);

      expect(buttonNamed(screen, 'Add job')).toBeDefined();
    });

    it('lists the new job as soon as it is added', async () => {
      const screen = await render(<App />);

      await addJob(screen, 'Platform Engineer');

      await vi.waitFor(() => expect(titles(screen)).toEqual(['Platform Engineer']));
      expect(screen.textContent).not.toContain('Nothing tracked yet');
    });

    it('keeps the form open and says so when the job cannot be saved', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const screen = await render(<App />);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));

      await addJob(screen, 'Platform Engineer');

      await vi.waitFor(() => expect(document.body.textContent).toContain("Couldn't add the job"));
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(location.hash).toBe('');
      expect(await jobStore.list()).toEqual([]);
    });

    it('adds to the jobs already tracked', async () => {
      await putJobs(makeJob({ id: 'seek:1', title: 'Engineer', savedAt: localIso(2026, 10, 1) }));
      const screen = await render(<App />);

      await addJob(screen, 'Platform Engineer');

      await vi.waitFor(() => expect(titles(screen)).toHaveLength(2));
      expect(titles(screen)).toContain('Engineer');
      expect(titles(screen)).toContain('Platform Engineer');
    });

    it('clears a search that hides the new job and scrolls to it', async () => {
      await putJobs(makeJob({ id: 'seek:1', title: 'Engineer', savedAt: localIso(2026, 10, 1) }));
      const screen = await render(<App />);
      await typeInto(byLabel<HTMLInputElement>(screen, 'Search title or company'), 'Engineer');

      await addJob(screen, 'Designer');

      await vi.waitFor(() => expect(scroll.scrollIntoView).toHaveBeenCalledOnce());
      const row = calledOn(scroll.scrollIntoView);
      expect(row.querySelector<HTMLInputElement>('[aria-label="Title"]')?.value).toBe('Designer');
      expect(byLabel<HTMLInputElement>(screen, 'Search title or company').value).toBe('');
      expect(titles(screen)).toEqual(expect.arrayContaining(['Engineer', 'Designer']));
    });
  });

  describe('deleting a job', () => {
    it('takes it off the list and says so', async () => {
      await putJobs(makeJob({ title: 'Engineer' }));
      const screen = await render(<App />);

      await settle(() => byLabel(screen, 'Delete Engineer').click());

      await vi.waitFor(() => expect(screen.textContent).toContain('Nothing tracked yet'));
      expect(document.body.textContent).toContain('Deleted “Engineer”');
    });

    it('puts it back on the list when Undo is clicked', async () => {
      await putJobs(makeJob({ title: 'Engineer' }));
      const screen = await render(<App />);
      await settle(() => byLabel(screen, 'Delete Engineer').click());
      await vi.waitFor(() => expect(screen.querySelector('tbody')).toBeNull());

      await settle(() =>
        document.querySelector<HTMLElement>('[data-slot="toast-action"]')!.click(),
      );

      await vi.waitFor(() => expect(titles(screen)).toEqual(['Engineer']));
    });
  });

  describe('editing a job', () => {
    const rename = async (screen: HTMLElement, title: string) => {
      const field = byLabel<HTMLInputElement>(screen, 'Title');
      await typeInto(field, title);
      await leave(field);
    };
    const flaggedRows = (screen: HTMLElement) =>
      screen.querySelectorAll('tbody tr[data-needs-review="true"]');

    it('keeps showing an edit once it is saved', async () => {
      await putJobs(makeJob({ title: 'Engineer' }));
      const screen = await render(<App />);

      await rename(screen, 'Staff Engineer');

      await vi.waitFor(() => expect(titles(screen)).toEqual(['Staff Engineer']));
    });

    it('stops highlighting a flagged row once its title and company are filled in', async () => {
      await putJobs(makeJob({ title: '', company: 'Acme', needsReview: true }));
      const screen = await render(<App />);
      expect(flaggedRows(screen)).toHaveLength(1);

      await rename(screen, 'Engineer');

      await vi.waitFor(() => expect(flaggedRows(screen)).toHaveLength(0));
    });

    it('keeps highlighting a flagged row while its company is still empty', async () => {
      await putJobs(makeJob({ title: '', company: '', needsReview: true }));
      const screen = await render(<App />);

      await rename(screen, 'Engineer');

      await vi.waitFor(() => expect(titles(screen)).toEqual(['Engineer']));
      expect(flaggedRows(screen)).toHaveLength(1);
    });
  });
});

describe('the settings', () => {
  const AI_SWITCH = 'Write the daily line with on-device AI';
  const BEST_WEEK_LINE = 'Your best week so far: 3 applications. Well done.';
  const lineOf = (screen: HTMLElement) =>
    screen.querySelector('[data-slot="inspiration"]')?.textContent;
  const settingsDialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
  const openSettings = (screen: HTMLElement) =>
    settle(() => byLabel<HTMLButtonElement>(screen, 'Settings').click());
  const putBestWeek = () => {
    const today = new Date().toISOString();
    return putJobs(
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: today }),
      makeJob({ id: 'seek:2', status: 'Applied', appliedAt: today }),
      makeJob({ id: 'seek:3', status: 'Applied', appliedAt: today }),
    );
  };

  it('has a Settings button, even when nothing is tracked yet', async () => {
    const screen = await render(<App />);

    expect(byLabel(screen, 'Settings')).not.toBeNull();
  });

  it('opens a dialog with the AI setting on', async () => {
    const screen = await render(<App />);

    await openSettings(screen);

    expect(fieldFor(settingsDialog(), AI_SWITCH).checked).toBe(true);
  });

  it('turns the AI line off, showing the fixed line and remembering the choice', async () => {
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });
    await putBestWeek();
    const screen = await render(<App />);
    await vi.waitFor(() => expect(lineOf(screen)).toBe('You are doing well.'));
    await openSettings(screen);

    await settle(() => fieldFor(settingsDialog(), AI_SWITCH).click());

    expect(lineOf(screen)).toBe(BEST_WEEK_LINE);
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual({ isAiEnabled: false });
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('turns the AI line back on, showing the line the model already wrote', async () => {
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });
    await putBestWeek();
    const screen = await render(<App />);
    await vi.waitFor(() => expect(lineOf(screen)).toBe('You are doing well.'));
    await openSettings(screen);
    await settle(() => fieldFor(settingsDialog(), AI_SWITCH).click());

    await settle(() => fieldFor(settingsDialog(), AI_SWITCH).click());

    expect(lineOf(screen)).toBe('You are doing well.');
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('starts with the AI line off when it was turned off on an earlier visit', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ isAiEnabled: false }));
    const { api } = stubLanguageModel();
    await putBestWeek();

    const screen = await render(<App />);

    expect(lineOf(screen)).toBe(BEST_WEEK_LINE);
    expect(api.availability).not.toHaveBeenCalled();
    await openSettings(screen);
    expect(fieldFor(settingsDialog(), AI_SWITCH).checked).toBe(false);
  });
});
