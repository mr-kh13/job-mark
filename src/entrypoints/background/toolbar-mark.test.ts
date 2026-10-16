// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/store/job';
import { STATUS_COLOURS } from '@/store/job-display';
import { jobStore } from '@/store/job-store';
import { stubTabIcons } from '@/test-utils/browser-stubs';
import { makeJob } from '@/test-utils/make-job';
import { readPngPixel } from '@/test-utils/png';
import { markToolbar } from './toolbar-mark';

const NOW = new Date('2026-10-13T05:00:00.000Z');
const TAB = 7;
const DEFAULT_TITLE = 'Jobmark: Job Application Tracker';

const PLAIN_ICON = { 16: 'icon/16.png', 32: 'icon/32.png' };
const dotIcon = (hex: string) => ({
  16: `icon/mark-${hex}-16.png`,
  32: `icon/mark-${hex}-32.png`,
});

// The pixel in the middle of the dot, for each icon size.
const DOT_PIXEL = { 16: 12, 32: 25 };

const appliedJob = (status: Job['status'] = 'Applied') =>
  makeJob({ status, appliedAt: NOW.toISOString(), savedAt: NOW.toISOString() });

let icons: Map<number, unknown>;

const markOf = async (tabId: number) => ({
  icon: icons.get(tabId),
  title: await fakeBrowser.action.getTitle({ tabId }),
});

beforeEach(async () => {
  fakeBrowser.reset();
  icons = stubTabIcons();
  await fakeBrowser.action.setTitle({ title: DEFAULT_TITLE });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('markToolbar', () => {
  it('gives the tab the logo with a dot for a tracked job', async () => {
    await jobStore.save(appliedJob());

    await markToolbar(TAB, 'seek:1');

    expect((await markOf(TAB)).icon).toEqual(dotIcon('2563eb'));
  });

  it('says when the job was applied for in the icon title', async () => {
    await jobStore.save(appliedJob());

    await markToolbar(TAB, 'seek:1');

    expect((await markOf(TAB)).title).toBe('Jobmark: Applied today');
  });

  it('colours the dot by the status of the job', async () => {
    await jobStore.save(appliedJob('Offer'));

    await markToolbar(TAB, 'seek:1');

    expect((await markOf(TAB)).icon).toEqual(dotIcon('15803d'));
  });

  it('marks a saved job that was never applied for', async () => {
    await jobStore.save(makeJob({ status: 'Interested', savedAt: NOW.toISOString() }));

    await markToolbar(TAB, 'seek:1');

    expect(await markOf(TAB)).toEqual({
      icon: dotIcon('6d28d9'),
      title: 'Jobmark: Saved today',
    });
  });

  it('marks only the tab it was asked about', async () => {
    await jobStore.save(appliedJob());

    await markToolbar(TAB, 'seek:1');

    expect((await markOf(TAB + 1)).icon).toBeUndefined();
  });

  it('gives a job that is not tracked the plain icon and title', async () => {
    await markToolbar(TAB, 'seek:2');

    expect(await markOf(TAB)).toEqual({ icon: PLAIN_ICON, title: DEFAULT_TITLE });
  });

  it('gives the plain icon back when the tab shows no job', async () => {
    await jobStore.save(appliedJob());
    await markToolbar(TAB, 'seek:1');

    await markToolbar(TAB, null);

    expect(await markOf(TAB)).toEqual({ icon: PLAIN_ICON, title: DEFAULT_TITLE });
  });

  it('gives the plain icon back when the job was deleted', async () => {
    await jobStore.save(appliedJob());
    await markToolbar(TAB, 'seek:1');
    await jobStore.remove('seek:1');

    await markToolbar(TAB, 'seek:1');

    expect((await markOf(TAB)).icon).toEqual(PLAIN_ICON);
  });

  it('shows a changed status', async () => {
    await jobStore.save(appliedJob());
    await markToolbar(TAB, 'seek:1');
    await jobStore.save(appliedJob('Interviewing'));

    await markToolbar(TAB, 'seek:1');

    expect(await markOf(TAB)).toEqual({
      icon: dotIcon('b45309'),
      title: 'Jobmark: Applied today · Interviewing',
    });
  });
});

describe('the icon files', () => {
  const toHex = (channels: number[]) =>
    `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  const pixelOf = (file: string, x: number, y: number) =>
    readPngPixel(readFileSync(resolve('public', file)), x, y);

  it.each(Object.keys(STATUS_COLOURS) as Job['status'][])(
    'draw the %s dot in the colour of that status at both sizes',
    async (status) => {
      await jobStore.save(appliedJob(status));
      await markToolbar(TAB, 'seek:1');

      const paths = icons.get(TAB) as Record<string, string>;

      expect(Object.keys(paths)).toEqual(['16', '32']);
      for (const [size, file] of Object.entries(paths)) {
        const middle = DOT_PIXEL[Number(size) as 16 | 32];
        const [red, green, blue, alpha] = pixelOf(file, middle, middle);
        expect([toHex([red, green, blue]), alpha]).toEqual([STATUS_COLOURS[status], 255]);
      }
    },
  );

  it('keep the logo of the plain icon where the dot is not', () => {
    for (const size of [16, 32] as const) {
      expect(pixelOf(dotIcon('2563eb')[size], 0, 0)).toEqual(pixelOf(PLAIN_ICON[size], 0, 0));
    }
  });
});
