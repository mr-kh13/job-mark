// @vitest-environment-options {"url": "https://au.seek.com/job/10000001"}
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyButton } from '@/content/click-classifier';
import { listenForClicks } from '@/content/click-listener';
import type { ClickMessage } from '@/messages/click';
import { userClick } from '@/test-utils/user-click';
import { normalizeText } from '@/utils/text';
import { SEEK_MATCHES, extractSeek, readSeekJob, refFromSeekUrl, seek } from './seek';

const JOB_PAGE = '/job/10000001';

const load = (name: string) => {
  document.documentElement.innerHTML = readFileSync(
    resolve(process.cwd(), 'src/sites/fixtures', name),
    'utf-8',
  );
};

const TITLE = 'h1[data-automation="job-detail-title"]';
const HOME_URL = 'https://au.seek.com/';
// The job in seek-au-home-panel.html, as the listener reports it.
const HOME_JOB = {
  id: 'seek:10000004',
  source: 'seek',
  title: 'Software Engineer - Full Stack AI',
  company: 'Northwind Australia Pty Ltd',
  location: 'Cremorne, Melbourne VIC',
  workType: 'Full time',
  salary: '$100,000 – $120,000 per year + bonus (package)',
  applyType: 'quick',
  url: 'https://au.seek.com/job/10000004',
};

const panel = () => document.querySelector('[data-automation="jobDetailsPage"]')!;
const applyButton = () => document.querySelector('[data-automation="job-detail-apply"]')!;
const saveButton = () =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save')!;

describe('SEEK_MATCHES', () => {
  it('lists one match pattern per market', () => {
    expect(SEEK_MATCHES).toEqual(['https://au.seek.com/*', 'https://nz.seek.com/*']);
  });

  it('only matches pages on which extractSeek recognises a job', () => {
    load('seek-au-quick.html');

    for (const pattern of SEEK_MATCHES) {
      const jobUrl = pattern.replace('/*', '/job/10000001');
      expect(extractSeek(document, jobUrl), pattern).not.toBeNull();
    }
  });
});

describe('extractSeek', () => {
  it('reads an AU Quick apply job page', () => {
    load('seek-au-quick.html');

    expect(extractSeek(document, 'https://au.seek.com/job/10000001')).toEqual({
      id: 'seek:10000001',
      source: 'seek',
      title: 'Software Engineer / Full Stack Engineer (All Levels, Several Positions)',
      company: 'Wingtip Innovations',
      location: 'Springfield Central, Brisbane QLD',
      workType: 'Full time',
      salary: '$70,000 to $130,000 plus super',
      applyType: 'quick',
      url: 'https://au.seek.com/job/10000001',
    });
  });

  it('reads the NZ market with its own id prefix and host', () => {
    load('seek-nz-quick.html');

    const job = extractSeek(document, 'https://nz.seek.com/job/10000002?ref=example');

    expect(job).toMatchObject({
      id: 'seek-nz:10000002',
      title: 'AI Development Engineer',
      company: 'Litware',
      location: 'Wairau Valley, Auckland',
      applyType: 'quick',
      url: 'https://nz.seek.com/job/10000002',
    });
  });

  it('marks an external Apply and keeps invisible characters out of the fields', () => {
    load('seek-nz-external.html');

    const job = extractSeek(document, 'https://nz.seek.com/job/10000003')!;

    expect(job.applyType).toBe('external');
    for (const value of [job.title, job.company, job.location]) {
      expect(value).toBe(normalizeText(value));
    }
  });

  it('takes the job id from ?jobId= on a search page (split view)', () => {
    load('seek-au-quick.html');

    const job = extractSeek(
      document,
      'https://au.seek.com/software-engineer-jobs?jobId=10000001&type=example',
    );

    expect(job?.id).toBe('seek:10000001');
    expect(job?.url).toBe('https://au.seek.com/job/10000001');
  });

  it('returns null off Seek job URLs, unknown hosts, or with no details panel', () => {
    load('seek-au-quick.html');
    expect(extractSeek(document, 'https://au.seek.com/software-engineer-jobs')).toBeNull();
    expect(extractSeek(document, 'https://www.example.com/job/10000001')).toBeNull();

    panel().remove();
    expect(extractSeek(document, 'https://au.seek.com/job/10000001')).toBeNull();
  });

  it('leaves a missing company empty so the job gets flagged for review', () => {
    load('seek-au-quick.html');
    document.querySelector('[data-automation="advertiser-name"]')!.remove();

    const job = extractSeek(document, 'https://au.seek.com/job/10000001')!;

    expect(job.company).toBe('');
    expect(job.title).not.toBe('');
  });

  it('falls back to the h1 when the title selector breaks', () => {
    load('seek-au-quick.html');
    document.querySelector('h1')!.removeAttribute('data-automation');

    const job = extractSeek(document, 'https://au.seek.com/job/10000001')!;

    expect(job.title).toBe(
      'Software Engineer / Full Stack Engineer (All Levels, Several Positions)',
    );
  });

  it('reads an unknown apply type when the Apply control is missing', () => {
    load('seek-au-quick.html');
    applyButton().remove();

    const job = extractSeek(document, 'https://au.seek.com/job/10000001')!;

    expect(job.applyType).toBe('unknown');
  });
});

describe('seek adapter', () => {
  // The document outlives each test, so these listeners are registered once for the whole file.
  listenForClicks(seek);
  // Stops jsdom trying to follow links after the listener has run.
  document.addEventListener('click', (event) => event.preventDefault());

  let received: ClickMessage[] = [];

  beforeEach(() => {
    fakeBrowser.reset();
    received = [];
    fakeBrowser.runtime.onMessage.addListener((message) => {
      received.push(message as ClickMessage);
    });
  });

  afterEach(() => {
    history.pushState({}, '', JOB_PAGE);
  });

  const click = userClick;
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('finds the job panel around a button inside it', () => {
    load('seek-au-quick.html');

    expect(seek.details(applyButton())).toBe(panel());
    expect(seek.details(saveButton())).toBe(panel());
  });

  it('finds no panel for the buttons on a results card', () => {
    load('seek-au-list-card.html');
    const buttons = document.querySelectorAll('button');

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(seek.details(button)).toBeNull();
  });

  it('reads Quick apply and Save as clicks on the job in the page', async () => {
    load('seek-au-quick.html');

    click(applyButton());
    click(saveButton());

    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received.map((message) => message.kind)).toEqual(['apply', 'save']);
    expect(received[0]?.job).toMatchObject({
      id: 'seek:10000001',
      company: 'Wingtip Innovations',
      applyType: 'quick',
    });
  });

  it('reads a plain Apply that ends in an invisible word joiner as an Apply', () => {
    load('seek-nz-external.html');
    const apply = applyButton();

    expect(apply.textContent).not.toBe(normalizeText(apply.textContent));
    expect(classifyButton(apply)).toBe('apply');
  });

  it('sends nothing for look-alike controls inside the panel', async () => {
    load('seek-au-quick.html');
    const labels = ['Applied', 'Saved', 'Unsave', 'Save search', 'Save job alert', 'Saved jobs'];
    for (const label of labels)
      panel().insertAdjacentHTML('beforeend', `<button>${label}</button>`);
    const lookAlikes = Array.from(panel().querySelectorAll('button')).filter((button) =>
      labels.includes(normalizeText(button.textContent)),
    );

    expect(lookAlikes).toHaveLength(labels.length);
    for (const button of lookAlikes) click(button);

    await settle();
    expect(received).toEqual([]);
  });

  it('sends nothing for the buttons on a results card', async () => {
    load('seek-au-list-card.html');

    for (const button of document.querySelectorAll('button')) click(button);

    await settle();
    expect(received).toEqual([]);
  });

  it('sends nothing when the page is not a job page', async () => {
    load('seek-au-quick.html');
    history.pushState({}, '', '/software-engineer-jobs');

    click(applyButton());

    await settle();
    expect(received).toEqual([]);
  });

  describe('on the home page, where the job panel has no marker and the address names no job', () => {
    beforeEach(() => {
      load('seek-au-home-panel.html');
      history.pushState({}, '', '/');
    });

    it('sends the Apply and Save clicks of the panel with the job from its title link', async () => {
      click(applyButton());
      click(saveButton());

      await vi.waitFor(() => expect(received).toHaveLength(2));
      expect(received.map((message) => message.kind)).toEqual(['apply', 'save']);
      expect(received[0]?.job).toEqual(HOME_JOB);
    });

    it('finds the same panel from the Apply and Save buttons', () => {
      const around = seek.details(applyButton());

      expect(around).not.toBeNull();
      expect(seek.details(saveButton())).toBe(around);
      expect(around?.contains(document.querySelector(TITLE))).toBe(true);
    });

    it('finds no panel for a button outside it when the page around both is large', async () => {
      document.body.insertAdjacentHTML(
        'afterbegin',
        `<div><button id="outside">Save</button><p>${'x'.repeat(2000)}</p></div>`,
      );

      expect(seek.details(document.getElementById('outside')!)).toBeNull();
      click(document.getElementById('outside')!);

      await settle();
      expect(received).toEqual([]);
    });

    it('finds the panel around a button that sits beside the company, away from the title', () => {
      document.body.innerHTML =
        '<div id="panel"><h1 data-automation="job-detail-title">T</h1>' +
        '<div><span data-automation="advertiser-name">C</span><button id="save">Save</button></div></div>';

      expect(seek.details(document.getElementById('save')!)).toBe(document.getElementById('panel'));
    });

    it('finds a panel of 1,500 characters and none of 1,501', () => {
      const panelOf = (length: number) => {
        // 1 character of title, 1 of company and 4 of button text, then the filler.
        document.body.innerHTML =
          '<div><h1 data-automation="job-detail-title">T</h1>' +
          '<span data-automation="advertiser-name">C</span>' +
          `<button id="save">Save</button><p>${'x'.repeat(length - 6)}</p></div>`;
        return seek.details(document.getElementById('save')!);
      };

      expect(panelOf(1500)).not.toBeNull();
      expect(panelOf(1501)).toBeNull();
    });

    it('finds no panel for a button that sits among several job titles', () => {
      const around = seek.details(saveButton())!;
      document.body.innerHTML = '';
      document.body.append(around.cloneNode(true), around.cloneNode(true));
      document.body.insertAdjacentHTML('beforeend', '<button id="loose">Save</button>');

      expect(document.querySelectorAll(TITLE)).toHaveLength(2);
      expect(seek.details(document.getElementById('loose')!)).toBeNull();
    });
  });
});

describe('extractSeek on the home page panel', () => {
  const homePanel = () => {
    load('seek-au-home-panel.html');
    return seek.details(saveButton())!;
  };
  const addJobPosting = (company: string) =>
    document.head.insertAdjacentHTML(
      'beforeend',
      `<script type="application/ld+json">{"@type":"JobPosting","title":"Other job","hiringOrganization":{"name":"${company}"}}</script>`,
    );

  it('reads the panel it is given, with the id from its title link', () => {
    expect(extractSeek(document, HOME_URL, homePanel())).toEqual(HOME_JOB);
  });

  it('reads nothing when it is given no panel and the page marks none', () => {
    homePanel();

    expect(extractSeek(document, HOME_URL)).toBeNull();
  });

  it('prefers the id in the title link over the address', () => {
    const job = extractSeek(document, 'https://au.seek.com/job/111', homePanel());

    expect(job?.id).toBe('seek:10000004');
    expect(job?.url).toBe('https://au.seek.com/job/10000004');
  });

  it('gives a New Zealand panel its own prefix and host', () => {
    const job = extractSeek(document, 'https://nz.seek.com/', homePanel());

    expect(job).toMatchObject({ id: 'seek-nz:10000004', url: 'https://nz.seek.com/job/10000004' });
  });

  it('leaves a missing company empty and ignores the posting of another job in the page', () => {
    const around = homePanel();
    around.querySelector('[data-automation="advertiser-name"]')!.remove();
    addJobPosting('Other Pty Ltd');

    expect(extractSeek(document, HOME_URL, around)?.company).toBe('');
  });

  it('ignores the page posting when the address names another job', () => {
    const around = homePanel();
    around.querySelector('[data-automation="advertiser-name"]')!.remove();
    addJobPosting('Other Pty Ltd');

    expect(extractSeek(document, 'https://au.seek.com/job/111', around)?.company).toBe('');
  });

  it('fills a missing company from the page posting when the address names the same job', () => {
    const around = homePanel();
    around.querySelector('[data-automation="advertiser-name"]')!.remove();
    addJobPosting('Other Pty Ltd');

    expect(extractSeek(document, 'https://au.seek.com/job/10000004', around)?.company).toBe(
      'Other Pty Ltd',
    );
  });
});

describe('refFromSeekUrl', () => {
  it.each([
    ['https://au.seek.com/job/123?ref=example', 'seek:123', 'https://au.seek.com/job/123'],
    ['https://nz.seek.com/job/9#apply', 'seek-nz:9', 'https://nz.seek.com/job/9'],
    ['https://au.seek.com/engineer-jobs?jobId=77', 'seek:77', 'https://au.seek.com/job/77'],
  ])('reads %s', (page, id, url) => {
    expect(refFromSeekUrl(new URL(page))).toEqual({ id, source: 'seek', url });
  });

  it.each([
    'https://au.seek.com/software-engineer-jobs',
    'https://au.seek.com/search?jobId=abc',
    'https://au.seek.com/search?jobId=12abc',
    'https://www.seek.com.au/job/123',
    'https://example.com/job/123',
  ])('ignores %s', (page) => {
    expect(refFromSeekUrl(new URL(page))).toBeUndefined();
  });

  it('gives a page the same id and link as extractSeek', () => {
    load('seek-au-quick.html');
    const page = 'https://au.seek.com/job/10000001?ref=example';

    const job = extractSeek(document, page);

    expect(refFromSeekUrl(new URL(page))).toEqual({
      id: job?.id,
      source: job?.source,
      url: job?.url,
    });
  });
});

describe('readSeekJob', () => {
  const heading = () => document.querySelector(TITLE)!;

  it('reads the job of a job page, as the click listener does', () => {
    load('seek-au-quick.html');
    const url = 'https://au.seek.com/job/10000001';

    const job = readSeekJob(document, url);

    expect(job).toEqual(extractSeek(document, url, panel()));
    expect(job).toMatchObject({ id: 'seek:10000001', applyType: 'quick' });
  });

  it('reads the id from the title link in the search split view, where the address names no job', () => {
    load('seek-au-quick.html');
    heading().innerHTML = '<a href="/job/10000001?ref=example">Software Engineer</a>';

    const job = readSeekJob(document, 'https://au.seek.com/software-engineer-jobs');

    expect(job?.id).toBe('seek:10000001');
  });

  it('gives a New Zealand job its own prefix', () => {
    load('seek-nz-quick.html');

    expect(readSeekJob(document, 'https://nz.seek.com/job/10000002')?.id).toBe('seek-nz:10000002');
  });

  it('reads the home page panel, which has no marker', () => {
    load('seek-au-home-panel.html');

    expect(readSeekJob(document, HOME_URL)).toEqual(HOME_JOB);
  });

  it('skips a title outside a job panel and reads the panel after it', () => {
    load('seek-au-quick.html');
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<h1 data-automation="job-detail-title"><a href="/job/999">Elsewhere</a></h1>',
    );

    expect(readSeekJob(document, 'https://au.seek.com/job/10000001')?.id).toBe('seek:10000001');
  });

  it('does not grow the home page panel into a container that holds another job title', () => {
    load('seek-au-home-panel.html');
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<h1 data-automation="job-detail-title"><a href="/job/999">Elsewhere</a></h1>',
    );

    expect(readSeekJob(document, HOME_URL)).toEqual(HOME_JOB);
  });

  it('reads nothing from a card of the results list, which is not a job panel', () => {
    load('seek-au-list-card.html');

    expect(readSeekJob(document, 'https://au.seek.com/job/10000001')).toBeNull();
  });

  it('reads nothing from a page with no job title', () => {
    document.body.innerHTML = '<main>Search results</main>';

    expect(readSeekJob(document, 'https://au.seek.com/software-engineer-jobs')).toBeNull();
  });

  it('reads nothing when neither the title link nor the address names a job', () => {
    load('seek-au-quick.html');

    expect(readSeekJob(document, 'https://au.seek.com/software-engineer-jobs')).toBeNull();
  });

  it('reads nothing on another site', () => {
    load('seek-au-quick.html');

    expect(readSeekJob(document, 'https://www.example.com/job/10000001')).toBeNull();
  });
});
