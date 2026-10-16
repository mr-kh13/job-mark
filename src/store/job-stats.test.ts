import { describe, expect, it } from 'vitest';
import { makeJob } from '@/test-utils/make-job';
import { summarize } from './job-stats';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

describe('summarize', () => {
  it('counts nothing for no jobs', () => {
    expect(summarize([], NOW)).toEqual({ applications: 0, thisWeek: 0, bestWeek: 0 });
  });

  it('counts a job with an applied date as an application, whatever its status is now', () => {
    const jobs = [
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: daysAgo(30) }),
      makeJob({ id: 'seek:2', status: 'Rejected', appliedAt: daysAgo(20) }),
      makeJob({ id: 'seek:3', status: 'Interviewing', appliedAt: daysAgo(2) }),
    ];

    expect(summarize(jobs, NOW).applications).toBe(3);
  });

  it('counts only jobs with an applied date as applications', () => {
    const jobs = [
      makeJob({ id: 'seek:1', status: 'Interested' }),
      makeJob({ id: 'seek:2', status: 'Interested', appliedAt: daysAgo(1) }),
      makeJob({ id: 'seek:3', status: 'Withdrawn' }),
      makeJob({ id: 'seek:4', status: 'Applied', appliedAt: daysAgo(1) }),
    ];

    expect(summarize(jobs, NOW).applications).toBe(2);
  });

  it('counts this week as the last seven days of applied dates, from now', () => {
    const jobs = [
      makeJob({ id: 'seek:1', status: 'Applied', appliedAt: daysAgo(0) }),
      makeJob({ id: 'seek:2', status: 'Applied', appliedAt: daysAgo(7) }),
      makeJob({
        id: 'seek:3',
        status: 'Applied',
        appliedAt: new Date(NOW.getTime() - 7 * DAY_MS - 1).toISOString(),
      }),
      makeJob({ id: 'seek:4', status: 'Interested', savedAt: daysAgo(1) }),
    ];

    expect(summarize(jobs, NOW).thisWeek).toBe(2);
  });

  it('uses the current time when none is given', () => {
    const today = new Date().toISOString();

    expect(summarize([makeJob({ status: 'Applied', appliedAt: today })]).thisWeek).toBe(1);
  });
});

describe('summarize best week', () => {
  const applied = (id: string, appliedAt: string) => makeJob({ id, status: 'Applied', appliedAt });

  it('is the most applications within any seven days, even long ago', () => {
    const jobs = [
      applied('seek:1', daysAgo(40)),
      applied('seek:2', daysAgo(38)),
      applied('seek:3', daysAgo(35)),
      applied('seek:4', daysAgo(1)),
    ];

    const stats = summarize(jobs, NOW);

    expect(stats.bestWeek).toBe(3);
    expect(stats.thisWeek).toBe(1);
  });

  it('does not depend on the order of the jobs', () => {
    const jobs = [
      applied('seek:1', daysAgo(1)),
      applied('seek:2', daysAgo(35)),
      applied('seek:3', daysAgo(40)),
      applied('seek:4', daysAgo(38)),
    ];

    expect(summarize(jobs, NOW).bestWeek).toBe(3);
  });

  it('counts applications exactly seven days apart together', () => {
    const jobs = [applied('seek:1', daysAgo(20)), applied('seek:2', daysAgo(13))];

    expect(summarize(jobs, NOW).bestWeek).toBe(2);
  });

  it('keeps applications more than seven days apart in separate weeks', () => {
    const jobs = [
      applied('seek:1', daysAgo(20)),
      applied('seek:2', new Date(NOW.getTime() - 13 * DAY_MS + 1).toISOString()),
    ];

    expect(summarize(jobs, NOW).bestWeek).toBe(1);
  });

  it('counts applications made at the same moment', () => {
    const moment = daysAgo(10);
    const jobs = [applied('seek:1', moment), applied('seek:2', moment), applied('seek:3', moment)];

    expect(summarize(jobs, NOW).bestWeek).toBe(3);
  });

  it('equals this week when this week is the best one', () => {
    const jobs = [
      applied('seek:1', daysAgo(0)),
      applied('seek:2', daysAgo(1)),
      applied('seek:3', daysAgo(3)),
      applied('seek:4', daysAgo(30)),
    ];

    const stats = summarize(jobs, NOW);

    expect(stats.bestWeek).toBe(3);
    expect(stats.thisWeek).toBe(3);
  });

  it('is never below this week, even with applied dates in the future', () => {
    const jobs = [
      applied('seek:1', daysAgo(1)),
      applied('seek:2', daysAgo(-30)),
      applied('seek:3', daysAgo(-60)),
    ];

    const stats = summarize(jobs, NOW);

    expect(stats.thisWeek).toBe(3);
    expect(stats.bestWeek).toBeGreaterThanOrEqual(stats.thisWeek);
  });

  it('ignores jobs that have no applied date', () => {
    const jobs = [
      makeJob({ id: 'seek:1', status: 'Interested', savedAt: daysAgo(1) }),
      makeJob({ id: 'seek:2', status: 'Interested', savedAt: daysAgo(2) }),
    ];

    expect(summarize(jobs, NOW).bestWeek).toBe(0);
  });
});
