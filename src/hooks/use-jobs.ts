import { useEffect, useState } from 'react';
import type { Job } from '@/store/job';
import { jobStore, type JobChange } from '@/store/job-store';

// Saved jobs replace the ones with the same id or join the list; removed jobs leave it.
function applyChange(jobs: readonly Job[], change: JobChange): Job[] {
  const changedIds = new Set(change.removed.concat(change.saved.map((job) => job.id)));
  return jobs.filter((job) => !changedIds.has(job.id)).concat(change.saved);
}

/**
 * Loads every stored job once, then keeps the list current by applying each change made in any
 * tab, without reading the store again.
 *
 * @returns The jobs, and whether the first read has finished.
 */
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isAlive = true;
    let isFirstReadDone = false;
    // A change made while the first read runs may or may not be in its result. Applying it on top
    // gives the same list either way.
    const earlyChanges: JobChange[] = [];
    const unsubscribe = jobStore.onChange((change) => {
      if (isFirstReadDone) setJobs((current) => applyChange(current, change));
      else earlyChanges.push(change);
    });
    void jobStore.list().then((list) => {
      if (!isAlive) return;
      isFirstReadDone = true;
      setJobs(earlyChanges.reduce(applyChange, list));
      setIsLoaded(true);
    });
    return () => {
      isAlive = false;
      unsubscribe();
    };
  }, []);

  return { jobs, isLoaded };
}
