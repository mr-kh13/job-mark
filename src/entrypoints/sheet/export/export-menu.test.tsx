import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { captureDownloads } from '@/test-utils/downloads';
import { makeJob } from '@/test-utils/make-job';
import { openMenu } from '@/test-utils/menu';
import { buttonNamed } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { logger } from '@/utils/logger';
import { createCsv } from './csv';
import { ExportMenu } from './export-menu';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const renderMenu = (jobs = [makeJob()]) =>
  render(
    <>
      <Toaster />
      <ExportMenu jobs={jobs} />
    </>,
  );

const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
const item = (name: string) => items().find((candidate) => candidate.textContent === name)!;
const toasts = () => Array.from(document.querySelectorAll('[data-slot="toast"]'));
const toastTitles = () =>
  Array.from(document.querySelectorAll('[data-slot="toast-title"]')).map(
    (title) => title.textContent,
  );
const toastDescriptions = () =>
  Array.from(document.querySelectorAll('[data-slot="toast-description"]')).map(
    (description) => description.textContent,
  );

/** Opens the menu and chooses one of its formats. */
const exportAs = async (screen: HTMLElement, format: string) => {
  await openMenu(buttonNamed(screen, 'Export'));
  await settle(() => item(format).click());
};

const bytesOf = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

describe('ExportMenu', () => {
  it('keeps its choices hidden until the Export button is pressed', async () => {
    await renderMenu();

    expect(items()).toHaveLength(0);
  });

  it('offers CSV and Excel', async () => {
    const screen = await renderMenu();

    await openMenu(buttonNamed(screen, 'Export'));

    expect(items().map((candidate) => candidate.textContent)).toEqual(['CSV', 'Excel']);
  });

  it('is disabled while there are no jobs', async () => {
    const screen = await renderMenu([]);

    expect(buttonNamed(screen, 'Export').disabled).toBe(true);
  });

  describe('CSV', () => {
    it('downloads every job in a file named by the date', async () => {
      const files = captureDownloads();
      const jobs = [makeJob({ id: 'seek:1', title: 'First' }), makeJob({ id: 'seek:2' })];
      const screen = await renderMenu(jobs);

      await exportAs(screen, 'CSV');

      expect(files.map((file) => file.name)).toEqual(['job-applications-2026-10-14.csv']);
      expect(await bytesOf(files[0]!.blob)).toEqual(
        Array.from(new TextEncoder().encode(createCsv(jobs))),
      );
      expect(files[0]?.blob.type).toBe('text/csv;charset=utf-8');
    });

    it('says how many jobs were exported', async () => {
      captureDownloads();
      const screen = await renderMenu([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await exportAs(screen, 'CSV');

      expect(toastTitles()).toEqual(['Exported 2 jobs.']);
    });

    it('says "1 job" for a single job', async () => {
      captureDownloads();
      const screen = await renderMenu();

      await exportAs(screen, 'CSV');

      expect(toastTitles()).toEqual(['Exported 1 job.']);
    });
  });

  describe('Excel', () => {
    it('downloads an Excel file named by the date', async () => {
      const files = captureDownloads();
      const screen = await renderMenu([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await exportAs(screen, 'Excel');

      await vi.waitFor(() => expect(files).toHaveLength(1));
      expect(files[0]?.name).toBe('job-applications-2026-10-14.xlsx');
      expect(files[0]?.blob.type).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      // Every .xlsx file is a zip archive, which starts with "PK".
      expect((await bytesOf(files[0]!.blob)).slice(0, 2)).toEqual([0x50, 0x4b]);
    });

    it('says how many jobs were exported', async () => {
      captureDownloads();
      const screen = await renderMenu([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await exportAs(screen, 'Excel');

      await vi.waitFor(() => expect(toastTitles()).toEqual(['Exported 2 jobs.']));
    });
  });

  describe('when the file cannot be saved', () => {
    const failToSave = () => {
      const files = captureDownloads();
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
        throw new Error('disk full');
      });
      return files;
    };

    it('says so and gives the reason', async () => {
      const files = failToSave();
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const screen = await renderMenu();

      await exportAs(screen, 'CSV');

      expect(toasts().map((toast) => toast.getAttribute('data-type'))).toEqual(['error']);
      expect(toastTitles()).toEqual(["Couldn't export the jobs"]);
      expect(toastDescriptions()).toEqual(['disk full']);
      expect(files).toHaveLength(0);
    });

    it('reports the failure for an Excel file too', async () => {
      failToSave();
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const screen = await renderMenu();

      await exportAs(screen, 'Excel');

      await vi.waitFor(() => expect(toastTitles()).toEqual(["Couldn't export the jobs"]));
      expect(toastDescriptions()).toEqual(['disk full']);
    });

    it('logs the error', async () => {
      failToSave();
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      const screen = await renderMenu();

      await exportAs(screen, 'CSV');

      expect(warn).toHaveBeenCalledWith(
        { err: new Error('disk full') },
        'Could not export the jobs',
      );
    });
  });
});

describe('ExportMenu toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('let a success go by itself', async () => {
    captureDownloads();
    const screen = await renderMenu();
    await exportAs(screen, 'CSV');
    expect(toasts()).toHaveLength(1);

    await settle(() => vi.advanceTimersByTimeAsync(10_000));

    expect(toasts()).toHaveLength(0);
  });

  it('keep an error until it is closed, so it can be read', async () => {
    captureDownloads();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('disk full');
    });
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const screen = await renderMenu();
    await exportAs(screen, 'CSV');
    expect(toasts()).toHaveLength(1);

    await settle(() => vi.advanceTimersByTimeAsync(60_000));

    expect(toasts()).toHaveLength(1);
  });
});
