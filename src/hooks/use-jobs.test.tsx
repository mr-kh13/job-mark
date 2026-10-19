import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/store/job';
import { jobStore } from '@/store/job-store';
import { makeJob } from '@/test-utils/make-job';
import { cleanup, render, settle } from '@/test-utils/render';
import { useJobs } from './use-jobs';

const storeJobs = (...ids: string[]) =>
  jobStore.saveMany(ids.map((id) => makeJob({ id: `seek:${id}`, title: `Title ${id}` })));

function Probe({ field = 'id' }: { field?: 'id' | 'title' }) {
  const { jobs, isLoaded } = useJobs();
  const shown = jobs.map((job) => job[field]).toSorted();
  return <p>{`${isLoaded ? 'loaded' : 'loading'}|${shown.join(',')}`}</p>;
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

describe('useJobs', () => {
  it('is loaded and empty when nothing is stored', async () => {
    const screen = await render(<Probe />);

    expect(screen.textContent).toBe('loaded|');
  });

  it('loads the stored jobs', async () => {
    await storeJobs('1', '2');

    const screen = await render(<Probe />);

    expect(screen.textContent).toBe('loaded|seek:1,seek:2');
  });

  it('shows a job added after the first render', async () => {
    await storeJobs('1');
    const screen = await render(<Probe />);

    await settle(() => storeJobs('2'));

    expect(screen.textContent).toBe('loaded|seek:1,seek:2');
  });

  it('shows a removal made after the first render', async () => {
    await storeJobs('1', '2');
    const screen = await render(<Probe />);

    await settle(() => jobStore.remove('seek:1'));

    expect(screen.textContent).toBe('loaded|seek:2');
  });

  it('shows the new values of a job changed after the first render', async () => {
    await storeJobs('1', '2');
    const screen = await render(<Probe field="title" />);

    await settle(() => jobStore.update('seek:1', { title: 'Renamed' }));

    expect(screen.textContent).toBe('loaded|Renamed,Title 2');
  });

  it('drops a job whose stored value stops being a valid job', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await storeJobs('1', '2');
    const screen = await render(<Probe />);

    await settle(() => fakeBrowser.storage.local.set({ 'job:seek:1': { id: 'nope' } }));

    expect(screen.textContent).toBe('loaded|seek:2');
  });

  it('applies a change without reading the stored jobs again', async () => {
    await storeJobs('1');
    const list = vi.spyOn(jobStore, 'list');
    await render(<Probe />);

    await settle(() => jobStore.update('seek:1', { notes: 'x' }));
    await settle(() => storeJobs('2'));
    await settle(() => jobStore.remove('seek:2'));

    expect(list).toHaveBeenCalledTimes(1);
  });

  describe('a change that arrives while the first read is still running', () => {
    const holdFirstRead = () => {
      let finishRead: (jobs: Job[]) => void = () => {};
      vi.spyOn(jobStore, 'list').mockReturnValue(
        new Promise<Job[]>((resolve) => {
          finishRead = resolve;
        }),
      );
      return (jobs: Job[]) => finishRead(jobs);
    };

    it('is kept when the read finishes without that job', async () => {
      const finishRead = holdFirstRead();
      const screen = await render(<Probe />);

      await settle(() => storeJobs('9'));
      expect(screen.textContent).toBe('loading|');
      await settle(() => finishRead([]));

      expect(screen.textContent).toBe('loaded|seek:9');
    });

    it('removes a job that the read still lists', async () => {
      await storeJobs('1', '2');
      const listed = await jobStore.list();
      const finishRead = holdFirstRead();
      const screen = await render(<Probe />);

      await settle(() => jobStore.remove('seek:1'));
      await settle(() => finishRead(listed));

      expect(screen.textContent).toBe('loaded|seek:2');
    });

    it('wins over the older copy of the same job in the read', async () => {
      await storeJobs('1');
      const listed = await jobStore.list();
      const finishRead = holdFirstRead();
      const screen = await render(<Probe field="title" />);

      await settle(() => jobStore.update('seek:1', { title: 'Renamed' }));
      await settle(() => finishRead(listed));

      expect(screen.textContent).toBe('loaded|Renamed');
    });
  });

  it('stops listening when it unmounts', async () => {
    const unsubscribe = vi.fn();
    vi.spyOn(jobStore, 'onChange').mockReturnValue(unsubscribe);
    await render(<Probe />);

    await cleanup();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
