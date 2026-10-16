// @vitest-environment-options {"url": "https://au.seek.com/job/10000001"}
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageJobMessage } from '@/messages/page-job';
import { refFromSeekUrl } from '@/sites/seek';
import { jobKey } from '@/store/job-key';
import { makeJob } from '@/test-utils/make-job';
import { reportPageJob } from './page-job';

let received: PageJobMessage[];
let navigation: EventTarget;

const start = () => reportPageJob(refFromSeekUrl);
const visit = (path: string) => {
  history.pushState({}, '', path);
  navigation.dispatchEvent(new Event('currententrychange'));
};
const changeJob = (id: string) =>
  fakeBrowser.storage.local.set({ [jobKey(id)]: makeJob({ id, status: 'Applied' }) });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const ids = () => received.map((message) => message.id);

beforeEach(() => {
  fakeBrowser.reset();
  received = [];
  fakeBrowser.runtime.onMessage.addListener((message) => {
    received.push(message as PageJobMessage);
  });
  navigation = new EventTarget();
  Object.defineProperty(window, 'navigation', { value: navigation, configurable: true });
  history.replaceState({}, '', '/job/10000001');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'navigation');
  vi.restoreAllMocks();
});

describe('reportPageJob', () => {
  it('tells the service worker which job the page shows', async () => {
    start();

    await vi.waitFor(() => expect(received).toEqual([{ type: 'page-job', id: 'seek:10000001' }]));
  });

  it('sends nothing for a page that shows no job', async () => {
    history.replaceState({}, '', '/software-engineer-jobs');

    start();
    await settle();

    expect(received).toEqual([]);
  });

  describe('when the page moves inside the site', () => {
    it('sends the job it moved to', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      visit('/job/10000002');

      await vi.waitFor(() => expect(ids()).toEqual(['seek:10000001', 'seek:10000002']));
    });

    it('sends null once the page shows no job', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      visit('/software-engineer-jobs');

      await vi.waitFor(() => expect(ids()).toEqual(['seek:10000001', null]));
    });

    it('sends a job that the page returns to after a page with none', async () => {
      history.replaceState({}, '', '/software-engineer-jobs');
      start();

      visit('/job/10000002');

      await vi.waitFor(() => expect(ids()).toEqual(['seek:10000002']));
    });

    it('sends nothing while the page still shows the same job', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      visit('/job/10000001?type=standard');
      await settle();

      expect(ids()).toEqual(['seek:10000001']);
    });
  });

  describe('when a job in storage changes', () => {
    it('sends the job of the page again, so the mark follows a status change', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      await changeJob('seek:10000001');

      await vi.waitFor(() => expect(ids()).toEqual(['seek:10000001', 'seek:10000001']));
    });

    it('sends the job the page moved to again', async () => {
      start();
      visit('/job/10000002');
      await vi.waitFor(() => expect(ids()).toHaveLength(2));

      await changeJob('seek:10000002');

      await vi.waitFor(() => expect(ids()).toHaveLength(3));
    });

    it('sends nothing for a change to another job', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      await changeJob('seek:10000003');
      await settle();

      expect(ids()).toEqual(['seek:10000001']);
    });

    it('sends nothing for a change to something other than a job', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      await fakeBrowser.storage.local.set({ lastBackupAt: '2026-10-13T01:00:00.000Z' });
      await settle();

      expect(ids()).toEqual(['seek:10000001']);
    });

    it('sends nothing for a change to a job on a page that shows no job', async () => {
      history.replaceState({}, '', '/software-engineer-jobs');
      start();

      await changeJob('seek:10000001');
      await settle();

      expect(received).toEqual([]);
    });

    it('sends nothing for a change in another storage area', async () => {
      start();
      await vi.waitFor(() => expect(ids()).toHaveLength(1));

      await fakeBrowser.storage.sync.set({ [jobKey('seek:10000001')]: 'changed' });
      await settle();

      expect(ids()).toEqual(['seek:10000001']);
    });
  });

  it('still reports the job of the page where the browser has no Navigation API', async () => {
    Reflect.deleteProperty(window, 'navigation');

    start();

    await vi.waitFor(() => expect(ids()).toEqual(['seek:10000001']));
  });
});
