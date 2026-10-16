// @vitest-environment-options {"url": "https://www.linkedin.com/jobs/search-results/"}
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForClicks } from '@/content/click-listener';
import { ClickMessage } from '@/messages/click';
import { userClick } from '@/test-utils/user-click';
import { LINKEDIN_MATCHES, linkedin, readLinkedInJob, refFromLinkedInUrl } from './linkedin';

const JOB_PAGE_PATH = '/jobs/view/1000000002/';
const JOB_PAGE_URL = `https://www.linkedin.com${JOB_PAGE_PATH}`;

const loadFixture = (name: string) => {
  document.documentElement.innerHTML = readFileSync(
    resolve(process.cwd(), 'src/sites/fixtures', name),
    'utf-8',
  );
};
const load = () => loadFixture('linkedin-split-view.html');

const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const applyButton = () => byLabel('Easy Apply to this job');
const saveButton = () => byLabel('Save the job');
const topCard = () => linkedin.details(saveButton())!;

describe('LINKEDIN_MATCHES', () => {
  it('covers the whole domain, because LinkedIn is a single-page app', () => {
    expect(LINKEDIN_MATCHES).toEqual(['https://www.linkedin.com/*']);
  });
});

describe('linkedin.details', () => {
  beforeEach(load);

  it('finds the top card from the Apply button and from the Save button', () => {
    const card = linkedin.details(applyButton());

    expect(card).not.toBeNull();
    expect(linkedin.details(saveButton())).toBe(card);
  });

  it('finds nothing for the Easy Apply search filter, which is outside any job pane', () => {
    expect(linkedin.details(byLabel('Filter by Easy Apply'))).toBeNull();
  });

  it('finds nothing once the container has grown to the whole pane', () => {
    const filler = document.createElement('p');
    filler.textContent = 'x'.repeat(2000);
    document.querySelector('#top-card > div')!.append(filler);

    expect(linkedin.details(saveButton())).toBeNull();
  });

  it('needs both the title link and the company link', () => {
    document.querySelectorAll('#top-card a[href*="/company/"]').forEach((a) => a.remove());

    expect(linkedin.details(saveButton())).toBeNull();
  });

  it('only looks a limited number of levels up from the button', () => {
    const cardWithButtonNested = (depth: number) => `
      <div id="card">
        <a href="https://www.linkedin.com/jobs/view/1/">Job one</a>
        <a href="https://www.linkedin.com/company/a/">A</a>
        ${'<div>'.repeat(depth)}<button id="nested">Save</button>${'</div>'.repeat(depth)}
      </div>
    `;

    document.body.innerHTML = cardWithButtonNested(3);
    expect(linkedin.details(document.getElementById('nested')!)).toBe(
      document.getElementById('card'),
    );

    document.body.innerHTML = cardWithButtonNested(15);
    expect(linkedin.details(document.getElementById('nested')!)).toBeNull();
  });

  it('finds nothing in a small wrapper that shows more than one job', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <button id="outside">Apply</button>
        <div id="card-a">
          <a href="https://www.linkedin.com/jobs/view/1/">Job one</a>
          <a href="https://www.linkedin.com/company/a/">A</a>
          <button id="save-a">Save</button>
        </div>
        <div id="card-b">
          <a href="https://www.linkedin.com/jobs/view/2/">Job two</a>
          <a href="https://www.linkedin.com/company/b/">B</a>
        </div>
      </div>
    `;

    expect(linkedin.details(document.getElementById('outside')!)).toBeNull();
    expect(linkedin.details(document.getElementById('save-a')!)).toBe(
      document.getElementById('card-a'),
    );
  });
});

describe('linkedin.extract', () => {
  beforeEach(load);

  it('reads the job in the top card', () => {
    expect(linkedin.extract(topCard())).toEqual({
      id: 'linkedin:1000000001',
      source: 'linkedin',
      title: 'Senior Frontend Engineer',
      company: 'Fabrikam',
      location: 'Sydney, New South Wales, Australia',
      workType: 'Hybrid, Full-time',
      salary: undefined,
      applyType: 'easy',
      url: 'https://www.linkedin.com/jobs/view/1000000001/',
    });
  });

  it('puts a $ chip in salary and leaves it out of the work type', () => {
    document.querySelector('#top-card a[href*="/jobs/search-results"]')!.textContent =
      '$150K/yr - $180K/yr';

    const job = linkedin.extract(topCard())!;

    expect(job.salary).toBe('$150K/yr - $180K/yr');
    expect(job.workType).toBe('Full-time');
  });

  it('ignores a chip that is long enough to be prose', () => {
    document.querySelector('#top-card a[href*="/jobs/search-results"]')!.textContent = 'x'.repeat(
      41,
    );

    expect(linkedin.extract(topCard())?.workType).toBe('Full-time');
  });

  it('marks an Apply button that is not Easy Apply as external', () => {
    applyButton().textContent = 'Apply';

    expect(linkedin.extract(topCard())?.applyType).toBe('external');
  });

  it('reads an unknown apply type when the card has no Apply button', () => {
    applyButton().remove();

    expect(linkedin.extract(topCard())?.applyType).toBe('unknown');
  });

  it('never takes the "Promoted by hirer" line for the location', () => {
    const locationLine = Array.from(document.querySelectorAll('#top-card p')).find((p) =>
      p.textContent?.startsWith('Sydney'),
    )!;
    locationLine.remove();

    expect(linkedin.extract(topCard())?.location).toBe('');
  });

  it('returns null when the container has no job link', () => {
    expect(linkedin.extract(document.createElement('div'))).toBeNull();
  });
});

describe('linkedin adapter with the click listener', () => {
  // The document outlives each test, so these listeners are registered once for the whole file.
  listenForClicks(linkedin);
  // Stops jsdom trying to follow links after the listener has run.
  document.addEventListener('click', (event) => event.preventDefault());

  let received: ClickMessage[] = [];

  beforeEach(() => {
    load();
    fakeBrowser.reset();
    received = [];
    fakeBrowser.runtime.onMessage.addListener((message) => {
      received.push(message as ClickMessage);
    });
  });

  const click = userClick;
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('sends an apply and a save click for the same job', async () => {
    click(applyButton());
    click(saveButton());

    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received.map((message) => message.kind)).toEqual(['apply', 'save']);
    expect(received.map((message) => message.job.id)).toEqual([
      'linkedin:1000000001',
      'linkedin:1000000001',
    ]);
    expect(received[0]?.job.applyType).toBe('easy');
  });

  it('sends a job that passes the message contract', async () => {
    click(saveButton());

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(ClickMessage.safeParse(received[0]).success).toBe(true);
  });

  it.each([
    ['the Easy Apply filter', () => byLabel('Filter by Easy Apply')],
    ['the filter label', () => document.querySelector('#filters label')!],
    ['a result card link', () => document.querySelector('#results a')!],
    ['inside a result card', () => document.querySelector('#results li div:last-child')!],
    ['More options', () => byLabel('More options')],
    ['a heading', () => document.querySelector('h2')!],
  ])('sends nothing for a click on %s', async (_label, find) => {
    click(find());

    await settle();
    expect(received).toEqual([]);
  });
});

describe('refFromLinkedInUrl', () => {
  it.each([
    [
      'https://www.linkedin.com/jobs/view/55/?trk=x',
      'linkedin:55',
      'https://www.linkedin.com/jobs/view/55/',
    ],
    [
      'https://www.linkedin.com/jobs/search-results/?currentJobId=77&x=1',
      'linkedin:77',
      'https://www.linkedin.com/jobs/view/77/',
    ],
    [
      'https://www.linkedin.com/jobs/view/55/?currentJobId=77',
      'linkedin:55',
      'https://www.linkedin.com/jobs/view/55/',
    ],
  ])('reads %s', (page, id, url) => {
    expect(refFromLinkedInUrl(new URL(page))).toEqual({ id, source: 'linkedin', url });
  });

  it.each([
    'https://www.linkedin.com/feed/',
    'https://www.linkedin.com/jobs/search-results/?currentJobId=abc',
    'https://www.linkedin.com/jobs/search-results/?currentJobId=12abc',
    'https://example.com/jobs/view/55/',
    'https://au.linkedin.com/jobs/view/55/',
  ])('ignores %s', (page) => {
    expect(refFromLinkedInUrl(new URL(page))).toBeUndefined();
  });

  it('gives a page the same id and link as the top card', () => {
    load();
    const job = linkedin.extract(topCard());

    const jobRef = refFromLinkedInUrl(new URL('https://www.linkedin.com/jobs/view/1000000001/'));

    expect(jobRef).toEqual({ id: job?.id, source: job?.source, url: job?.url });
  });
});

describe('a job page opened directly, where the title is a plain paragraph and the chips link to the job', () => {
  const chip = (label: string) =>
    Array.from(document.querySelectorAll('a')).find((a) => a.textContent?.trim() === label)!;
  const titleLine = () =>
    Array.from(document.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Senior Frontend Engineer'),
    )!;
  const companyLink = () => document.querySelector('a[href*="/company/"]')!;
  const card = () => linkedin.details(chip('Hybrid'))!;

  beforeEach(() => {
    loadFixture('linkedin-job-page.html');
    history.pushState({}, '', JOB_PAGE_PATH);
  });

  afterEach(() => {
    history.pushState({}, '', '/jobs/search-results/');
  });

  it('finds the same top card from each chip and from the company link', () => {
    expect(card()).not.toBeNull();
    expect(linkedin.details(chip('Full-time'))).toBe(card());
    expect(linkedin.details(companyLink())).toBe(card());
  });

  it('reads the title from its paragraph, and the chips as the work type', () => {
    expect(linkedin.extract(card())).toEqual({
      id: 'linkedin:1000000002',
      source: 'linkedin',
      title: 'Senior Frontend Engineer',
      company: 'Contoso Group',
      location: 'Sydney, New South Wales, Australia',
      workType: 'Hybrid, Full-time',
      salary: undefined,
      applyType: 'unknown',
      url: JOB_PAGE_URL,
    });
  });

  it('puts a $ chip in the salary and leaves it out of the work type', () => {
    const around = card();
    chip('Hybrid').textContent = '$100,000 a year';

    const job = linkedin.extract(around);

    expect(job).toMatchObject({ salary: '$100,000 a year', workType: 'Full-time' });
  });

  it('still finds and reads the card when the job shows no chips', () => {
    chip('Hybrid').remove();
    chip('Full-time').remove();

    const job = linkedin.extract(linkedin.details(companyLink())!);

    expect(job).toMatchObject({ id: 'linkedin:1000000002', title: 'Senior Frontend Engineer' });
    expect(job?.workType).toBeUndefined();
  });

  it('reads nothing when the paragraph above the location line is the company name', () => {
    titleLine().remove();

    expect(linkedin.extract(card())).toBeNull();
  });

  it('finds no card once the part around the location line has grown to the whole page', () => {
    const filler = document.createElement('p');
    filler.textContent = 'x'.repeat(2000);
    const location = Array.from(document.querySelectorAll('p')).find((line) =>
      line.textContent?.includes('·'),
    )!;
    location.parentElement!.append(filler);

    expect(linkedin.details(chip('Hybrid'))).toBeNull();
  });

  it('stops at the card, and never takes the page body for one', () => {
    const around = card();

    expect(around).not.toBe(document.body);
    expect(around.parentElement).toBe(document.body);
  });

  it('finds no card without a company link', () => {
    document.querySelectorAll('a[href*="/company/"]').forEach((link) => link.remove());

    expect(linkedin.details(chip('Hybrid'))).toBeNull();
  });

  it('finds no card without a location line', () => {
    document.querySelectorAll('p').forEach((line) => {
      if (line.textContent?.includes('·')) line.remove();
    });

    expect(linkedin.details(chip('Hybrid'))).toBeNull();
  });
});

describe('readLinkedInJob', () => {
  const SEARCH_URL = 'https://www.linkedin.com/jobs/search-results/?currentJobId=1000000001';

  describe('in the search split view', () => {
    beforeEach(load);

    it('reads the job in the top card, as the click listener does', () => {
      const job = readLinkedInJob(document, SEARCH_URL);

      expect(job).toEqual(linkedin.extract(topCard()));
      expect(job).toMatchObject({
        id: 'linkedin:1000000001',
        title: 'Senior Frontend Engineer',
        company: 'Fabrikam',
        workType: 'Hybrid, Full-time',
      });
    });

    it('reads the top card and not the link to the same job in the results list', () => {
      document.querySelectorAll('#results a[href*="/jobs/view/"]').forEach((link) => {
        link.textContent = 'Listed title';
      });

      expect(readLinkedInJob(document, SEARCH_URL)?.title).toBe('Senior Frontend Engineer');
    });

    it('reads nothing once the container has grown to the whole pane', () => {
      const filler = document.createElement('p');
      filler.textContent = 'x'.repeat(2000);
      document.querySelector('#top-card > div')!.append(filler);

      expect(readLinkedInJob(document, SEARCH_URL)).toBeNull();
    });

    it('reads nothing when the title link has no text, such as one around a logo', () => {
      document.querySelectorAll('#top-card a[href*="/jobs/view/"]').forEach((link) => {
        link.textContent = '';
      });

      expect(readLinkedInJob(document, SEARCH_URL)).toBeNull();
    });
  });

  it('does not grow the top card into a container that holds another job', () => {
    document.body.innerHTML = `
      <div id="wrapper">
        <a href="https://www.linkedin.com/jobs/view/222/">Other job</a>
        <div id="card">
          <a href="https://www.linkedin.com/jobs/view/111/">Wanted job</a>
          <a href="https://www.linkedin.com/company/acme/">Acme</a>
        </div>
      </div>`;

    expect(readLinkedInJob(document, SEARCH_URL)).toMatchObject({
      id: 'linkedin:111',
      title: 'Wanted job',
      company: 'Acme',
    });
  });

  it('reads nothing from a page with no job', () => {
    document.body.innerHTML = '<main><p>Your feed</p></main>';

    expect(readLinkedInJob(document, 'https://www.linkedin.com/feed/')).toBeNull();
  });

  describe('on a job page opened directly', () => {
    beforeEach(() => {
      loadFixture('linkedin-job-page.html');
      history.pushState({}, '', JOB_PAGE_PATH);
    });

    afterEach(() => {
      history.pushState({}, '', '/jobs/search-results/');
    });

    it('reads the job in the first card, as the click listener does', () => {
      const chip = Array.from(document.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Hybrid',
      )!;

      const job = readLinkedInJob(document, JOB_PAGE_URL);

      expect(job).toEqual(linkedin.extract(linkedin.details(chip)!));
      expect(job).toMatchObject({
        id: 'linkedin:1000000002',
        title: 'Senior Frontend Engineer',
        company: 'Contoso Group',
      });
    });

    it('reads nothing when the page has no location line', () => {
      document
        .querySelectorAll('p')
        .forEach((line) => line.textContent?.includes('·') && line.remove());

      expect(readLinkedInJob(document, JOB_PAGE_URL)).toBeNull();
    });
  });
});
