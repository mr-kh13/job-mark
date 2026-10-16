// Kept free of imports, so a content script can use it without pulling in the store.

/** Every job sits in `chrome.storage.local` under its own key: this prefix plus the job's id. */
export const JOB_KEY_PREFIX = 'job:';

/**
 * The storage key of a job.
 *
 * @param id - The job's id.
 * @returns The key the job is stored under.
 */
export const jobKey = (id: string): string => `${JOB_KEY_PREFIX}${id}`;

/**
 * Tells the key of a job from any other key in the same storage.
 *
 * @param key - A storage key.
 * @returns Whether the key belongs to a job.
 */
export const isJobKey = (key: string): boolean => key.startsWith(JOB_KEY_PREFIX);

/**
 * The id of the job stored under a key.
 *
 * @param key - A key for which `isJobKey` is true.
 * @returns The job's id.
 */
export const jobIdOf = (key: string): string => key.slice(JOB_KEY_PREFIX.length);
