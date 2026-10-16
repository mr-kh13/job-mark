import type { JobStats } from '@/store/job-stats';
import { pluralize } from '@/utils/text';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fewer applications than this in a week is too few to call the best week. */
const MIN_BEST_WEEK = 3;

const GENERAL = [
  'Small steps still count.',
  'Every application moves you closer.',
  'The right role is out there, and you are on your way.',
  'Progress is progress, however small.',
  'One good conversation can change everything.',
  'You bring more to the table than you think.',
  'Each application is practice, and practice pays off.',
  'Take a breath. You are doing better than you feel.',
  'Rest is part of the process too.',
  'Keep going. The right fit is looking for you too.',
  'Your next yes could be closer than you think.',
  'Be kind to yourself. A job search is hard work.',
  'Your experience counts, even when replies are slow.',
  'Showing up is most of the work.',
  'Good things take time, and you are putting in the time.',
];

const PROGRESS: ((stats: JobStats) => string)[] = [
  ({ thisWeek }) => `${pluralize(thisWeek, 'application')} this week. Steady work pays off.`,
  ({ thisWeek }) => `${pluralize(thisWeek, 'application')} this week, and each one counts.`,
  ({ applications }) => `${pluralize(applications, 'application')} so far. That adds up.`,
];

/** How the week is going: no applications, some, or the best week so far. */
export type WeekBand = 'quiet' | 'active' | 'best';

/**
 * Sorts the week into a band. A best week needs at least three applications.
 *
 * @param stats - How the user has done, from `summarize`.
 * @returns The week's band.
 */
export function weekBand(stats: JobStats): WeekBand {
  if (stats.thisWeek >= MIN_BEST_WEEK && stats.thisWeek === stats.bestWeek) return 'best';
  return stats.thisWeek > 0 ? 'active' : 'quiet';
}

/**
 * Picks the warm line for a day. It moves to the next line each day, and a week with applications
 * also draws on lines about the numbers. A best week always wins.
 *
 * @param stats - How the user has done, from `summarize`.
 * @param day - The local date, such as "2026-10-15".
 * @returns One short, encouraging sentence.
 */
export function chooseMessage(stats: JobStats, day: string): string {
  const band = weekBand(stats);
  if (band === 'best') return `Your best week so far: ${stats.thisWeek} applications. Well done.`;
  const lines = band === 'active' ? GENERAL.concat(PROGRESS.map((line) => line(stats))) : GENERAL;
  const dayNumber = Date.parse(`${day}T00:00:00Z`) / DAY_MS;
  return lines[dayNumber % lines.length]!;
}
