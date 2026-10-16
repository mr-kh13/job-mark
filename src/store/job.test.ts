// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  Job,
  STATUSES,
  applyPatch,
  createJob,
  listedAt,
  newestFirstThenId,
  type NewJob,
} from './job';

const makeJob = (over: Partial<Job> = {}): Job => ({
  id: over.id ?? 'seek:1',
  source: over.source ?? 'seek',
  title: over.title ?? 'Engineer',
  company: over.company ?? 'Acme',
  location: over.location ?? 'Sydney',
  workArrangement: over.workArrangement,
  employmentType: over.employmentType,
  salary: over.salary,
  applyType: over.applyType ?? 'quick',
  url: over.url ?? 'https://www.seek.com.au/job/1',
  savedAt: over.savedAt ?? '2026-10-13T01:00:00.000Z',
  appliedAt: over.appliedAt,
  status: over.status ?? 'Interested',
  notes: over.notes ?? '',
  needsReview: over.needsReview ?? false,
  updatedAt: over.updatedAt ?? '2026-10-13T01:00:00.000Z',
});

const validJob = (
  over: { id?: string; source?: string; status?: string; savedAt?: string; url?: string } = {},
) => ({
  id: over.id ?? 'seek:12345',
  source: over.source ?? 'seek',
  status: over.status,
  title: 'Engineer',
  company: 'Acme',
  location: 'Sydney NSW',
  applyType: 'quick',
  url: over.url ?? 'https://www.seek.com.au/job/12345',
  savedAt: over.savedAt ?? '2026-10-13T01:00:00.000Z',
  updatedAt: '2026-10-13T01:00:00.000Z',
});

describe('Job', () => {
  it('fills defaults for status, notes and needsReview', () => {
    const job = Job.parse(validJob());
    expect(job.status).toBe('Interested');
    expect(job.notes).toBe('');
    expect(job.needsReview).toBe(false);
    expect(job.appliedAt).toBeUndefined();
  });

  it('accepts every id prefix, including regional sites and manual entries', () => {
    for (const id of ['seek:1', 'seek-nz:2', 'linkedin:3', 'manual:4f1c']) {
      expect(Job.safeParse(validJob({ id })).success).toBe(true);
    }
  });

  it.each(['seek:1\nsecond line', 'seek:1 2', 'linkedin:1\t2', 'manual: '])(
    'rejects the id %j, which has whitespace after the prefix',
    (id) => {
      expect(Job.safeParse(validJob({ id })).success).toBe(false);
    },
  );

  describe('size limits, which keep a page from filling the storage with one field', () => {
    const withField = (field: string, value: string) =>
      Object.fromEntries(Object.entries(validJob()).concat([[field, value]]));

    it.each(['title', 'company', 'location', 'salary'])(
      'accepts a %s of 1,000 characters and rejects one of 1,001',
      (field) => {
        expect(Job.safeParse(withField(field, 'x'.repeat(1000))).success).toBe(true);
        expect(Job.safeParse(withField(field, 'x'.repeat(1001))).success).toBe(false);
      },
    );

    it('accepts a link of 2,048 characters and rejects one of 2,049', () => {
      const link = (length: number) => 'https://www.seek.com.au/job/' + 'x'.repeat(length - 28);

      expect(Job.safeParse(withField('url', link(2048))).success).toBe(true);
      expect(Job.safeParse(withField('url', link(2049))).success).toBe(false);
    });

    it('accepts an id of 200 characters and rejects one of 201', () => {
      const id = (length: number) => 'seek:' + '1'.repeat(length - 5);

      expect(Job.safeParse(validJob({ id: id(200) })).success).toBe(true);
      expect(Job.safeParse(validJob({ id: id(201) })).success).toBe(false);
    });

    it('leaves notes, which only the user types, without a limit', () => {
      expect(Job.safeParse(withField('notes', 'x'.repeat(100_000))).success).toBe(true);
    });
  });

  it('rejects an unknown id prefix, source or status', () => {
    expect(Job.safeParse(validJob({ id: 'indeed:1' })).success).toBe(false);
    expect(Job.safeParse(validJob({ source: 'indeed' })).success).toBe(false);
    expect(Job.safeParse(validJob({ status: 'Ghosted' })).success).toBe(false);
  });

  it.each([
    '',
    'http://localhost/job/1',
    'http://intranet/jobs/1',
    'https://www.seek.com.au/job/1',
    'https://www.linkedin.com/jobs/view/123/?trackingId=abc',
  ])('accepts the url "%s"', (url) => {
    expect(Job.safeParse(validJob({ url })).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/job', 'example.com/job'])(
    'rejects the url "%s", which is not a web link',
    (url) => {
      expect(Job.safeParse(validJob({ url })).success).toBe(false);
    },
  );

  it('rejects a timestamp that is not ISO', () => {
    expect(Job.safeParse(validJob({ savedAt: 'yesterday' })).success).toBe(false);
  });

  it('lists the seven statuses in pipeline order', () => {
    expect(STATUSES).toEqual([
      'Interested',
      'Applied',
      'Interviewing',
      'Offer',
      'Rejected',
      'Withdrawn',
      'No response',
    ]);
  });
});

describe('applyPatch', () => {
  it('applies the patch and stamps updatedAt with the given time', () => {
    const next = applyPatch(
      makeJob(),
      { status: 'Applied', notes: 'called' },
      '2026-11-01T00:00:00.000Z',
    );
    expect(next.status).toBe('Applied');
    expect(next.notes).toBe('called');
    expect(next.updatedAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('does not change the job it was given', () => {
    const job = makeJob();
    applyPatch(job, { notes: 'changed' }, '2026-11-01T00:00:00.000Z');
    expect(job).toEqual(makeJob());
  });

  describe('needsReview', () => {
    const at = '2026-11-01T00:00:00.000Z';
    const flagged = (over: { title?: string; company?: string } = {}) =>
      makeJob({ needsReview: true, title: over.title, company: over.company });

    it('clears once an edit leaves the title and company filled', () => {
      const job = flagged({ title: '', company: 'Acme' });

      expect(applyPatch(job, { title: 'Engineer' }, at).needsReview).toBe(false);
    });

    it('clears on an edit to any field when the title and company are filled', () => {
      expect(applyPatch(flagged(), { notes: 'called' }, at).needsReview).toBe(false);
    });

    it('stays while the title is still blank', () => {
      const job = flagged({ title: '', company: 'Acme' });

      expect(applyPatch(job, { location: 'Perth' }, at).needsReview).toBe(true);
    });

    it('stays while the company is blank or only spaces', () => {
      const job = flagged({ title: 'Engineer', company: '   ' });

      expect(applyPatch(job, { notes: 'called' }, at).needsReview).toBe(true);
      expect(applyPatch(job, { title: 'Senior Engineer' }, at).needsReview).toBe(true);
    });

    it('is never turned on by an edit, even one that blanks a field', () => {
      expect(applyPatch(makeJob(), { company: '' }, at).needsReview).toBe(false);
    });
  });

  it('rejects a patch that makes the job invalid', () => {
    expect(() =>
      applyPatch(makeJob(), { savedAt: 'yesterday' }, '2026-11-01T00:00:00.000Z'),
    ).toThrow();
  });
});

describe('createJob', () => {
  const at = '2026-11-01T00:00:00.000Z';
  const newJob = (over: Partial<NewJob> = {}): NewJob => ({
    id: over.id ?? 'manual:abc',
    source: over.source ?? 'other',
    title: over.title ?? 'Engineer',
    company: over.company ?? 'Acme',
    location: over.location ?? 'Sydney',
    workArrangement: over.workArrangement,
    employmentType: over.employmentType,
    salary: over.salary,
    applyType: over.applyType,
    url: over.url ?? 'https://example.com/job',
    status: over.status ?? 'Applied',
  });

  it('keeps the details it is given', () => {
    const job = createJob(
      newJob({
        workArrangement: 'Hybrid',
        employmentType: 'Contract',
        salary: '$150k',
        applyType: 'easy',
        status: 'Interviewing',
      }),
      at,
    );

    expect(job).toMatchObject({
      id: 'manual:abc',
      source: 'other',
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      workArrangement: 'Hybrid',
      employmentType: 'Contract',
      salary: '$150k',
      applyType: 'easy',
      url: 'https://example.com/job',
      status: 'Interviewing',
    });
  });

  it('stamps the given time as savedAt and updatedAt, and starts with no notes', () => {
    const job = createJob(newJob(), at);

    expect(job.savedAt).toBe(at);
    expect(job.updatedAt).toBe(at);
    expect(job.notes).toBe('');
  });

  it('leaves applyType as unknown unless it is given', () => {
    expect(createJob(newJob(), at).applyType).toBe('unknown');
  });

  it('trims the text fields', () => {
    const job = createJob(
      newJob({
        title: '  Engineer ',
        company: ' Acme  ',
        location: ' Sydney ',
        salary: ' $150k ',
        url: ' https://example.com/job ',
      }),
      at,
    );

    expect(job).toMatchObject({
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      salary: '$150k',
      url: 'https://example.com/job',
    });
  });

  it.each(['', '   ', undefined])('stores the salary %j as none', (salary) => {
    expect(createJob(newJob({ salary }), at).salary).toBeUndefined();
  });

  it('leaves appliedAt unset for an Interested job', () => {
    expect(createJob(newJob({ status: 'Interested' }), at).appliedAt).toBeUndefined();
  });

  it.each(STATUSES.filter((status) => status !== 'Interested'))(
    'sets appliedAt to the given time for the status %s',
    (status) => {
      expect(createJob(newJob({ status }), at).appliedAt).toBe(at);
    },
  );

  it.each([
    { title: '', company: 'Acme' },
    { title: '   ', company: 'Acme' },
    { title: 'Engineer', company: '' },
    { title: 'Engineer', company: '   ' },
  ])(
    'flags the job for review when the title is "$title" and the company is "$company"',
    (fields) => {
      expect(createJob(newJob(fields), at).needsReview).toBe(true);
    },
  );

  it('does not flag a job that has a title and a company', () => {
    expect(createJob(newJob(), at).needsReview).toBe(false);
  });

  it('makes a job the store accepts', () => {
    const job = createJob(newJob(), at);

    expect(Job.parse(job)).toEqual(job);
  });
});

describe('listedAt', () => {
  it('is the applied date when the job has one', () => {
    const job = makeJob({
      savedAt: '2026-10-01T00:00:00.000Z',
      appliedAt: '2026-10-05T00:00:00.000Z',
    });

    expect(listedAt(job)).toBe('2026-10-05T00:00:00.000Z');
  });

  it('falls back to the saved date for a job never applied for', () => {
    const job = makeJob({ savedAt: '2026-10-01T00:00:00.000Z', appliedAt: undefined });

    expect(listedAt(job)).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('newestFirstThenId', () => {
  const ids = (jobs: Job[]) => jobs.toSorted(newestFirstThenId).map((job) => job.id);

  it('puts the most recently listed job first', () => {
    const jobs = [
      makeJob({ id: 'seek:old', savedAt: '2026-10-01T00:00:00.000Z' }),
      makeJob({ id: 'seek:new', savedAt: '2026-10-09T00:00:00.000Z' }),
      makeJob({ id: 'seek:mid', savedAt: '2026-10-05T00:00:00.000Z' }),
    ];

    expect(ids(jobs)).toEqual(['seek:new', 'seek:mid', 'seek:old']);
  });

  it('orders an applied job by its applied date, not its saved date', () => {
    const jobs = [
      makeJob({ id: 'seek:saved-later', savedAt: '2026-10-08T00:00:00.000Z' }),
      makeJob({
        id: 'seek:applied-later',
        savedAt: '2026-10-01T00:00:00.000Z',
        appliedAt: '2026-10-09T00:00:00.000Z',
      }),
    ];

    expect(ids(jobs)).toEqual(['seek:applied-later', 'seek:saved-later']);
  });

  it('orders jobs listed at the same time by id', () => {
    const jobs = [
      makeJob({ id: 'seek:b', savedAt: '2026-10-05T00:00:00.000Z' }),
      makeJob({ id: 'seek:c', savedAt: '2026-10-05T00:00:00.000Z' }),
      makeJob({ id: 'seek:a', savedAt: '2026-10-05T00:00:00.000Z' }),
    ];

    expect(ids(jobs)).toEqual(['seek:a', 'seek:b', 'seek:c']);
  });
});
