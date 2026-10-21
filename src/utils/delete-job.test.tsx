import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { jobStore } from '@/store/job-store';
import { makeJob } from '@/test-utils/make-job';
import { putJobs } from '@/test-utils/put-jobs';
import { cleanup, render, settle } from '@/test-utils/render';
import { deleteJob } from './delete-job';

beforeEach(async () => {
  fakeBrowser.reset();
  await render(<Toaster />);
});

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const toasts = () => Array.from(document.querySelectorAll('[data-slot="toast"]'));
const undoButton = () => document.querySelector<HTMLElement>('[data-slot="toast-action"]')!;

describe('deleteJob', () => {
  it('removes the job from the store', async () => {
    const job = makeJob();
    await putJobs(job, makeJob({ id: 'seek:2' }));

    await settle(() => deleteJob(job));

    expect((await jobStore.list()).map((stored) => stored.id)).toEqual(['seek:2']);
  });

  it('says which job was deleted', async () => {
    const job = makeJob({ title: 'Senior Engineer' });
    await putJobs(job);

    await settle(() => deleteJob(job));

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.textContent).toContain('Deleted “Senior Engineer”');
  });

  it('calls a job without a title "job"', async () => {
    const job = makeJob({ title: '' });
    await putJobs(job);

    await settle(() => deleteJob(job));

    expect(toasts()[0]?.textContent).toContain('Deleted “job”');
  });

  it('says so, and offers no Undo, when the job cannot be deleted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = makeJob({ title: 'Senior Engineer' });
    await putJobs(job);
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValueOnce(new Error('disk gone'));

    await settle(() => deleteJob(job));

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.textContent).toContain("Couldn't delete the job");
    expect(document.querySelector('[data-slot="toast-action"]')).toBeNull();
    expect(await jobStore.get(job.id)).toEqual(job);
  });

  it('says so when Undo cannot put the job back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = makeJob({ title: 'Senior Engineer' });
    await putJobs(job);
    await settle(() => deleteJob(job));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('disk gone'));

    await settle(() => undoButton().click());

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]?.textContent).toContain("Couldn't restore the job");
  });

  it('puts the job back exactly as it was when Undo is clicked', async () => {
    const job = makeJob({
      title: 'Senior Engineer',
      status: 'Interviewing',
      notes: 'Referral',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    await putJobs(job);
    await settle(() => deleteJob(job));

    await settle(() => undoButton().click());

    expect(await jobStore.get(job.id)).toEqual(job);
  });

  it('keeps a job that was saved again while the toast was up, when Undo is clicked', async () => {
    const job = makeJob({ title: 'Deleted copy', notes: 'Referral' });
    await putJobs(job);
    await settle(() => deleteJob(job));
    const again = makeJob({
      id: job.id,
      title: 'Captured again',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
    await jobStore.save(again);

    await settle(() => undoButton().click());

    expect(await jobStore.get(job.id)).toEqual(again);
  });

  it('keeps a job that is being saved at the moment Undo is clicked', async () => {
    const job = makeJob({ title: 'Deleted copy' });
    await putJobs(job);
    await settle(() => deleteJob(job));
    const again = makeJob({ id: job.id, title: 'Captured again' });
    const saving = jobStore.save(again);

    await settle(() => undoButton().click());
    await saving;

    expect(await jobStore.get(job.id)).toEqual(again);
  });

  it('takes the toast down when Undo is clicked even though the job was saved again', async () => {
    const job = makeJob();
    await putJobs(job);
    await settle(() => deleteJob(job));
    await jobStore.save(makeJob({ id: job.id, title: 'Captured again' }));

    await settle(() => undoButton().click());

    expect(toasts()).toHaveLength(0);
  });

  it('takes the toast down when Undo is clicked', async () => {
    const job = makeJob();
    await putJobs(job);
    await settle(() => deleteJob(job));

    await settle(() => undoButton().click());

    expect(toasts()).toHaveLength(0);
  });

  it('takes the toast down by itself after six seconds', async () => {
    vi.useFakeTimers();
    const job = makeJob();
    await putJobs(job);
    await settle(() => deleteJob(job));
    expect(toasts()).toHaveLength(1);

    await settle(() => vi.advanceTimersByTimeAsync(6_100));

    expect(toasts()).toHaveLength(0);
  });
});
