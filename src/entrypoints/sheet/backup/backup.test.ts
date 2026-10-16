// @vitest-environment node
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeJob } from '@/test-utils/make-job';
import {
  backupFilename,
  backupNote,
  createBackup,
  importBackup,
  parseBackup,
  planImport,
} from './backup';
import { SCHEMA_VERSION, type Job } from '@/store/job';
import { jobStore } from '@/store/job-store';

beforeEach(() => {
  fakeBrowser.reset();
});

const NOW = new Date('2026-10-13T00:00:00.000Z');

/** A backup file's text, with the app tag and version a real one carries. */
const fileOf = (jobs: unknown[], over: { app?: string; schemaVersion?: number } = {}) =>
  JSON.stringify({
    app: over.app ?? 'jobmark',
    schemaVersion: over.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: NOW.toISOString(),
    jobs,
  });

/** A copy of a job with one field set to any value, for building invalid records. */
const withField = (job: Job, field: string, value: unknown) => {
  const entries: [string, unknown][] = Object.entries(job);
  return Object.fromEntries(entries.concat([[field, value]]));
};

const byId = (jobs: Job[]) => Array.from(jobs).sort((a, b) => a.id.localeCompare(b.id));

describe('createBackup and parseBackup', () => {
  it('round-trips every field of every job', () => {
    const jobs = [
      makeJob({
        id: 'seek:1',
        notes: 'line1\nline2 "quoted" 日本語',
        salary: '$100k',
        workArrangement: 'Hybrid',
        employmentType: 'Contract',
        status: 'Interviewing',
        appliedAt: '2026-10-02T03:00:00.000Z',
        needsReview: true,
      }),
      makeJob({ id: 'linkedin:2', source: 'linkedin', url: '' }),
    ];

    expect(parseBackup(createBackup(jobs, NOW))).toEqual({ isOk: true, jobs });
  });

  it('writes the app tag, schema version, export time and jobs', () => {
    const file = JSON.parse(createBackup([makeJob()], NOW));

    expect(file).toMatchObject({
      app: 'jobmark',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(file.jobs).toHaveLength(1);
  });

  it('accepts a file from an older schema version', () => {
    expect(parseBackup(fileOf([makeJob()], { schemaVersion: 0 })).isOk).toBe(true);
  });

  it('accepts a backup of no jobs', () => {
    expect(parseBackup(fileOf([]))).toEqual({ isOk: true, jobs: [] });
  });

  it.each([
    ['text that is not JSON', 'not json', "isn't valid JSON"],
    ['another app’s file', fileOf([], { app: 'other' }), "isn't a Jobmark backup"],
    ['a file tagged job-tracker', fileOf([], { app: 'job-tracker' }), "isn't a Jobmark backup"],
    ['a JSON array', '[1,2]', "isn't a Jobmark backup"],
    ['JSON null', 'null', "isn't a Jobmark backup"],
    ['a file without a version', '{"app":"jobmark","jobs":[]}', 'missing its version'],
    ['a file without jobs', '{"app":"jobmark","schemaVersion":1}', 'missing its version'],
    [
      'a job list that is not an array',
      '{"app":"jobmark","schemaVersion":1,"jobs":{}}',
      'job list',
    ],
    ['a newer schema version', fileOf([], { schemaVersion: SCHEMA_VERSION + 1 }), 'newer version'],
  ])('rejects %s', (_label, text, message) => {
    const result = parseBackup(text);

    expect(result.isOk).toBe(false);
    expect(!result.isOk && result.error).toContain(message);
  });

  it('rejects the whole file when a record is invalid, naming the problem', () => {
    const text = fileOf([
      makeJob({ id: 'seek:1' }),
      withField(makeJob({ id: 'seek:2' }), 'status', 'Ghosted'),
      { id: 'x' },
    ]);

    const result = parseBackup(text);

    expect(!result.isOk && result.error).toMatch(
      /^2 invalid records, nothing was imported\. #2: status .*; #3: /,
    );
  });

  it('says "1 invalid record" for a single one', () => {
    const result = parseBackup(fileOf([{ id: 'x' }]));

    expect(!result.isOk && result.error).toMatch(/^1 invalid record, nothing was imported\. #1: /);
  });

  it('names the first three problems and counts the rest', () => {
    const result = parseBackup(fileOf([{}, {}, {}, {}, {}]));

    expect(!result.isOk && result.error).toMatch(/^5 invalid records, nothing was imported\./);
    expect(!result.isOk && result.error).toMatch(/#1: .*; #2: .*; #3: .* \(and 2 more\)$/);
    expect(!result.isOk && result.error).not.toContain('#4');
  });

  it('rejects a record whose link is not a web link', () => {
    const result = parseBackup(fileOf([makeJob({ url: 'javascript:alert(1)' })]));

    expect(!result.isOk && result.error).toMatch(/#1: url /);
  });
});

describe('planImport', () => {
  const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`;

  it('adds new ids, updates when the backup is newer, and skips when equal or older', () => {
    const existing = [
      makeJob({ id: 'seek:same', updatedAt: at(5) }),
      makeJob({ id: 'seek:local-newer', updatedAt: at(9) }),
      makeJob({ id: 'seek:backup-newer', updatedAt: at(1) }),
    ];
    const incoming = [
      makeJob({ id: 'seek:new', updatedAt: at(1) }),
      makeJob({ id: 'seek:same', updatedAt: at(5) }),
      makeJob({ id: 'seek:local-newer', updatedAt: at(2) }),
      makeJob({ id: 'seek:backup-newer', updatedAt: at(8) }),
    ];

    const { toWrite, summary } = planImport(existing, incoming);

    expect(summary).toEqual({ added: 1, updated: 1, skipped: 2 });
    expect(toWrite.map((job) => job.id).sort()).toEqual(['seek:backup-newer', 'seek:new']);
  });

  it('writes the backup’s copy when it is newer', () => {
    const existing = [makeJob({ id: 'seek:1', notes: 'local', updatedAt: at(1) })];
    const incoming = [makeJob({ id: 'seek:1', notes: 'from backup', updatedAt: at(2) })];

    const { toWrite } = planImport(existing, incoming);

    expect(toWrite.map((job) => job.notes)).toEqual(['from backup']);
  });

  it('keeps the newest copy when a file lists an id twice', () => {
    const incoming = [
      makeJob({ id: 'seek:1', notes: 'old', updatedAt: at(1) }),
      makeJob({ id: 'seek:1', notes: 'new', updatedAt: at(9) }),
      makeJob({ id: 'seek:1', notes: 'older', updatedAt: at(3) }),
    ];

    const { toWrite, summary } = planImport([], incoming);

    expect(toWrite.map((job) => job.notes)).toEqual(['new']);
    expect(summary).toEqual({ added: 1, updated: 0, skipped: 0 });
  });

  it('plans nothing for an empty file', () => {
    expect(planImport([makeJob()], [])).toEqual({
      toWrite: [],
      summary: { added: 0, updated: 0, skipped: 0 },
    });
  });
});

describe('importBackup', () => {
  it('reproduces every job in a fresh install', async () => {
    const jobs = [
      makeJob({ id: 'seek:1' }),
      makeJob({ id: 'seek-nz:2' }),
      makeJob({ id: 'linkedin:3', source: 'linkedin' }),
      makeJob({ id: 'manual:4', source: 'other' }),
    ];

    const result = await importBackup(createBackup(jobs, NOW));

    expect(result).toEqual({ isOk: true, summary: { added: 4, updated: 0, skipped: 0 } });
    expect(byId(await jobStore.list())).toEqual(byId(jobs));
  });

  it('changes nothing when the same file is imported again', async () => {
    const text = createBackup([makeJob()], NOW);
    await importBackup(text);

    expect(await importBackup(text)).toEqual({
      isOk: true,
      summary: { added: 0, updated: 0, skipped: 1 },
    });
  });

  it('keeps a local job that is newer than the backup and takes one that is older', async () => {
    await jobStore.saveMany([
      makeJob({ id: 'seek:1', notes: 'local', updatedAt: '2026-10-09T00:00:00.000Z' }),
      makeJob({ id: 'seek:2', notes: 'local', updatedAt: '2026-10-01T00:00:00.000Z' }),
    ]);
    const backup = [
      makeJob({ id: 'seek:1', notes: 'backup', updatedAt: '2026-10-02T00:00:00.000Z' }),
      makeJob({ id: 'seek:2', notes: 'backup', updatedAt: '2026-10-08T00:00:00.000Z' }),
    ];

    await importBackup(createBackup(backup, NOW));

    expect((await jobStore.get('seek:1'))?.notes).toBe('local');
    expect((await jobStore.get('seek:2'))?.notes).toBe('backup');
  });

  it('keeps the jobs that are not in the file', async () => {
    await jobStore.save(makeJob({ id: 'seek:keep' }));

    await importBackup(createBackup([makeJob({ id: 'seek:new' })], NOW));

    expect((await jobStore.list()).map((job) => job.id).sort()).toEqual(['seek:keep', 'seek:new']);
  });

  it('writes nothing when any record in the file is invalid', async () => {
    await jobStore.save(makeJob({ id: 'seek:keep' }));
    const text = fileOf([makeJob({ id: 'seek:new' }), { id: 'broken' }]);

    const result = await importBackup(text);

    expect(result.isOk).toBe(false);
    expect((await jobStore.list()).map((job) => job.id)).toEqual(['seek:keep']);
  });

  it('reports the reason when the file is not a backup', async () => {
    expect(await importBackup('not json')).toEqual({
      isOk: false,
      error: "That file isn't valid JSON.",
    });
  });
});

describe('backupFilename', () => {
  it('names the file by the local date', () => {
    expect(backupFilename(new Date(2026, 9, 3))).toBe('jobmark-backup-2026-10-03.json');
  });
});

describe('backupNote', () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

  it('says "never" and asks for a backup when there are jobs but no backup yet', () => {
    expect(backupNote(undefined, 3, NOW)).toEqual({ text: 'Last backup: never', isStale: true });
  });

  it('does not ask for a backup while there are no jobs', () => {
    expect(backupNote(undefined, 0, NOW)).toEqual({ text: 'Last backup: never', isStale: false });
  });

  it('asks for a backup from 30 days after the last one, and not before', () => {
    expect(backupNote(daysAgo(29), 3, NOW).isStale).toBe(false);
    expect(backupNote(daysAgo(30), 3, NOW).isStale).toBe(true);
  });

  it('does not ask for a backup of no jobs, however old the last one is', () => {
    expect(backupNote(daysAgo(90), 0, NOW).isStale).toBe(false);
  });

  it('says how long ago the last backup was', () => {
    expect(backupNote(daysAgo(0), 3, NOW).text).toBe('Last backup: less than a minute ago');
    expect(backupNote(daysAgo(3), 3, NOW).text).toBe('Last backup: 3 days ago');
  });
});
