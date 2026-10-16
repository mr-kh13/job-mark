// @vitest-environment node
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobStore } from '@/store/job-store';
import { stubTabIcons } from '@/test-utils/browser-stubs';
import { makeJob } from '@/test-utils/make-job';
import { logger } from '@/utils/logger';
import { handleMessage, listenForMessages } from './message-handler';

const T1 = '2026-10-14T01:00:00.000Z';
const BLUE_DOT = { 16: 'icon/mark-2563eb-16.png', 32: 'icon/mark-2563eb-32.png' };
const PLAIN_ICON = { 16: 'icon/16.png', 32: 'icon/32.png' };

let icons: Map<number, unknown>;

const makeMessage = (over: { kind?: string; clickedAt?: string } = {}) => ({
  type: 'click',
  kind: over.kind ?? 'apply',
  clickedAt: over.clickedAt ?? T1,
  job: {
    id: 'seek:1',
    source: 'seek',
    title: 'Engineer',
    company: 'Acme',
    location: 'Sydney',
    applyType: 'quick',
    url: 'https://au.seek.com/job/1',
  },
});

beforeEach(() => {
  fakeBrowser.reset();
  icons = stubTabIcons();
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleMessage with a valid click', () => {
  it('stores the job and replies with the outcome', async () => {
    const reply = await handleMessage(makeMessage());

    expect(reply).toMatchObject({
      outcome: 'saved',
      job: { id: 'seek:1', status: 'Applied', appliedAt: T1 },
    });
    expect(await jobStore.get('seek:1')).toEqual(reply?.job);
  });

  it('treats a Save as Interested', async () => {
    const reply = await handleMessage(makeMessage({ kind: 'save' }));

    expect(reply?.job).toMatchObject({ status: 'Interested', savedAt: T1 });
  });

  it('replies with a duplicate when the job is already tracked', async () => {
    await handleMessage(makeMessage());

    const reply = await handleMessage(makeMessage());

    expect(reply?.outcome).toBe('duplicate');
    expect(await jobStore.list()).toHaveLength(1);
  });
});

describe('handleMessage with something else', () => {
  it.each([
    ['null', null],
    ['a string', 'click'],
    ['an unknown type', { type: 'capture' }],
    ['a click with an unknown kind', makeMessage({ kind: 'share' })],
    ['a click with a bad time', makeMessage({ clickedAt: 'yesterday' })],
  ])('ignores %s, stores nothing and logs a warning', async (_label, raw) => {
    const reply = await handleMessage(raw);

    expect(reply).toBeUndefined();
    expect(await jobStore.list()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe('handleMessage with a field far over the size limit', () => {
  it('ignores the click, stores nothing and logs a warning', async () => {
    const message = makeMessage();
    message.job.title = 'x'.repeat(3_000_000);

    const reply = await handleMessage(message);

    expect(reply).toBeUndefined();
    expect(await jobStore.list()).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe('handleMessage when storage fails', () => {
  it('logs the error and replies with nothing instead of throwing', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota exceeded'));

    const reply = await handleMessage(makeMessage());

    expect(reply).toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('handleMessage with the job a tab shows', () => {
  const FROM_TAB = { tab: { id: 5 } };
  const iconOn = (tabId: number) => icons.get(tabId);

  it('gives the toolbar icon of the sending tab a dot and replies with nothing', async () => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));

    const reply = await handleMessage({ type: 'page-job', id: 'seek:1' }, FROM_TAB);

    expect(reply).toBeUndefined();
    expect(iconOn(5)).toEqual(BLUE_DOT);
    expect(iconOn(6)).toBeUndefined();
  });

  it('gives the plain icon back when the tab shows no job', async () => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));
    await handleMessage({ type: 'page-job', id: 'seek:1' }, FROM_TAB);

    await handleMessage({ type: 'page-job', id: null }, FROM_TAB);

    expect(iconOn(5)).toEqual(PLAIN_ICON);
  });

  it('stores nothing', async () => {
    await handleMessage({ type: 'page-job', id: 'seek:1' }, FROM_TAB);

    expect(await jobStore.list()).toEqual([]);
  });

  it.each([
    ['no id', { type: 'page-job' }],
    ['an empty id', { type: 'page-job', id: '' }],
    ['an id that is not a job id', { type: 'page-job', id: 'nope' }],
    ['an id that is not text', { type: 'page-job', id: 42 }],
  ])('ignores %s, marks nothing and logs a warning', async (_label, raw) => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));

    const reply = await handleMessage(raw, FROM_TAB);

    expect(reply).toBeUndefined();
    expect(iconOn(5)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('ignores a message that comes from no tab and logs a warning', async () => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));
    const setIcon = vi.spyOn(fakeBrowser.action, 'setIcon');

    const reply = await handleMessage({ type: 'page-job', id: 'seek:1' }, {});

    expect(reply).toBeUndefined();
    expect(setIcon).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('logs the error and replies with nothing when the icon cannot be marked', async () => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));
    vi.spyOn(fakeBrowser.action, 'setIcon').mockRejectedValueOnce(new Error('tab closed'));

    const reply = await handleMessage({ type: 'page-job', id: 'seek:1' }, FROM_TAB);

    expect(reply).toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('listenForMessages', () => {
  beforeEach(() => {
    listenForMessages();
  });

  it('answers a click sent through the extension runtime', async () => {
    const reply = await fakeBrowser.runtime.sendMessage(makeMessage());

    expect(reply).toMatchObject({ outcome: 'saved', job: { id: 'seek:1' } });
    expect(await jobStore.get('seek:1')).toEqual(reply.job);
  });

  it('marks the tab that sent the job it shows', async () => {
    await jobStore.save(makeJob({ id: 'seek:1', status: 'Applied' }));

    await new Promise<void>((resolve) => {
      void fakeBrowser.runtime.onMessage.trigger(
        { type: 'page-job', id: 'seek:1' },
        { tab: { id: 5 } } as never,
        () => resolve(),
      );
    });

    expect(icons.get(5)).toEqual(BLUE_DOT);
  });

  it('answers an invalid message with nothing', async () => {
    const reply = await fakeBrowser.runtime.sendMessage({ type: 'capture' });

    expect(reply).toBeUndefined();
    expect(await jobStore.list()).toEqual([]);
  });
});
