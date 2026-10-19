import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubInjection, stubTabReply, stubTabs } from '@/test-utils/browser-stubs';
import type { CapturedJob } from '@/messages/click';
import { makeJob } from '@/test-utils/make-job';
import {
  createDraft,
  findExisting,
  snapshotActiveTab,
  snapshotPage,
  type PageSnapshot,
} from './job-draft';

const ldScript = (text: string) => `<script type="application/ld+json">${text}</script>`;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = '';
});

describe('snapshotPage', () => {
  it('reads the signals from the live document', () => {
    document.head.innerHTML = `
      <meta name="description" content="Desc">
      <link rel="stylesheet" href="/s.css">
      <meta property="og:title" content="OG">
      <meta property="og:site_name" content="Acme">
      <link rel="canonical" href="/c">
      ${ldScript('{"a":1}')}${ldScript('{"b":2}')}`;
    document.title = 'Hello';
    document.body.innerHTML = '<h1>Big Title</h1><h1>Second</h1>';

    expect(snapshotPage()).toEqual({
      url: location.href,
      title: 'Hello',
      h1: 'Big Title',
      ogTitle: 'OG',
      ogSiteName: 'Acme',
      canonical: '/c',
      jsonLd: ['{"a":1}', '{"b":2}'],
    });
  });

  it('uses empty strings and an empty list for signals the page lacks', () => {
    expect(snapshotPage()).toEqual({
      url: location.href,
      title: '',
      h1: '',
      ogTitle: '',
      ogSiteName: '',
      canonical: '',
      jsonLd: [],
    });
  });

  it('reads only ld+json scripts', () => {
    document.head.innerHTML = `<script>var a = 1;</script>${ldScript('{"a":1}')}`;

    expect(snapshotPage().jsonLd).toEqual(['{"a":1}']);
  });

  it('reads at most 20 ld+json scripts', () => {
    document.head.innerHTML = Array.from({ length: 25 }, (_, i) => ldScript(`{"n":${i}}`)).join('');

    const { jsonLd } = snapshotPage();

    expect(jsonLd).toHaveLength(20);
    expect(jsonLd[19]).toBe('{"n":19}');
  });

  it('is self-contained: it still works when rebuilt from its source text', () => {
    // executeScript serialises the function, so it cannot rely on module scope.
    document.title = 'Hello';
    const rebuilt = new Function(`return (${snapshotPage.toString()})`)() as typeof snapshotPage;

    expect(rebuilt().title).toBe('Hello');
  });
});

describe('snapshotActiveTab', () => {
  const snapshot: PageSnapshot = {
    url: 'https://acme.com/jobs/1',
    title: 'Engineer',
    h1: 'Engineer',
    ogTitle: '',
    ogSiteName: 'Acme',
    canonical: '',
    jsonLd: [],
  };

  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns what the page script read from the active tab', async () => {
    const warn = vi.spyOn(console, 'warn');
    stubTabs([{ id: 7, url: 'https://acme.com/jobs/1', title: 'Tab title' }]);
    stubInjection(async (tabId) => (tabId === 7 ? [{ result: snapshot }] : []));

    expect(await snapshotActiveTab()).toEqual({ snapshot, isReadable: true, job: null });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['there is no active tab', []],
    ['the tab has no id', [{ url: 'https://acme.com/' }]],
    ['the tab has no URL', [{ id: 7 }]],
  ])('returns null when %s', async (_name, tabs) => {
    stubTabs(tabs);
    stubInjection(async () => [{ result: snapshot }]);

    expect(await snapshotActiveTab()).toBeNull();
  });

  it('falls back to the tab URL and title when the page cannot be read', async () => {
    stubTabs([{ id: 7, url: 'chrome://extensions', title: 'Extensions' }]);
    stubInjection(async () => {
      throw new Error('Cannot access a chrome:// URL');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await snapshotActiveTab()).toEqual({
      snapshot: {
        url: 'chrome://extensions',
        title: 'Extensions',
        h1: '',
        ogTitle: '',
        ogSiteName: '',
        canonical: '',
        jsonLd: [],
      },
      isReadable: false,
      job: null,
    });
  });

  it('logs why the page could not be read', async () => {
    const reason = new Error('Cannot access a chrome:// URL');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubTabs([{ id: 7, url: 'chrome://extensions' }]);
    stubInjection(async () => {
      throw reason;
    });

    await snapshotActiveTab();

    expect(warn).toHaveBeenCalledWith('Could not read the page', reason);
  });

  it.each([
    ['no injection result', async () => []],
    ['an injection without a result', async () => [{}]],
  ])('falls back to the tab when the script returns %s', async (_name, run) => {
    stubTabs([{ id: 7, url: 'https://acme.com/jobs/1' }]);
    stubInjection(run);

    const tab = await snapshotActiveTab();

    expect(tab?.isReadable).toBe(false);
    expect(tab?.snapshot).toMatchObject({ url: 'https://acme.com/jobs/1', title: '', h1: '' });
  });
});

const snap = (over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: over.url ?? 'https://careers.acme.com/jobs/42?utm_source=x#apply',
  title: over.title ?? 'Careers at Acme',
  h1: over.h1 ?? '',
  ogTitle: over.ogTitle ?? '',
  ogSiteName: over.ogSiteName ?? '',
  canonical: over.canonical ?? '',
  jsonLd: over.jsonLd ?? [],
});

const posting = (employmentType?: string) =>
  JSON.stringify({
    '@type': 'JobPosting',
    title: 'Platform Engineer',
    hiringOrganization: { name: 'Acme Pty Ltd' },
    jobLocation: { address: { addressLocality: 'Melbourne', addressRegion: 'VIC' } },
    employmentType,
  });

describe('createDraft fields', () => {
  it('prefers a JSON-LD JobPosting', () => {
    const draft = createDraft(
      snap({ jsonLd: [posting()], h1: 'Ignored', ogSiteName: 'Ignored too' }),
      'u',
    );

    expect(draft).toEqual({
      id: 'manual:u',
      source: 'other',
      title: 'Platform Engineer',
      company: 'Acme Pty Ltd',
      location: 'Melbourne, VIC',
      url: 'https://careers.acme.com/jobs/42',
    });
  });

  it('splits the JSON-LD employment type into the work arrangement and employment type', () => {
    const draft = createDraft(snap({ jsonLd: [posting('FULL_TIME')] }), 'u');

    expect(draft.employmentType).toBe('Full-time');
    expect(draft.workArrangement).toBeUndefined();
  });

  it('falls back to the h1, then og:title, then the page title', () => {
    expect(createDraft(snap({ h1: 'Data Analyst', ogTitle: 'OG', title: 'Tab' }), 'u').title).toBe(
      'Data Analyst',
    );
    expect(createDraft(snap({ ogTitle: 'OG', title: 'Tab' }), 'u').title).toBe('OG');
    expect(createDraft(snap({ title: 'Careers at Acme' }), 'u').title).toBe('Careers at Acme');
  });

  it('takes the company from og:site_name when the page has no JobPosting', () => {
    const draft = createDraft(snap({ h1: 'Data Analyst', ogSiteName: ' Acme ' }), 'u');

    expect(draft).toMatchObject({ title: 'Data Analyst', company: 'Acme', location: '' });
  });

  it('leaves the fields empty for a page that gave the tab title and nothing else', () => {
    const draft = createDraft(snap({ title: '' }), 'u');

    expect(draft).toMatchObject({ title: '', company: '', location: '' });
  });
});

describe('createDraft job reference', () => {
  it('gives a Seek job page the id and link that automatic capture gives it', () => {
    const draft = createDraft(snap({ url: 'https://au.seek.com/job/123?ref=x', h1: 'Dev' }), 'u');

    expect(draft).toMatchObject({
      id: 'seek:123',
      source: 'seek',
      url: 'https://au.seek.com/job/123',
    });
  });

  it('uses a same-site canonical link, resolved against the page', () => {
    const draft = createDraft(snap({ canonical: '/jobs/42-canonical' }), 'u');

    expect(draft.url).toBe('https://careers.acme.com/jobs/42-canonical');
  });

  it('recognises a Seek job through the canonical link of a page that shows no job itself', () => {
    const page = snap({
      url: 'https://au.seek.com/software-engineer-jobs',
      canonical: 'https://au.seek.com/job/456',
    });

    expect(createDraft(page, 'u').id).toBe('seek:456');
  });

  it.each([
    ['another site', 'https://evil.example/x'],
    ['a different subdomain', 'https://jobs.acme.com/jobs/42'],
    ['a link that is no web page', 'javascript:alert(1)'],
    ['a link without a host', 'http://'],
  ])('ignores a canonical link that points to %s', (_name, canonical) => {
    expect(createDraft(snap({ canonical }), 'u').url).toBe('https://careers.acme.com/jobs/42');
  });

  it.each([
    ['a browser page', 'chrome://extensions', ''],
    ['a local file', 'file:///jobs/42.html', ''],
    ['a blank page', 'about:blank', ''],
    ['a page whose canonical link is a script', 'file:///jobs/42.html', 'javascript:alert(1)'],
  ])('leaves the link empty for %s, which no job can link to', (_name, url, canonical) => {
    const draft = createDraft(snap({ url, canonical }), 'u');

    expect(draft).toMatchObject({ id: 'manual:u', source: 'other', url: '' });
  });
});

describe('findExisting', () => {
  const jobs = [
    makeJob({ id: 'seek:1', url: 'https://au.seek.com/job/1' }),
    makeJob({ id: 'manual:old', source: 'other', url: 'https://acme.com/j/1/' }),
  ];

  it('matches a job by id', () => {
    expect(findExisting(jobs, { id: 'seek:1', url: 'https://elsewhere.com/' })?.id).toBe('seek:1');
  });

  it('matches a manual draft to a job saved from the same page, ignoring tracking and slashes', () => {
    const draft = { id: 'manual:new', url: 'https://acme.com/j/1?utm_source=x#top' };

    expect(findExisting(jobs, draft)?.id).toBe('manual:old');
  });

  it('does not match a Seek or LinkedIn draft by link', () => {
    expect(findExisting(jobs, { id: 'seek:2', url: 'https://acme.com/j/1' })).toBeUndefined();
  });

  it('never matches by link when the draft has none', () => {
    const linkless = [makeJob({ id: 'manual:old', source: 'other', url: '' })];

    expect(findExisting(linkless, { id: 'manual:new', url: '' })).toBeUndefined();
  });

  it('finds nothing for a new job', () => {
    expect(findExisting(jobs, { id: 'manual:new', url: 'https://acme.com/j/2' })).toBeUndefined();
    expect(findExisting([], { id: 'manual:new', url: 'https://acme.com/j/2' })).toBeUndefined();
  });
});

const LINKEDIN_URL = 'https://www.linkedin.com/jobs/search-results/?currentJobId=1000000001';
const LINKEDIN_TITLE = 'Senior Frontend Engineer | Fabrikam | LinkedIn';

const makeCaptured = (over: Partial<CapturedJob> = {}): CapturedJob => ({
  id: over.id ?? 'linkedin:1000000001',
  source: over.source ?? 'linkedin',
  title: over.title ?? 'Senior Frontend Engineer',
  company: over.company ?? 'Fabrikam',
  location: over.location ?? 'Sydney, New South Wales, Australia',
  workType: over.workType ?? 'Hybrid, Full-time',
  salary: over.salary,
  applyType: over.applyType ?? 'easy',
  url: over.url ?? 'https://www.linkedin.com/jobs/view/1000000001/',
});

describe('snapshotActiveTab with a Jobmark content script on the page', () => {
  const pageSnapshot = snap({ url: LINKEDIN_URL, title: LINKEDIN_TITLE });

  beforeEach(() => {
    fakeBrowser.reset();
    stubTabs([{ id: 7, url: LINKEDIN_URL, title: LINKEDIN_TITLE }]);
    stubInjection(async () => [{ result: pageSnapshot }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the job the page script read, with the page snapshot', async () => {
    stubTabReply(() => makeCaptured());

    expect(await snapshotActiveTab()).toEqual({
      snapshot: pageSnapshot,
      isReadable: true,
      job: makeCaptured(),
    });
  });

  it('asks the active tab, and only that tab, for its job', async () => {
    const ask = stubTabReply(() => makeCaptured());

    await snapshotActiveTab();

    expect(ask).toHaveBeenCalledExactlyOnceWith(7, { type: 'read-job' });
  });

  it('returns no job when the page script answers null', async () => {
    stubTabReply(() => null);

    expect((await snapshotActiveTab())?.job).toBeNull();
  });

  it('returns no job, and logs nothing, when the tab has no content script', async () => {
    const warn = vi.spyOn(console, 'warn');
    stubTabReply(() => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });

    const tab = await snapshotActiveTab();

    expect(tab).toMatchObject({ job: null, isReadable: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['text', 'Senior Frontend Engineer'],
    ['an object with a link that is not a web link', makeCaptured({ url: 'javascript:alert(1)' })],
    ['an object with a field of the wrong type', makeCaptured({ title: 42 as never })],
    ['an object missing the id', { title: 'Senior Frontend Engineer' }],
    ['undefined', undefined],
  ])('returns no job when the answer is %s', async (_label, answer) => {
    stubTabReply(() => answer);

    expect((await snapshotActiveTab())?.job).toBeNull();
  });

  it('counts the page as readable when only the content script could read it', async () => {
    stubTabReply(() => makeCaptured());
    stubInjection(async () => {
      throw new Error('Cannot access contents of the page');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tab = await snapshotActiveTab();

    expect(tab).toMatchObject({ isReadable: true, job: makeCaptured() });
    expect(tab?.snapshot.url).toBe(LINKEDIN_URL);
  });
});

describe('createDraft with the job read from the page', () => {
  const linkedInTab = snap({ url: LINKEDIN_URL, title: LINKEDIN_TITLE });

  it('fills every field from the job', () => {
    const job = makeCaptured({ salary: '$150K/yr - $180K/yr' });

    expect(createDraft(linkedInTab, 'u', job)).toEqual({
      id: 'linkedin:1000000001',
      source: 'linkedin',
      title: 'Senior Frontend Engineer',
      company: 'Fabrikam',
      location: 'Sydney, New South Wales, Australia',
      workArrangement: 'Hybrid',
      employmentType: 'Full-time',
      salary: '$150K/yr - $180K/yr',
      url: 'https://www.linkedin.com/jobs/view/1000000001/',
    });
  });

  it('takes the id and link of the job when the address names no job', () => {
    const seekJob = makeCaptured({
      id: 'seek:10000004',
      source: 'seek',
      url: 'https://au.seek.com/job/10000004',
    });

    const draft = createDraft(snap({ url: 'https://au.seek.com/', title: 'SEEK' }), 'u', seekJob);

    expect(draft).toMatchObject({ id: 'seek:10000004', url: 'https://au.seek.com/job/10000004' });
  });

  it('prefers the job over the signals of the page', () => {
    const page = snap({
      url: LINKEDIN_URL,
      title: LINKEDIN_TITLE,
      h1: 'Other title',
      jsonLd: [posting('PART_TIME')],
    });

    expect(createDraft(page, 'u', makeCaptured())).toMatchObject({
      title: 'Senior Frontend Engineer',
      company: 'Fabrikam',
      employmentType: 'Full-time',
    });
  });

  it('fills a field the job lacks from the page, field by field', () => {
    const lacking = makeCaptured({ company: '', location: '', workType: '' });
    const page = snap({ url: LINKEDIN_URL, title: LINKEDIN_TITLE, jsonLd: [posting('PART_TIME')] });

    expect(createDraft(page, 'u', lacking)).toMatchObject({
      title: 'Senior Frontend Engineer',
      company: 'Acme Pty Ltd',
      location: 'Melbourne, VIC',
      employmentType: 'Part-time',
    });
  });
});

describe('createDraft from the tab title of a Seek or LinkedIn page', () => {
  it('splits a LinkedIn tab title into the title and the company, and ignores the site name', () => {
    const draft = createDraft(
      snap({
        url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=1000000001',
        title: 'Software Engineer | Tailspin | LinkedIn',
        ogSiteName: 'LinkedIn',
      }),
      'u',
    );

    expect(draft).toMatchObject({
      id: 'linkedin:1000000001',
      title: 'Software Engineer',
      company: 'Tailspin',
      url: 'https://www.linkedin.com/jobs/view/1000000001/',
    });
  });

  it('splits a Seek tab title into the title and the place, and ignores the site name', () => {
    const draft = createDraft(
      snap({
        url: 'https://au.seek.com/job/10000001',
        title: 'Software Engineer Job in Springfield Central, Brisbane QLD - SEEK',
        ogSiteName: 'SEEK',
      }),
      'u',
    );

    expect(draft).toMatchObject({
      id: 'seek:10000001',
      title: 'Software Engineer',
      company: '',
      location: 'Springfield Central, Brisbane QLD',
    });
  });

  it('prefers the company of a JSON-LD posting over the one in the tab title', () => {
    const draft = createDraft(
      snap({
        url: 'https://www.linkedin.com/jobs/view/1000000001/',
        title: 'Software Engineer | Tailspin | LinkedIn',
        jsonLd: [posting()],
      }),
      'u',
    );

    expect(draft).toMatchObject({ title: 'Platform Engineer', company: 'Acme Pty Ltd' });
  });

  it('keeps the site name as the company on a site that is not Seek or LinkedIn', () => {
    const draft = createDraft(snap({ title: 'Data Analyst', ogSiteName: 'Acme' }), 'u');

    expect(draft).toMatchObject({ title: 'Data Analyst', company: 'Acme' });
  });
});
