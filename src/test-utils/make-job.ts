import type { Job } from '@/store/job';

/** A valid job for tests; any field can be overridden. */
export const makeJob = (over: Partial<Job> = {}): Job => ({
  id: over.id ?? 'seek:1',
  source: over.source ?? 'seek',
  title: over.title ?? 'Engineer',
  company: over.company ?? 'Acme',
  location: over.location ?? 'Sydney',
  workArrangement: over.workArrangement,
  employmentType: over.employmentType,
  salary: over.salary,
  applyType: over.applyType ?? 'quick',
  url: over.url ?? 'https://au.seek.com/job/1',
  savedAt: over.savedAt ?? '2026-10-13T01:00:00.000Z',
  appliedAt: over.appliedAt,
  status: over.status ?? 'Interested',
  notes: over.notes ?? '',
  needsReview: over.needsReview ?? false,
  updatedAt: over.updatedAt ?? '2026-10-13T01:00:00.000Z',
});

/** An ISO time for a local date and time, so tests can expect what the user would see. */
export const localIso = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();
