import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { createBackup } from './backup';
import { jobStore } from '@/store/job-store';
import { captureDownloads } from '@/test-utils/downloads';
import { chooseFile } from '@/test-utils/file-input';
import { localIso, makeJob } from '@/test-utils/make-job';
import { buttonNamed } from '@/test-utils/query';
import { cleanup, render, settle } from '@/test-utils/render';
import { BackupControls } from './backup-controls';

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0));
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const renderControls = (jobs = [makeJob()]) =>
  render(
    <>
      <Toaster />
      <BackupControls jobs={jobs} />
    </>,
  );

const note = (screen: HTMLElement) =>
  screen.querySelector<HTMLElement>('[data-slot="backup-note"]');
const toasts = () => Array.from(document.querySelectorAll('[data-slot="toast"]'));
const toastText = () => toasts().map((toast) => toast.textContent);

describe('BackupControls', () => {
  describe('the last backup note', () => {
    it('says "never" when there are jobs and no backup yet', async () => {
      const screen = await renderControls();

      expect(note(screen)?.textContent).toBe('Last backup: never');
    });

    it('says how long ago the last backup was', async () => {
      await jobStore.recordBackup(localIso(2026, 10, 13, 9));

      const screen = await renderControls();

      expect(note(screen)?.textContent).toBe('Last backup: 1 day ago');
    });

    it('warns when a backup is overdue', async () => {
      const screen = await renderControls();

      expect(note(screen)?.dataset.stale).toBe('true');
    });

    it('does not warn after a recent backup', async () => {
      await jobStore.recordBackup(localIso(2026, 10, 13, 9));

      const screen = await renderControls();

      expect(note(screen)?.dataset.stale).toBe('false');
    });

    it('does not warn while there are no jobs', async () => {
      const screen = await renderControls([]);

      expect(note(screen)?.dataset.stale).toBe('false');
    });

    it('shows no note until the last backup has been read, but shows the buttons', async () => {
      vi.spyOn(jobStore, 'getLastBackupAt').mockReturnValue(new Promise(() => {}));

      const screen = await renderControls();

      expect(note(screen)).toBeNull();
      expect(buttonNamed(screen, 'Back up')).toBeDefined();
      expect(buttonNamed(screen, 'Import')).toBeDefined();
    });
  });

  describe('Back up', () => {
    it('downloads every job in a file named by the date', async () => {
      const files = captureDownloads();
      const jobs = [makeJob({ id: 'seek:1', notes: 'one' }), makeJob({ id: 'seek:2' })];
      const screen = await renderControls(jobs);

      await settle(() => buttonNamed(screen, 'Back up').click());

      expect(files.map((file) => file.name)).toEqual(['jobmark-backup-2026-10-14.json']);
      expect(await files[0]?.blob.text()).toBe(createBackup(jobs, new Date()));
    });

    it('says how many jobs were backed up', async () => {
      captureDownloads();
      const screen = await renderControls([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await settle(() => buttonNamed(screen, 'Back up').click());

      expect(toastText()).toEqual(['Backed up 2 jobs.']);
    });

    it('says "1 job" for a single job', async () => {
      captureDownloads();
      const screen = await renderControls();

      await settle(() => buttonNamed(screen, 'Back up').click());

      expect(toastText()).toEqual(['Backed up 1 job.']);
    });

    it('records the backup and updates the note', async () => {
      captureDownloads();
      const screen = await renderControls();

      await settle(() => buttonNamed(screen, 'Back up').click());

      expect(await jobStore.getLastBackupAt()).toBe(new Date().toISOString());
      expect(note(screen)?.textContent).toBe('Last backup: less than a minute ago');
      expect(note(screen)?.dataset.stale).toBe('false');
    });

    it('is disabled while there are no jobs', async () => {
      const screen = await renderControls([]);

      expect(buttonNamed(screen, 'Back up').disabled).toBe(true);
    });
  });

  describe('Import', () => {
    it('opens the file picker', async () => {
      const screen = await renderControls();
      const picker = vi.spyOn(
        screen.querySelector<HTMLInputElement>('input[type="file"]')!,
        'click',
      );

      await settle(() => buttonNamed(screen, 'Import').click());

      expect(picker).toHaveBeenCalledOnce();
    });

    it('imports the chosen file and says what changed', async () => {
      const screen = await renderControls([]);
      const file = createBackup([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

      await chooseFile(screen, file);

      await vi.waitFor(() =>
        expect(toastText()).toEqual(['Imported: 2 added, 0 updated, 0 skipped.']),
      );
      expect((await jobStore.list()).map((job) => job.id).sort()).toEqual(['seek:1', 'seek:2']);
    });

    it('says why a file was rejected and leaves the jobs alone', async () => {
      await jobStore.save(makeJob({ id: 'seek:keep' }));
      const screen = await renderControls();

      await chooseFile(screen, 'not json');

      await vi.waitFor(() => expect(toasts()).toHaveLength(1));
      expect(toastText()[0]).toContain("That file isn't valid JSON.");
      expect((await jobStore.list()).map((job) => job.id)).toEqual(['seek:keep']);
    });
  });
});

describe('BackupControls toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('let a success go by itself', async () => {
    const screen = await renderControls([]);
    await chooseFile(screen, createBackup([makeJob()]));
    await vi.waitFor(() => expect(toasts()).toHaveLength(1));

    await settle(() => vi.advanceTimersByTimeAsync(10_000));

    expect(toasts()).toHaveLength(0);
  });

  it('keep an error until it is closed, so a long message can be read', async () => {
    const screen = await renderControls([]);
    await chooseFile(screen, 'not json');
    await vi.waitFor(() => expect(toasts()).toHaveLength(1));

    await settle(() => vi.advanceTimersByTimeAsync(60_000));

    expect(toasts()).toHaveLength(1);
  });
});
