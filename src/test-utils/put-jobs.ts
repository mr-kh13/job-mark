import { fakeBrowser } from 'wxt/testing/fake-browser';
import { jobKey } from '@/store/job-key';
import type { Job } from '@/store/job';

/** Writes jobs straight into the fake extension storage, each under its own key. */
export const putJobs = (...jobs: Job[]) =>
  fakeBrowser.storage.local.set(Object.fromEntries(jobs.map((job) => [jobKey(job.id), job])));
