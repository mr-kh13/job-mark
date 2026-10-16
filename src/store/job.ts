import { z } from 'zod';
import { isWebLink } from '@/utils/url';

/** Application statuses, in pipeline order. */
export const STATUSES = [
  'Interested',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
  'No response',
] as const;
/** Allowed values for `Job.workArrangement`. */
export const WORK_ARRANGEMENTS = ['On-site', 'Hybrid', 'Remote'] as const;
/** Allowed values for `Job.employmentType`. */
export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Casual',
  'Internship',
] as const;

export type Status = (typeof STATUSES)[number];

/** The version of the `Job` shape. Backup files carry it. */
export const SCHEMA_VERSION = 1;

/** The longest a text field read from a page may be. */
export const MAX_TEXT_LENGTH = 1000;
/** The longest a job link may be. */
export const MAX_URL_LENGTH = 2048;
const MAX_ID_LENGTH = 200;

/**
 * A tracked job application, as stored. `id` is `<site>[-region]:<siteId>` or `manual:<uuid>`;
 * timestamps are UTC ISO strings. Also the runtime validator: `Job.parse(raw)`.
 *
 * The fields a page can fill are length-limited; notes, which only the user types, are not.
 */
export const Job = z.object({
  id: z
    .string()
    .max(MAX_ID_LENGTH)
    .regex(/^(seek|linkedin|manual)(-[a-z]+)?:\S+$/),
  source: z.enum(['seek', 'linkedin', 'other']),
  title: z.string().max(MAX_TEXT_LENGTH),
  company: z.string().max(MAX_TEXT_LENGTH),
  location: z.string().max(MAX_TEXT_LENGTH),
  workArrangement: z.enum(WORK_ARRANGEMENTS).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  salary: z.string().max(MAX_TEXT_LENGTH).optional(),
  applyType: z.enum(['easy', 'quick', 'external', 'unknown']),
  url: z
    .string()
    .max(MAX_URL_LENGTH)
    .refine(
      (value) => value === '' || isWebLink(value),
      'Must be empty or start with http:// or https://',
    ),
  savedAt: z.iso.datetime(),
  appliedAt: z.iso.datetime().optional(),
  status: z.enum(STATUSES).default('Interested'),
  notes: z.string().default(''),
  needsReview: z.boolean().default(false),
  updatedAt: z.iso.datetime(),
});
export type Job = z.infer<typeof Job>;

/** A reference to a job page: its id, source and canonical link. */
export type JobRef = Pick<Job, 'id' | 'source' | 'url'>;

/** The fields of a `Job` that can be edited. `id` never changes and `updatedAt` is stamped. */
export type JobPatch = Partial<Omit<Job, 'id' | 'updatedAt'>>;

const CLEARABLE_FIELDS = ['workArrangement', 'employmentType', 'salary', 'appliedAt'];

const hasTitleAndCompany = (job: Pick<Job, 'title' | 'company'>) =>
  job.title.trim() !== '' && job.company.trim() !== '';

/**
 * Returns a copy of `job` with `patch` applied. `undefined` clears the optional fields
 * `workArrangement`, `employmentType`, `salary` and `appliedAt`, and is ignored for the rest.
 *
 * A job flagged `needsReview` stops being flagged once its title and company are both filled in.
 *
 * @param job - The job to patch.
 * @param patch - The fields to change.
 * @param at - ISO time to stamp as `updatedAt`.
 * @returns The patched copy.
 * @throws If the patched job is invalid.
 */
export function applyPatch(job: Job, patch: JobPatch, at: string): Job {
  const next: Record<string, unknown> = structuredClone(job);
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined || CLEARABLE_FIELDS.includes(field)) next[field] = value;
  }
  next.id = job.id;
  next.updatedAt = at;
  const patched = Job.parse(next);
  // eslint-disable-next-line no-restricted-syntax -- one-field copy of a validated job
  return { ...patched, needsReview: patched.needsReview && !hasTitleAndCompany(patched) };
}

/** What a new job is made from. The rest of a `Job` is filled in by `createJob`. */
export type NewJob = Pick<
  Job,
  | 'id'
  | 'source'
  | 'title'
  | 'company'
  | 'location'
  | 'workArrangement'
  | 'employmentType'
  | 'salary'
  | 'url'
  | 'status'
> & { applyType?: Job['applyType'] };

/**
 * Makes a new job: text trimmed, a blank salary dropped, and `appliedAt` set for any status past
 * `Interested`.
 *
 * @param input - The job's details.
 * @param at - ISO time to stamp as `savedAt`, `appliedAt` and `updatedAt`.
 * @returns The new job, flagged `needsReview` if its title or company is blank. `applyType` is
 * `unknown` unless given.
 */
export function createJob(input: NewJob, at: string): Job {
  const title = input.title.trim();
  const company = input.company.trim();
  return {
    id: input.id,
    source: input.source,
    title,
    company,
    location: input.location.trim(),
    workArrangement: input.workArrangement,
    employmentType: input.employmentType,
    salary: input.salary?.trim() || undefined,
    applyType: input.applyType ?? 'unknown',
    url: input.url.trim(),
    savedAt: at,
    appliedAt: input.status === 'Interested' ? undefined : at,
    status: input.status,
    notes: '',
    needsReview: !hasTitleAndCompany({ title, company }),
    updatedAt: at,
  };
}

/**
 * The date a job is listed under: when it was applied for, or else when it was saved.
 *
 * @param job - The job.
 * @returns An ISO time.
 */
export const listedAt = (job: Job): string => job.appliedAt ?? job.savedAt;

/**
 * Orders jobs for display: most recently listed first, then by id.
 *
 * @param a - The first job.
 * @param b - The second job.
 * @returns A negative number when `a` comes first, positive when `b` does, otherwise zero.
 */
export const newestFirstThenId = (a: Job, b: Job): number =>
  Date.parse(listedAt(b)) - Date.parse(listedAt(a)) || a.id.localeCompare(b.id);
