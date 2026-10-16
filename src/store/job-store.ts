import { storage } from '#imports';
import { logger } from '@/utils/logger';
import { Job, applyPatch, type JobPatch, type Status } from './job';
import { isJobKey, jobIdOf, jobKey } from './job-key';

const lastBackupItem = storage.defineItem<string>('local:lastBackupAt');

/** What changed in the stored jobs: the jobs as they are now, and the ids of the jobs now gone. */
export type JobChange = { saved: Job[]; removed: string[] };

// A key without a new value was removed. A stored value that is no valid job counts as gone too,
// the same as `list` leaves it out.
function toJobChange(changes: Record<string, { newValue?: unknown }>): JobChange {
  const change: JobChange = { saved: [], removed: [] };
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (!isJobKey(key)) continue;
    const id = jobIdOf(key);
    if (newValue === undefined || newValue === null) {
      change.removed.push(id);
      continue;
    }
    const parsed = Job.safeParse(newValue);
    if (parsed.success) {
      change.saved.push(parsed.data);
    } else {
      logger.warn({ id, issues: parsed.error.issues }, 'Skipping invalid job');
      change.removed.push(id);
    }
  }
  return change;
}

const jobOps = {
  async get(id: string): Promise<Job | undefined> {
    const key = jobKey(id);
    const parsed = Job.safeParse((await browser.storage.local.get(key))[key]);
    return parsed.success ? parsed.data : undefined;
  },

  async list(): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const [key, value] of Object.entries(await browser.storage.local.get(null))) {
      if (!isJobKey(key)) continue;
      const parsed = Job.safeParse(value);
      if (parsed.success) jobs.push(parsed.data);
      else logger.warn({ id: jobIdOf(key), issues: parsed.error.issues }, 'Skipping invalid job');
    }
    return jobs;
  },

  async saveMany(jobs: Job[]): Promise<void> {
    const valid = jobs.map((job) => Job.parse(job));
    await browser.storage.local.set(Object.fromEntries(valid.map((job) => [jobKey(job.id), job])));
  },

  async save(job: Job): Promise<Job> {
    const valid = Job.parse(job);
    await jobOps.saveMany([valid]);
    return valid;
  },

  async remove(id: string): Promise<void> {
    await browser.storage.local.remove(jobKey(id));
  },
};
type JobOps = typeof jobOps;

/** One write at a time across popup, sheet and service worker (they share Web Locks). */
const exclusive = async <T>(task: () => Promise<T>): Promise<T> =>
  await navigator.locks.request('job-mark:write', task);

const transaction = <T>(task: (ops: JobOps) => Promise<T>): Promise<T> =>
  exclusive(() => task(jobOps));

const edit = (id: string, patchFor: (job: Job, at: string) => JobPatch) =>
  transaction(async (ops) => {
    const job = await ops.get(id);
    if (!job) return undefined;
    const at = new Date().toISOString();
    return ops.save(applyPatch(job, patchFor(job, at), at));
  });

/**
 * The job store, shared by every extension context. Writes run one at a time under a shared
 * lock; reads never wait.
 */
export const jobStore = {
  /**
   * Reads one job.
   *
   * @param id - The job's id.
   * @returns The job, or `undefined` if there is none or the stored one is invalid.
   */
  get: jobOps.get,

  /**
   * Reads every job. Invalid stored entries are skipped with a console warning.
   *
   * @returns All valid jobs.
   */
  list: jobOps.list,

  /**
   * Writes a job as given, replacing any job with the same id and keeping its `updatedAt`.
   *
   * @param job - The job to write.
   * @returns The job as stored, with defaults filled in.
   * @throws If `job` is invalid; nothing is written.
   */
  save: (job: Job) => exclusive(() => jobOps.save(job)),

  /**
   * Writes several jobs in one call, replacing any with the same ids.
   *
   * @param jobs - The jobs to write.
   * @throws If any job is invalid; nothing is written.
   */
  saveMany: (jobs: Job[]) => exclusive(() => jobOps.saveMany(jobs)),

  /**
   * Deletes a job. Does nothing if there is none.
   *
   * @param id - The job's id.
   */
  remove: (id: string) => exclusive(() => jobOps.remove(id)),

  /**
   * Runs a task holding the write lock, so no other write interleaves. Use the `ops` the task
   * receives; calling `jobStore`'s own writes inside would deadlock.
   *
   * @param task - Receives `ops`: the same `get`, `list`, `save`, `saveMany` and `remove`,
   * without taking the lock again.
   * @returns Whatever `task` returns.
   */
  transaction,

  /**
   * Watches for changes to the stored jobs, from any extension context.
   *
   * @param callback - Called after each change with the jobs now saved and the ids now gone.
   * @returns A function that stops the notifications.
   */
  onChange: (callback: (change: JobChange) => void) => {
    const handleChanges = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local') return;
      const change = toJobChange(changes);
      if (change.saved.length > 0 || change.removed.length > 0) callback(change);
    };
    browser.storage.onChanged.addListener(handleChanges);
    return () => browser.storage.onChanged.removeListener(handleChanges);
  },

  /**
   * Reads when the last backup was downloaded.
   *
   * @returns ISO time, or `undefined` if there has been none.
   */
  getLastBackupAt: async () => (await lastBackupItem.getValue()) ?? undefined,

  /**
   * Remembers when a backup was downloaded.
   *
   * @param at - ISO time of the download.
   */
  recordBackup: (at: string) => lastBackupItem.setValue(at),

  /**
   * Applies a patch to a stored job and stamps `updatedAt` with the current time.
   * See `applyPatch` for how `undefined` values are treated.
   *
   * @param id - The job's id.
   * @param patch - The fields to change.
   * @returns The updated job, or `undefined` if there is no job with this id.
   * @throws If the patched job is invalid; the stored job is left as it was.
   */
  update: (id: string, patch: JobPatch) => edit(id, () => patch),

  /**
   * Sets a job's status, using the `appliedAt` held in storage.
   * Moving past `Interested` also sets `appliedAt` if the job has none; moving back leaves it.
   *
   * @param id - The job's id.
   * @param status - The new status.
   * @returns The updated job, or `undefined` if there is no job with this id.
   */
  changeStatus: (id: string, status: Status) =>
    edit(id, (job, at) =>
      status !== 'Interested' && !job.appliedAt ? { status, appliedAt: at } : { status },
    ),
};
