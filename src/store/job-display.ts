import type { Job, Status } from './job';

/** One colour per status, shared by every place that shows a status. */
export const STATUS_COLOURS: Record<Status, string> = {
  Interested: '#6d28d9',
  Applied: '#2563eb',
  Interviewing: '#b45309',
  Offer: '#15803d',
  Rejected: '#4b5563',
  Withdrawn: '#4b5563',
  'No response': '#4b5563',
};

/** How each source is named on screen. */
export const SOURCE_LABELS: Record<Job['source'], string> = {
  seek: 'Seek',
  linkedin: 'LinkedIn',
  other: 'Other',
};

const LOCALE = 'en-AU';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_AGO = 6;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// "today", "yesterday" or "3 days ago" for a week, then "6 Oct", with the year once it is not this
// year. Days follow the local calendar; rounding absorbs the short and long days of daylight saving.
function describeDay(iso: string, now: Date): string {
  const then = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (daysAgo >= 0 && daysAgo <= MAX_DAYS_AGO) {
    return new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(-daysAgo, 'day');
  }
  return then.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Says when a job was applied for or saved, with its status once that says more than that.
 *
 * @param job - The job.
 * @param now - The current time.
 * @returns Text such as "Applied yesterday" or "Applied 6 Oct · Interviewing".
 */
export function summarizeJob(
  job: Pick<Job, 'status' | 'appliedAt' | 'savedAt'>,
  now: Date = new Date(),
): string {
  const verb = job.appliedAt ? 'Applied' : 'Saved';
  const when = describeDay(job.appliedAt ?? job.savedAt, now);
  const status = job.status === 'Applied' || job.status === 'Interested' ? '' : job.status;
  return `${verb} ${when}${status && ` · ${status}`}`;
}
