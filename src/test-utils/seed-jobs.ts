// Also run by `scripts/seed.ts` under plain Node, so this file imports only types.
import type { Job } from '@/store/job';

// Kept equal to the store's version by the test.
const SCHEMA_VERSION = 1;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SPREAD_DAYS = 540;
const RANDOM_SEED = 20261014;

type Random = () => number;
type Weighted<T> = readonly (readonly [T, number])[];
type Kind = 'seek' | 'seek-nz' | 'linkedin' | 'manual';

const KINDS: Weighted<Kind> = [
  ['seek', 45],
  ['seek-nz', 8],
  ['linkedin', 35],
  ['manual', 12],
];

const STATUSES: Weighted<Job['status']> = [
  ['Interested', 20],
  ['Applied', 30],
  ['Interviewing', 10],
  ['Offer', 3],
  ['Rejected', 15],
  ['Withdrawn', 4],
  ['No response', 18],
];

const WORK_ARRANGEMENTS = ['On-site', 'Hybrid', 'Remote'] as const;
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Casual', 'Internship'] as const;

const SENIORITY = ['', '', '', 'Senior ', 'Lead ', 'Principal ', 'Junior '];
const ROLES = [
  'Platform Engineer',
  'Frontend Developer',
  'Backend Engineer (Go)',
  'Data Engineer',
  'DevOps Engineer',
  'Site Reliability Engineer',
  'Full Stack Developer',
  'iOS Developer',
  'QA Automation Engineer',
  'Engineering Manager',
  'Product Designer',
  'Data Analyst',
  'Machine Learning Engineer',
  'Security Engineer',
  'Solutions Architect',
  'Cloud Engineer',
  'Software Engineer (Python)',
  'React Developer',
  'Staff Engineer',
  'Technical Product Manager',
];

const COMPANIES = [
  'Acme Cloud',
  'Pixel & Co',
  'Ledgerly',
  'Northwind Traders',
  'Globex',
  'Initech',
  'Hooli Labs',
  'Umbrella Digital',
  'Wayne Systems',
  'Stark Software',
  'Wonka Data',
  'Cyberdyne',
  'Soylent Tech',
  'Vandelay Industries',
  'Oscorp',
  'Tyrell Cloud',
  'Aperture Works',
  'Massive Dynamic',
  'Gringotts Fintech',
  'Pied Piper',
  'Dunder Mifflin Digital',
  'Bluth Software',
  'Prestige Worldwide',
  'Monsters Inc. Engineering',
  'Los Pollos Analytics',
];

const LOCATIONS = [
  'Sydney NSW',
  'Melbourne VIC',
  'Brisbane QLD',
  'Perth WA',
  'Adelaide SA',
  'Canberra ACT',
  'Hobart TAS',
  'Gold Coast QLD',
  'Newcastle NSW',
  'Auckland',
  'Wellington',
  'Christchurch',
  'Remote, Australia',
];

const SALARIES = [
  '$120k - $140k',
  '$150,000 - $180,000 plus super',
  '$900 per day',
  'Up to $130k',
  '$95k + bonus',
  '$85 - $95 per hour',
  '$200,000+',
  'Negotiable',
];

const NOTES = [
  'Referral from Sam',
  'Phone screen went well. Technical round Thursday.',
  'Recruiter: Jordan\nSalary expectation: $150k\nFollow up on Friday',
  'Said "we will be in touch next week"',
  'Great team 👍 — café meeting, 日本語 spec to read',
  'Tailored the cover letter. Mentioned the Kubernetes migration and the on-call rotation. ' +
    'They use Go and TypeScript; ask about the testing culture and how releases work.\n' +
    'Second interview with the engineering manager and a take-home exercise.\n' +
    'Check the salary band against the other offers before replying.',
  'Follow up if no reply by the 20th',
];

/** A small seeded generator, so the same seed always gives the same jobs. */
function createRandom(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: Random, list: readonly T[]): T =>
  list[Math.floor(random() * list.length)]!;

const chance = (random: Random, probability: number): boolean => random() < probability;

function pickWeighted<T>(random: Random, options: Weighted<T>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options.at(-1)![0];
}

const toMinute = (ms: number) => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

type Identity = Pick<Job, 'id' | 'source' | 'url' | 'applyType'>;

function makeIdentity(random: Random, kind: Kind, index: number): Identity {
  switch (kind) {
    case 'seek': {
      const id = 80_000_000 + index;
      const applyType = pick(random, ['quick', 'quick', 'external'] as const);
      return {
        id: `seek:${id}`,
        source: 'seek',
        url: `https://www.seek.com.au/job/${id}`,
        applyType,
      };
    }
    case 'seek-nz': {
      const id = 70_000_000 + index;
      const applyType = pick(random, ['quick', 'external'] as const);
      return {
        id: `seek-nz:${id}`,
        source: 'seek',
        url: `https://www.seek.co.nz/job/${id}`,
        applyType,
      };
    }
    case 'linkedin': {
      const id = 4_000_000_000 + index;
      const applyType = pick(random, ['easy', 'easy', 'external'] as const);
      return {
        id: `linkedin:${id}`,
        source: 'linkedin',
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        applyType,
      };
    }
    case 'manual': {
      const uuid = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
      const url = chance(random, 0.3) ? '' : `https://careers.example.com/jobs/${index}`;
      return { id: `manual:${uuid}`, source: 'other', url, applyType: 'unknown' };
    }
  }
}

function makeJob(random: Random, index: number, now: number): Job {
  const identity = makeIdentity(random, pickWeighted(random, KINDS), index);
  const status = pickWeighted(random, STATUSES);
  const isFlagged = chance(random, 0.03);
  const isTitleBlank = isFlagged && chance(random, 0.5);
  const isCompanyBlank = isFlagged && !isTitleBlank;

  const savedAt = toMinute(now - random() * SPREAD_DAYS * DAY_MS);
  const appliedAt =
    status === 'Interested' ? undefined : toMinute(Math.min(now, savedAt + random() * 5 * DAY_MS));
  const updatedAt = toMinute(
    Math.min(now, Math.max(appliedAt ?? savedAt, savedAt) + random() * 10 * DAY_MS),
  );

  return {
    id: identity.id,
    source: identity.source,
    title: isTitleBlank ? '' : pick(random, SENIORITY) + pick(random, ROLES),
    company: isCompanyBlank ? '' : pick(random, COMPANIES),
    location: pick(random, LOCATIONS),
    workArrangement: chance(random, 0.75) ? pick(random, WORK_ARRANGEMENTS) : undefined,
    employmentType: chance(random, 0.8) ? pick(random, EMPLOYMENT_TYPES) : undefined,
    salary: chance(random, 0.6) ? pick(random, SALARIES) : undefined,
    applyType: identity.applyType,
    url: identity.url,
    savedAt: new Date(savedAt).toISOString(),
    appliedAt: appliedAt === undefined ? undefined : new Date(appliedAt).toISOString(),
    status,
    notes: chance(random, 0.45) ? pick(random, NOTES) : '',
    needsReview: isFlagged,
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

/**
 * Makes realistic jobs for trying out the sheet: every status, site and work type, gaps in the
 * optional fields, flagged rows, and dates spread over about 18 months before `now`.
 *
 * @param count - How many jobs to make.
 * @param now - The latest time a job may carry.
 * @returns The jobs. The same arguments always give the same jobs.
 */
export function seedJobs(count: number, now: Date): Job[] {
  const random = createRandom(RANDOM_SEED);
  return Array.from({ length: count }, (_, index) => makeJob(random, index, now.getTime()));
}

/**
 * Makes the text of a backup file holding seed jobs, ready for the sheet's Import button.
 *
 * @param count - How many jobs to make.
 * @param now - The export time, and the latest time a job may carry.
 * @returns The file's text.
 */
export function seedBackup(count: number, now: Date): string {
  return JSON.stringify(
    {
      app: 'jobmark',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      jobs: seedJobs(count, now),
    },
    null,
    2,
  );
}
