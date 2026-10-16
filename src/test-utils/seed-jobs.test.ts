import { describe, expect, it } from 'vitest';
import { parseBackup } from '@/entrypoints/sheet/backup/backup';
import { EMPLOYMENT_TYPES, SCHEMA_VERSION, STATUSES, WORK_ARRANGEMENTS } from '@/store/job';
import { seedBackup, seedJobs } from './seed-jobs';

const NOW = new Date('2026-10-14T00:00:00.000Z');

describe('seedJobs', () => {
  it.each([0, 1, 25, 500])('makes %i jobs', (count) => {
    expect(seedJobs(count, NOW)).toHaveLength(count);
  });

  it('gives every job its own id', () => {
    const ids = seedJobs(2000, NOW).map((job) => job.id);

    expect(new Set(ids).size).toBe(2000);
  });

  it('makes the same jobs every time for the same count and time', () => {
    expect(seedJobs(300, NOW)).toEqual(seedJobs(300, NOW));
  });

  it('makes a longer list that starts with the shorter one', () => {
    expect(seedJobs(500, NOW).slice(0, 100)).toEqual(seedJobs(100, NOW));
  });

  describe('variety, so every part of the sheet has something to show', () => {
    const jobs = seedJobs(500, NOW);

    it('uses every status', () => {
      expect(new Set(jobs.map((job) => job.status))).toEqual(new Set(STATUSES));
    });

    it('uses every source and every id prefix', () => {
      expect(new Set(jobs.map((job) => job.source))).toEqual(
        new Set(['seek', 'linkedin', 'other']),
      );
      const prefixes = jobs.map((job) => job.id.split(':')[0]);
      expect(new Set(prefixes)).toEqual(new Set(['seek', 'seek-nz', 'linkedin', 'manual']));
    });

    it('uses every work arrangement and employment type, and leaves some unset', () => {
      const unset: (string | undefined)[] = [undefined];
      const arrangements = jobs.map((job) => job.workArrangement);
      const employments = jobs.map((job) => job.employmentType);

      expect(new Set(arrangements)).toEqual(new Set(unset.concat(WORK_ARRANGEMENTS)));
      expect(new Set(employments)).toEqual(new Set(unset.concat(EMPLOYMENT_TYPES)));
    });

    it('leaves some salaries, links and notes empty', () => {
      expect(jobs.some((job) => job.salary === undefined)).toBe(true);
      expect(jobs.some((job) => job.url === '')).toBe(true);
      expect(jobs.some((job) => job.notes === '')).toBe(true);
    });

    it('includes multi-line notes and notes with quotes and non-Latin text', () => {
      expect(jobs.some((job) => job.notes.includes('\n'))).toBe(true);
      expect(jobs.some((job) => job.notes.includes('"'))).toBe(true);
      expect(jobs.some((job) => /[^\x20-\x7e\n]/.test(job.notes))).toBe(true);
    });

    it('includes jobs flagged for review, each with a blank title or company', () => {
      const flagged = jobs.filter((job) => job.needsReview);

      expect(flagged.length).toBeGreaterThan(0);
      for (const job of flagged) expect(job.title === '' || job.company === '').toBe(true);
    });

    it('flags no job that has both a title and a company', () => {
      const complete = jobs.filter((job) => job.title !== '' && job.company !== '');

      expect(complete.some((job) => job.needsReview)).toBe(false);
    });
  });

  describe('dates', () => {
    const jobs = seedJobs(500, NOW);
    const time = (iso: string) => Date.parse(iso);

    it('never lie in the future', () => {
      for (const job of jobs) {
        expect(time(job.savedAt)).toBeLessThanOrEqual(NOW.getTime());
        expect(time(job.updatedAt)).toBeLessThanOrEqual(NOW.getTime());
      }
    });

    it('spread over more than a year', () => {
      const saved = jobs.map((job) => time(job.savedAt));
      const latest = saved.reduce((a, b) => Math.max(a, b));
      const earliest = saved.reduce((a, b) => Math.min(a, b));
      const spanDays = (latest - earliest) / 86_400_000;

      expect(spanDays).toBeGreaterThan(365);
    });

    it('set appliedAt only for applied jobs, never before the job was saved', () => {
      for (const job of jobs) {
        if (job.status === 'Interested') {
          expect(job.appliedAt).toBeUndefined();
        } else {
          expect(job.appliedAt).toBeDefined();
          expect(time(job.appliedAt!)).toBeGreaterThanOrEqual(time(job.savedAt));
        }
      }
    });

    it('never update a job before it was saved or applied for', () => {
      for (const job of jobs) {
        expect(time(job.updatedAt)).toBeGreaterThanOrEqual(time(job.savedAt));
        expect(time(job.updatedAt)).toBeGreaterThanOrEqual(time(job.appliedAt ?? job.savedAt));
      }
    });
  });
});

describe('seedBackup', () => {
  it('is a backup file the sheet can import', () => {
    const result = parseBackup(seedBackup(300, NOW));

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.jobs).toHaveLength(300);
  });

  it('holds the jobs seedJobs makes', () => {
    const result = parseBackup(seedBackup(50, NOW));

    expect(result.isOk && result.jobs).toEqual(seedJobs(50, NOW));
  });

  it('carries the current schema version and the export time', () => {
    const file = JSON.parse(seedBackup(1, NOW));

    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.exportedAt).toBe(NOW.toISOString());
  });
});
