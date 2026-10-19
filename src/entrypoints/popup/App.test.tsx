import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRequests } from '@/components/inspiration/generated-line';
import { SETTINGS_STORAGE_KEY } from '@/hooks/use-settings';
import type { Job } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { stubContexts, stubInjection, stubTabReply, stubTabs } from '@/test-utils/browser-stubs';
import { stubLanguageModel } from '@/test-utils/language-model';
import { makeJob } from '@/test-utils/make-job';
import { buttonNamed, fieldFor } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { openSelect, pickOption } from '@/test-utils/select';
import App from './App';
import type { PageSnapshot } from './job-draft';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const UUID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  fakeBrowser.reset();
  localStorage.clear();
  forgetRequests();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID);
  vi.spyOn(window, 'close').mockImplementation(() => {});
});

afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Waits, inside act, until the screen shows what the check expects. */
const until = (check: () => void | Promise<void>) => settle(() => vi.waitFor(check));

/** Opens the popup with these jobs stored, once it has read them. */
const renderApp = async (jobs: Job[] = []) => {
  await jobStore.saveMany(jobs);
  const screen = await render(<App />);
  await until(() =>
    jobs.length === 0
      ? expect(screen.textContent).toContain('Nothing yet')
      : expect(rows(screen)).not.toHaveLength(0),
  );
  return screen;
};

const rows = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll<HTMLElement>('[data-slot="recent-job"]'));
const titles = (screen: HTMLElement) =>
  rows(screen).map((row) => row.querySelector('[data-slot="title"]')?.textContent);
const stats = (screen: HTMLElement) =>
  Array.from(screen.querySelectorAll('[data-slot="stat"]'), (stat) => [
    stat.children[1]?.textContent,
    stat.children[0]?.textContent,
  ]);
const toastText = () =>
  Array.from(document.querySelectorAll('[data-slot="toast"]'), (toast) => toast.textContent);

const snapshotOf = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: over.url ?? 'https://careers.acme.com/jobs/42',
  title: over.title ?? 'Careers at Acme',
  h1: over.h1 ?? '',
  ogTitle: over.ogTitle ?? '',
  ogSiteName: over.ogSiteName ?? '',
  canonical: over.canonical ?? '',
  jsonLd: over.jsonLd ?? [],
});

const posting = JSON.stringify({
  '@type': 'JobPosting',
  title: 'Platform Engineer',
  hiringOrganization: { name: 'Acme' },
  jobLocation: { address: { addressLocality: 'Melbourne', addressRegion: 'VIC' } },
  employmentType: 'FULL_TIME',
});

/** Makes the browser report this page as the active tab. */
const openPage = (page: PageSnapshot) => {
  stubTabs([{ id: 7, url: page.url, title: page.title }]);
  stubInjection(async () => [{ result: page }]);
};

const clickSaveThisJob = (screen: HTMLElement) =>
  settle(() => buttonNamed(screen, 'Save this job').click());

/** Clicks Save this job and waits for the form. */
const startSaving = async (screen: HTMLElement) => {
  await clickSaveThisJob(screen);
  await until(() => expect(screen.textContent).toContain('Job link'));
};

describe('the home view', () => {
  it('names the extension with its logo', async () => {
    const screen = await renderApp([]);

    expect(screen.querySelector('h1 img')?.getAttribute('alt')).toBe('Jobmark');
  });

  it('shows the totals', async () => {
    const screen = await renderApp([
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: daysAgo(2) }),
      makeJob({ id: 'seek:2', status: 'Rejected', appliedAt: daysAgo(20) }),
      makeJob({ id: 'seek:3', status: 'Interested', savedAt: daysAgo(1) }),
      makeJob({ id: 'seek:4', status: 'Applied', appliedAt: daysAgo(21) }),
    ]);

    expect(stats(screen)).toEqual([
      ['Applications', '3'],
      ['This week', '1'],
      ['Best week', '2'],
    ]);
  });

  it('ends with a warm line about how the week went, below the recent jobs', async () => {
    const screen = await renderApp([
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: daysAgo(1) }),
      makeJob({ id: 'seek:2', status: 'Applied', appliedAt: daysAgo(2) }),
      makeJob({ id: 'seek:3', status: 'Applied', appliedAt: daysAgo(3) }),
    ]);

    const line = screen.querySelector('[data-slot="inspiration"]');

    expect(line?.textContent).toBe('Your best week so far: 3 applications. Well done.');
    expect(screen.querySelector('main')?.lastElementChild).toBe(line);
  });

  it('shows a warm line when nothing is tracked yet', async () => {
    const screen = await renderApp();

    const line = screen.querySelector('[data-slot="inspiration"]');

    expect(line?.textContent).toMatch(/\S/);
    expect(screen.querySelector('main')?.lastElementChild).toBe(line);
  });

  it('shows an info button after a warm line the model wrote, with a tooltip that says so', async () => {
    stubLanguageModel({ reply: 'You are doing well.' });
    const screen = await renderApp([makeJob({ id: 'seek:1' })]);
    await until(() =>
      expect(screen.querySelector('[data-slot="inspiration"]')?.textContent).toBe(
        'You are doing well.',
      ),
    );

    await settle(() =>
      screen.querySelector<HTMLButtonElement>('[data-slot="inspiration"] button')?.focus(),
    );

    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toBe(
        "Written by your browser's on-device AI. Turn it off in the sheet's Settings.",
      ),
    );
  });

  it('shows the fixed warm line, and never asks the model, when AI is turned off in the settings', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ isAiEnabled: false }));
    const { api } = stubLanguageModel({ reply: 'You are doing well.' });

    const screen = await renderApp([
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: daysAgo(1) }),
      makeJob({ id: 'seek:2', status: 'Applied', appliedAt: daysAgo(2) }),
      makeJob({ id: 'seek:3', status: 'Applied', appliedAt: daysAgo(3) }),
    ]);

    const line = screen.querySelector('[data-slot="inspiration"]');
    expect(line?.textContent).toBe('Your best week so far: 3 applications. Well done.');
    expect(line?.querySelector('button')).toBeNull();
    expect(api.availability).not.toHaveBeenCalled();
  });

  it('shows no warm line before the jobs have loaded', async () => {
    vi.spyOn(jobStore, 'list').mockImplementation(() => new Promise(() => {}));

    const screen = await render(<App />);

    expect(screen.querySelector('[data-slot="inspiration"]')).toBeNull();
  });

  it('lists the recent jobs, newest first, with the company and how long ago', async () => {
    const screen = await renderApp([
      makeJob({ id: 'seek:1', title: 'Older Role', company: 'Beta', savedAt: daysAgo(5) }),
      makeJob({ id: 'seek:2', title: 'Newer Role', company: 'Acme', savedAt: daysAgo(2) }),
    ]);

    const [first, second] = rows(screen);

    expect(first?.textContent).toContain('Newer Role');
    expect(first?.textContent).toContain('Acme · 2 days ago');
    expect(second?.textContent).toContain('Older Role');
  });

  it('lists a job under the day it was applied for when it has one', async () => {
    const screen = await renderApp([
      makeJob({ id: 'seek:1', title: 'Saved later', savedAt: daysAgo(2) }),
      makeJob({ id: 'seek:2', title: 'Applied later', savedAt: daysAgo(9), appliedAt: daysAgo(1) }),
    ]);

    expect(titles(screen)).toEqual(['Applied later', 'Saved later']);
  });

  it('lists only the five most recent jobs', async () => {
    const jobs = Array.from({ length: 7 }, (_, index) =>
      makeJob({ id: `seek:${index}`, title: `Role ${index}`, savedAt: daysAgo(index) }),
    );

    const screen = await renderApp(jobs);

    expect(titles(screen)).toEqual(['Role 0', 'Role 1', 'Role 2', 'Role 3', 'Role 4']);
  });

  it('links a job to its page when it has a link, and shows plain text when it has none', async () => {
    const screen = await renderApp([
      makeJob({
        id: 'seek:1',
        title: 'Linked',
        url: 'https://au.seek.com/job/1',
        savedAt: daysAgo(1),
      }),
      makeJob({ id: 'manual:2', source: 'other', title: 'Unlinked', url: '', savedAt: daysAgo(2) }),
    ]);

    const [linked, unlinked] = rows(screen);

    const link = linked?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://au.seek.com/job/1');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
    expect(unlinked?.querySelector('a')).toBeNull();
  });

  it('names a job that has no title Untitled', async () => {
    const screen = await renderApp([makeJob({ title: '', company: '' })]);

    expect(rows(screen)[0]?.textContent).toContain('Untitled');
  });

  it('does not say that nothing is tracked before the jobs have loaded', async () => {
    vi.spyOn(jobStore, 'list').mockImplementation(() => new Promise(() => {}));

    const screen = await render(<App />);

    expect(screen.textContent).not.toContain('Nothing yet');
  });

  it('says so when nothing is tracked yet', async () => {
    const screen = await renderApp();

    expect(screen.textContent).toContain(
      'Nothing yet. Jobs you save or apply for will appear here.',
    );
    expect(rows(screen)).toHaveLength(0);
  });

  it('changes the status of a job from its row', async () => {
    const screen = await renderApp([makeJob({ id: 'seek:1', title: 'Platform Engineer' })]);
    const picker = screen.querySelector<HTMLElement>('[aria-label="Status for Platform Engineer"]');

    await openSelect(picker!);
    await pickOption('Interviewing');

    await until(async () => expect((await jobStore.get('seek:1'))?.status).toBe('Interviewing'));
  });

  it('says so when the new status cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const screen = await renderApp([makeJob({ id: 'seek:1', title: 'Platform Engineer' })]);
    const picker = screen.querySelector<HTMLElement>('[aria-label="Status for Platform Engineer"]');
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));

    await openSelect(picker!);
    await pickOption('Interviewing');

    await until(() => expect(toastText().join()).toContain("Couldn't change the status"));
    expect((await jobStore.get('seek:1'))?.status).toBe('Interested');
  });

  it('opens the sheet and closes the popup', async () => {
    const screen = await renderApp();
    stubContexts([]);
    const create = vi.spyOn(fakeBrowser.tabs, 'create');

    await settle(() => buttonNamed(screen, 'Open sheet').click());

    await until(() => expect(window.close).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledExactlyOnceWith({
      url: fakeBrowser.runtime.getURL('/sheet.html'),
    });
  });

  it('focuses a sheet tab that is already open instead of opening another', async () => {
    const screen = await renderApp();
    const sheetUrl = fakeBrowser.runtime.getURL('/sheet.html');
    const sheet = await fakeBrowser.tabs.create({ url: sheetUrl });
    await fakeBrowser.tabs.create({ url: 'https://au.seek.com/job/1', active: true });
    stubContexts([{ tabId: sheet.id, windowId: sheet.windowId, documentUrl: sheetUrl }]);
    const focusWindow = vi.spyOn(fakeBrowser.windows, 'update');
    const create = vi.spyOn(fakeBrowser.tabs, 'create');

    await settle(() => buttonNamed(screen, 'Open sheet').click());

    await until(() => expect(window.close).toHaveBeenCalledOnce());
    expect((await fakeBrowser.tabs.get(sheet.id!)).active).toBe(true);
    expect(focusWindow).toHaveBeenCalledWith(sheet.windowId, { focused: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('stays open and says so when the sheet cannot be opened', async () => {
    const screen = await renderApp();
    vi.spyOn(fakeBrowser.runtime, 'getContexts').mockRejectedValue(new Error('unsupported'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await settle(() => buttonNamed(screen, 'Open sheet').click());

    await until(() => expect(screen.textContent).toContain("Couldn't open the sheet."));
    expect(window.close).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('saving the open page', () => {
  it('shows the details found on the page in the form', async () => {
    const screen = await renderApp();
    openPage(snapshotOf({ jsonLd: [posting] }));

    await startSaving(screen);

    expect(fieldFor(screen, 'Title').value).toBe('Platform Engineer');
    expect(fieldFor(screen, 'Company').value).toBe('Acme');
    expect(fieldFor(screen, 'Location').value).toBe('Melbourne, VIC');
    expect(fieldFor(screen, 'Job link').value).toBe('https://careers.acme.com/jobs/42');
    expect(fieldFor<HTMLElement>(screen, 'Employment type').textContent).toBe('Full-time');
    expect(screen.textContent).not.toContain("Couldn't read this page");
  });

  it('keeps the warm line off the form', async () => {
    const screen = await renderApp();
    openPage(snapshotOf({ jsonLd: [posting] }));

    await startSaving(screen);

    expect(screen.querySelector('[data-slot="inspiration"]')).toBeNull();
  });

  it('saves the job, confirms it with a toast, and goes back to the home view', async () => {
    const screen = await renderApp();
    openPage(snapshotOf({ jsonLd: [posting] }));
    await startSaving(screen);

    await settle(() => buttonNamed(screen, 'Save').click());

    await until(() => expect(screen.textContent).toContain('Recent'));
    expect(await jobStore.list()).toEqual([
      expect.objectContaining({
        id: `manual:${UUID}`,
        source: 'other',
        title: 'Platform Engineer',
        company: 'Acme',
        url: 'https://careers.acme.com/jobs/42',
        status: 'Applied',
      }),
    ]);
    expect(toastText()).toEqual(['Saved: Platform Engineer']);
    await until(() => expect(rows(screen)).toHaveLength(1));
  });

  it('stays on the form and says so when the job cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const screen = await renderApp();
    openPage(snapshotOf({ jsonLd: [posting] }));
    await startSaving(screen);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));

    await settle(() => buttonNamed(screen, 'Save').click());

    await until(() => expect(toastText().join()).toContain("Couldn't save the job"));
    expect(toastText().join()).not.toContain('Saved:');
    expect(screen.textContent).toContain('Job link');
    expect(await jobStore.list()).toEqual([]);
  });

  it('fills the form from the job the page shows, where the page itself has only a tab title', async () => {
    const screen = await renderApp();
    openPage(
      snapshotOf({
        url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=1000000001',
        title: 'Senior Frontend Engineer | Fabrikam | LinkedIn',
      }),
    );
    stubTabReply(() => ({
      id: 'linkedin:1000000001',
      source: 'linkedin',
      title: 'Senior Frontend Engineer',
      company: 'Fabrikam',
      location: 'Sydney, New South Wales, Australia',
      workType: 'Hybrid, Full-time',
      salary: '$150K/yr - $180K/yr',
      applyType: 'easy',
      url: 'https://www.linkedin.com/jobs/view/1000000001/',
    }));

    await startSaving(screen);

    expect(fieldFor(screen, 'Title').value).toBe('Senior Frontend Engineer');
    expect(fieldFor(screen, 'Company').value).toBe('Fabrikam');
    expect(fieldFor(screen, 'Location').value).toBe('Sydney, New South Wales, Australia');
    expect(fieldFor(screen, 'Salary').value).toBe('$150K/yr - $180K/yr');
    expect(fieldFor(screen, 'Job link').value).toBe(
      'https://www.linkedin.com/jobs/view/1000000001/',
    );
    expect(fieldFor<HTMLElement>(screen, 'Work arrangement').textContent).toBe('Hybrid');
    expect(fieldFor<HTMLElement>(screen, 'Employment type').textContent).toBe('Full-time');
  });

  it('splits the tab title of a LinkedIn page when the page has no script to ask', async () => {
    const screen = await renderApp();
    openPage(
      snapshotOf({
        url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=1000000001',
        title: 'Software Engineer | Tailspin | LinkedIn',
      }),
    );

    await startSaving(screen);

    expect(fieldFor(screen, 'Title').value).toBe('Software Engineer');
    expect(fieldFor(screen, 'Company').value).toBe('Tailspin');
    expect(fieldFor(screen, 'Job link').value).toBe(
      'https://www.linkedin.com/jobs/view/1000000001/',
    );
  });

  it('tells the user a job is already tracked when the page script reads its id', async () => {
    const screen = await renderApp([
      makeJob({ id: 'seek:10000004', title: 'Software Engineer - Full Stack AI' }),
    ]);
    openPage(snapshotOf({ url: 'https://au.seek.com/', title: 'SEEK' }));
    stubTabReply(() => ({
      id: 'seek:10000004',
      source: 'seek',
      title: 'Software Engineer - Full Stack AI',
      company: 'Northwind Australia Pty Ltd',
      location: '',
      applyType: 'quick',
      url: 'https://au.seek.com/job/10000004',
    }));

    await clickSaveThisJob(screen);

    await until(() => expect(screen.textContent).toContain('Already tracked'));
  });

  it('saves a Seek page under the id that automatic capture gives it', async () => {
    const screen = await renderApp();
    openPage(
      snapshotOf({
        url: 'https://au.seek.com/job/123?ref=search',
        jsonLd: [posting],
      }),
    );
    await startSaving(screen);

    await settle(() => buttonNamed(screen, 'Save').click());

    await until(async () => {
      const saved = await jobStore.get('seek:123');
      expect(saved).toMatchObject({ source: 'seek', url: 'https://au.seek.com/job/123' });
    });
  });

  it('asks for the details and leaves the link empty when the page cannot be read', async () => {
    const screen = await renderApp();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubTabs([{ id: 7, url: 'chrome://extensions', title: 'Extensions' }]);
    stubInjection(async () => {
      throw new Error('Cannot access a chrome:// URL');
    });

    await startSaving(screen);

    expect(screen.textContent).toContain("Couldn't read this page. Fill in the details.");
    expect(fieldFor(screen, 'Title').value).toBe('Extensions');
    expect(fieldFor(screen, 'Job link').value).toBe('');
  });

  it('says so when there is no active tab', async () => {
    const screen = await renderApp();
    stubTabs([]);

    await clickSaveThisJob(screen);

    await until(() => expect(screen.textContent).toContain("Can't see the current tab."));
    expect(screen.textContent).not.toContain('Job link');
  });

  it('goes back to the home view without saving when the form is cancelled', async () => {
    const screen = await renderApp();
    openPage(snapshotOf({ jsonLd: [posting] }));
    await startSaving(screen);

    await settle(() => buttonNamed(screen, 'Cancel').click());

    await until(() => expect(screen.textContent).toContain('Recent'));
    expect(await jobStore.list()).toEqual([]);
    expect(toastText()).toEqual([]);
  });
});

describe('a page that is already tracked', () => {
  const tracked = makeJob({
    id: 'seek:123',
    title: 'Platform Engineer',
    company: 'Acme',
    status: 'Applied',
    appliedAt: daysAgo(3),
    url: 'https://au.seek.com/job/123',
  });

  const reachTracked = async (jobs: Job[], page: PageSnapshot) => {
    const screen = await renderApp(jobs);
    openPage(page);
    await clickSaveThisJob(screen);
    await until(() => expect(screen.textContent).toContain('Already tracked'));
    return screen;
  };

  it('says the job is already tracked, with its status and when it was listed', async () => {
    const screen = await reachTracked(
      [tracked],
      snapshotOf({ url: 'https://au.seek.com/job/123?ref=x' }),
    );

    expect(screen.textContent).toContain('Platform Engineer at Acme');
    expect(screen.textContent).toContain('Applied, listed 3 days ago');
    expect(screen.textContent).not.toContain('Job link');
  });

  it('recognises a job saved by hand from the same link', async () => {
    const saved = makeJob({
      id: 'manual:old',
      source: 'other',
      title: 'Platform Engineer',
      company: 'Acme',
      url: 'https://careers.acme.com/jobs/42/',
    });

    const screen = await reachTracked(
      [saved],
      snapshotOf({ url: 'https://careers.acme.com/jobs/42?utm_source=x#apply' }),
    );

    expect(screen.textContent).toContain('Platform Engineer at Acme');
  });

  it('describes a job that has no title or company', async () => {
    const blank = makeJob({ id: 'seek:123', title: '', company: '', needsReview: true });

    const screen = await reachTracked([blank], snapshotOf({ url: 'https://au.seek.com/job/123' }));

    expect(screen.textContent).toContain('Untitled job');
    expect(screen.textContent).not.toContain(' at ');
  });

  it('goes back to the home view', async () => {
    const screen = await reachTracked(
      [tracked],
      snapshotOf({ url: 'https://au.seek.com/job/123' }),
    );

    await settle(() => buttonNamed(screen, 'Back').click());

    await until(() => expect(screen.textContent).toContain('Recent'));
    expect(screen.textContent).not.toContain('Already tracked');
  });

  it('opens the sheet on that job and closes the popup', async () => {
    const screen = await reachTracked(
      [tracked],
      snapshotOf({ url: 'https://au.seek.com/job/123' }),
    );
    stubContexts([]);
    const create = vi.spyOn(fakeBrowser.tabs, 'create');

    await settle(() => buttonNamed(screen, 'Show in sheet').click());

    await until(() => expect(window.close).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledExactlyOnceWith({
      url: expect.stringMatching(/\/sheet\.html#job=seek%3A123&t=\d+$/),
    });
  });
});
