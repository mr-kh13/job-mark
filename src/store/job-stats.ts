import type { Job } from './job';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The most times that fall within any seven days. `times` must be sorted, oldest first. */
function busiestWeek(times: readonly number[]): number {
  let best = 0;
  let start = 0;
  for (const [end, time] of times.entries()) {
    while (time - (times[start] ?? time) > WEEK_MS) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

/** The totals `summarize` returns. */
export type JobStats = ReturnType<typeof summarize>;

/**
 * Totals for the popup. An application is a job with an applied date, whatever its status is
 * now.
 *
 * @param jobs - The tracked jobs.
 * @param now - The current time; "this week" is the seven days before it.
 * @returns How many applications, how many of those in the last seven days, and the most made
 * within any seven days (never below this week).
 */
export function summarize(jobs: readonly Job[], now: Date = new Date()) {
  const weekAgo = now.getTime() - WEEK_MS;
  const appliedTimes = jobs
    .flatMap((job) => (job.appliedAt ? [Date.parse(job.appliedAt)] : []))
    .sort((a, b) => a - b);
  const thisWeek = appliedTimes.filter((time) => time >= weekAgo).length;
  return {
    applications: appliedTimes.length,
    thisWeek,
    bestWeek: Math.max(thisWeek, busiestWeek(appliedTimes)),
  };
}
