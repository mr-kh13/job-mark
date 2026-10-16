import { describe, expect, it } from 'vitest';
import { localIso, makeJob } from '@/test-utils/make-job';
import type { Job } from './job';
import { summarizeJob } from './job-display';

const NOW = new Date(2026, 9, 13, 15, 0);
const YESTERDAY = localIso(2026, 10, 12, 9);

const applied = (over: Partial<Job> = {}) =>
  makeJob({
    id: over.id,
    status: over.status ?? 'Applied',
    appliedAt: over.appliedAt ?? YESTERDAY,
    savedAt: over.savedAt ?? YESTERDAY,
  });

describe('summarizeJob', () => {
  it('says when an applied job was applied for', () => {
    expect(summarizeJob(applied(), NOW)).toBe('Applied yesterday');
  });

  it('adds the status once it says something more than Applied', () => {
    expect(summarizeJob(applied({ status: 'Interviewing' }), NOW)).toBe(
      'Applied yesterday · Interviewing',
    );
  });

  it.each(['Offer', 'Rejected', 'Withdrawn', 'No response'] as const)(
    'adds the status %s',
    (status) => {
      expect(summarizeJob(applied({ status }), NOW)).toBe(`Applied yesterday · ${status}`);
    },
  );

  it('says "Saved" with the save date for a job never applied for', () => {
    const job = makeJob({ status: 'Interested', appliedAt: undefined, savedAt: YESTERDAY });

    expect(summarizeJob(job, NOW)).toBe('Saved yesterday');
  });

  it('uses the applied date, not the save date, once the job was applied for', () => {
    const job = applied({ savedAt: localIso(2026, 10, 1), appliedAt: localIso(2026, 10, 13, 8) });

    expect(summarizeJob(job, NOW)).toBe('Applied today');
  });

  describe('the day', () => {
    const textFor = (iso: string) => summarizeJob(applied({ appliedAt: iso }), NOW);

    it('is "today" for the current local day', () => {
      expect(textFor(localIso(2026, 10, 13, 0, 1))).toBe('Applied today');
    });

    it('follows the local calendar, not the number of hours', () => {
      const justAfterMidnight = new Date(2026, 9, 13, 0, 1);

      const text = summarizeJob(
        applied({ appliedAt: localIso(2026, 10, 12, 23, 59) }),
        justAfterMidnight,
      );

      expect(text).toBe('Applied yesterday');
    });

    it('counts the day daylight saving starts as one day', () => {
      // Sydney's clocks went forward on 4 October 2026, so that day had 23 hours.
      const monday = new Date(2026, 9, 5, 15, 0);

      const text = summarizeJob(applied({ appliedAt: localIso(2026, 10, 4, 12) }), monday);

      expect(text).toBe('Applied yesterday');
    });

    it('counts days up to a week back', () => {
      expect(textFor(localIso(2026, 10, 10, 9))).toBe('Applied 3 days ago');
      expect(textFor(localIso(2026, 10, 7, 9))).toBe('Applied 6 days ago');
    });

    it('turns into a date after that', () => {
      expect(textFor(localIso(2026, 10, 6, 9))).toBe('Applied 6 Oct');
    });

    it('adds the year when it is not this year', () => {
      expect(textFor(localIso(2025, 12, 30, 9))).toBe('Applied 30 Dec 2025');
    });

    it('is a date for a time ahead of now', () => {
      expect(textFor(localIso(2026, 10, 14, 9))).toBe('Applied 14 Oct');
    });
  });
});
