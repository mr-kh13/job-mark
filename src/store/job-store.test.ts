// @vitest-environment node
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, type Job, type JobPatch } from './job';
import { jobStore } from './job-store';

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const freezeTimeAt = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

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

describe('jobStore: saving and reading', () => {
  it('saves a job and reads it back', async () => {
    await jobStore.save(makeJob());
    expect(await jobStore.get('seek:1')).toEqual(makeJob());
  });

  it('returns undefined for a job that does not exist', async () => {
    expect(await jobStore.get('seek:nope')).toBeUndefined();
  });

  it('rejects an invalid job without writing anything', async () => {
    await expect(jobStore.save(makeJob({ id: 'bad' }))).rejects.toThrow();
    expect(await jobStore.list()).toEqual([]);
  });

  it('save keeps the updatedAt it is given, so restore and undo are exact', async () => {
    await jobStore.save(makeJob({ updatedAt: '2025-01-01T00:00:00.000Z' }));
    expect((await jobStore.get('seek:1'))?.updatedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('lists every job', async () => {
    await jobStore.save(makeJob({ id: 'seek:1' }));
    await jobStore.save(makeJob({ id: 'linkedin:2' }));
    const ids = (await jobStore.list()).map((job) => job.id).sort();
    expect(ids).toEqual(['linkedin:2', 'seek:1']);
  });

  it('lists only valid jobs, skipping corrupt entries with a warning', async () => {
    await fakeBrowser.storage.local.set({
      'job:seek:1': makeJob(),
      'job:seek:bad': { id: 'nope' },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ids = (await jobStore.list()).map((job) => job.id);

    expect(ids).toEqual(['seek:1']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'seek:bad' }),
    );
    warn.mockRestore();
  });

  it('removes a job, and removing a missing one is a no-op', async () => {
    await jobStore.save(makeJob());
    await jobStore.remove('seek:1');
    await jobStore.remove('seek:1');
    expect(await jobStore.get('seek:1')).toBeUndefined();
  });

  it('saveMany writes every job', async () => {
    await jobStore.saveMany([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);
    expect((await jobStore.list()).map((job) => job.id).sort()).toEqual(['seek:1', 'seek:2']);
  });

  it('saveMany writes nothing when any job is invalid', async () => {
    await expect(
      jobStore.saveMany([makeJob({ id: 'seek:3' }), makeJob({ id: 'bad' })]),
    ).rejects.toThrow();
    expect(await jobStore.get('seek:3')).toBeUndefined();
  });

  it('keeps each job under its own key', async () => {
    await jobStore.save(makeJob({ id: 'seek:1' }));
    await jobStore.saveMany([makeJob({ id: 'linkedin:2' }), makeJob({ id: 'manual:3' })]);

    const keys = Object.keys(await fakeBrowser.storage.local.get(null)).sort();

    expect(keys).toEqual(['job:linkedin:2', 'job:manual:3', 'job:seek:1']);
  });

  it('lists only jobs, and warns about nothing, when other data sits in the same storage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await jobStore.save(makeJob());
    await jobStore.recordBackup('2026-10-13T01:00:00.000Z');
    await fakeBrowser.storage.local.set({ jobs: { 'seek:9': makeJob({ id: 'seek:9' }) } });

    expect((await jobStore.list()).map((job) => job.id)).toEqual(['seek:1']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('replaces a saved job with the same id instead of adding a second one', async () => {
    await jobStore.save(makeJob({ title: 'First' }));
    await jobStore.save(makeJob({ title: 'Second' }));

    const titles = (await jobStore.list()).map((job) => job.title);

    expect(titles).toEqual(['Second']);
  });
});

describe('jobStore: a write touches only its own job', () => {
  const keysOf = (calls: unknown[][]) =>
    calls.map(([items]) => Object.keys(items as Record<string, unknown>));

  beforeEach(async () => {
    await jobStore.saveMany(Array.from({ length: 30 }, (_, n) => makeJob({ id: `seek:${n}` })));
  });

  it.each([
    ['save', () => jobStore.save(makeJob({ id: 'seek:3', notes: 'saved' }))],
    ['update', () => jobStore.update('seek:3', { notes: 'edited' })],
    ['changeStatus', () => jobStore.changeStatus('seek:3', 'Applied')],
  ])('%s writes one key and reads at most that key', async (_name, write) => {
    const get = vi.spyOn(fakeBrowser.storage.local, 'get');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');

    await write();

    expect(keysOf(set.mock.calls)).toEqual([['job:seek:3']]);
    for (const [request] of get.mock.calls) expect(request).toBe('job:seek:3');
  });

  it('saveMany writes only the keys of the jobs it is given, in one call', async () => {
    const get = vi.spyOn(fakeBrowser.storage.local, 'get');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');

    await jobStore.saveMany([makeJob({ id: 'seek:4' }), makeJob({ id: 'seek:5' })]);

    expect(keysOf(set.mock.calls)).toEqual([['job:seek:4', 'job:seek:5']]);
    expect(get).not.toHaveBeenCalled();
  });

  it('remove deletes one key without reading or writing the others', async () => {
    const get = vi.spyOn(fakeBrowser.storage.local, 'get');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    const remove = vi.spyOn(fakeBrowser.storage.local, 'remove');

    await jobStore.remove('seek:3');

    expect(remove.mock.calls).toEqual([['job:seek:3']]);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('get reads one key', async () => {
    const get = vi.spyOn(fakeBrowser.storage.local, 'get');

    await jobStore.get('seek:3');

    expect(get.mock.calls).toEqual([['job:seek:3']]);
  });
});

describe('jobStore.update', () => {
  const fullJob = (notes = 'phoned recruiter', updatedAt?: string) =>
    makeJob({
      workArrangement: 'Hybrid',
      employmentType: 'Contract',
      salary: '$150k',
      appliedAt: '2026-10-14T01:00:00.000Z',
      status: 'Applied',
      notes,
      updatedAt,
    });

  it('merges the patch, stamps updatedAt and saves', async () => {
    freezeTimeAt('2026-11-01T00:00:00.000Z');
    await jobStore.save(makeJob());

    const next = await jobStore.update('seek:1', { status: 'Applied', notes: 'called' });

    expect(next).toMatchObject({
      status: 'Applied',
      notes: 'called',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(await jobStore.get('seek:1')).toEqual(next);
  });

  it('keeps every field the patch does not mention', async () => {
    freezeTimeAt('2026-11-01T00:00:00.000Z');
    await jobStore.save(fullJob());

    const next = await jobStore.update('seek:1', { notes: 'later' });

    expect(next).toEqual(fullJob('later', '2026-11-01T00:00:00.000Z'));
  });

  it('clears needsReview when the edit leaves the title and company filled', async () => {
    await jobStore.save(makeJob({ title: '', needsReview: true }));

    const next = await jobStore.update('seek:1', { title: 'Engineer' });

    expect(next?.needsReview).toBe(false);
    expect((await jobStore.get('seek:1'))?.needsReview).toBe(false);
  });

  it('ignores an undefined value for a required field', async () => {
    await jobStore.save(fullJob());
    const next = await jobStore.update('seek:1', { title: undefined, notes: undefined });
    expect(next?.title).toBe('Engineer');
    expect(next?.notes).toBe('phoned recruiter');
  });

  it('clears the optional fields that are patched with undefined', async () => {
    await jobStore.save(fullJob());

    const next = await jobStore.update('seek:1', {
      workArrangement: undefined,
      employmentType: undefined,
      salary: undefined,
      appliedAt: undefined,
    });

    expect(next?.workArrangement).toBeUndefined();
    expect(next?.employmentType).toBeUndefined();
    expect(next?.salary).toBeUndefined();
    expect(next?.appliedAt).toBeUndefined();
    expect(next?.title).toBe('Engineer');
    expect(await jobStore.get('seek:1')).toEqual(next);
  });

  it('cannot change the id', async () => {
    await jobStore.save(makeJob());
    const sneaky = { id: 'seek:2', notes: 'x' };
    const next = await jobStore.update('seek:1', sneaky);
    expect(next?.id).toBe('seek:1');
    expect(await jobStore.get('seek:2')).toBeUndefined();
  });

  it('returns undefined and writes nothing when the job does not exist', async () => {
    expect(await jobStore.update('seek:nope', { notes: 'x' })).toBeUndefined();
    expect(await jobStore.list()).toEqual([]);
  });

  it('rejects a patch that makes the job invalid and leaves the stored job alone', async () => {
    await jobStore.save(makeJob());
    const invalid: JobPatch = { savedAt: 'yesterday' };
    await expect(jobStore.update('seek:1', invalid)).rejects.toThrow();
    expect(await jobStore.get('seek:1')).toEqual(makeJob());
  });
});

describe('jobStore.changeStatus', () => {
  it('stamps appliedAt when a job moves past Interested for the first time', async () => {
    freezeTimeAt('2026-11-01T00:00:00.000Z');
    await jobStore.save(makeJob());

    const next = await jobStore.changeStatus('seek:1', 'Applied');

    expect(next).toMatchObject({
      status: 'Applied',
      appliedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('keeps an appliedAt that is already set', async () => {
    freezeTimeAt('2026-11-01T00:00:00.000Z');
    await jobStore.save(makeJob({ status: 'Applied', appliedAt: '2026-10-14T01:00:00.000Z' }));

    const next = await jobStore.changeStatus('seek:1', 'Interviewing');

    expect(next?.appliedAt).toBe('2026-10-14T01:00:00.000Z');
  });

  it('does not stamp appliedAt when the new status is Interested', async () => {
    await jobStore.save(makeJob());
    const next = await jobStore.changeStatus('seek:1', 'Interested');
    expect(next?.appliedAt).toBeUndefined();
  });

  it('moving back to Interested keeps the appliedAt it had', async () => {
    await jobStore.save(makeJob({ status: 'Applied', appliedAt: '2026-10-14T01:00:00.000Z' }));
    const next = await jobStore.changeStatus('seek:1', 'Interested');
    expect(next).toMatchObject({ status: 'Interested', appliedAt: '2026-10-14T01:00:00.000Z' });
  });

  it('reads appliedAt from storage, whatever copy the caller holds', async () => {
    await jobStore.save(makeJob());
    await jobStore.update('seek:1', { appliedAt: '2026-10-14T01:00:00.000Z' });

    const next = await jobStore.changeStatus('seek:1', 'Applied');

    expect(next?.appliedAt).toBe('2026-10-14T01:00:00.000Z');
  });

  it('returns undefined when the job does not exist', async () => {
    expect(await jobStore.changeStatus('seek:nope', 'Applied')).toBeUndefined();
  });
});

describe('jobStore: writes never interleave', () => {
  it('concurrent updates to one job all land', async () => {
    await jobStore.save(makeJob());

    await Promise.all([
      jobStore.update('seek:1', { notes: 'called' }),
      jobStore.update('seek:1', { salary: '$150k' }),
      jobStore.changeStatus('seek:1', 'Applied'),
    ]);

    expect(await jobStore.get('seek:1')).toMatchObject({
      notes: 'called',
      salary: '$150k',
      status: 'Applied',
    });
  });

  it('a remove during an update does not bring the deleted job back', async () => {
    await jobStore.save(makeJob());

    await Promise.all([jobStore.update('seek:1', { notes: 'edited' }), jobStore.remove('seek:1')]);

    expect(await jobStore.get('seek:1')).toBeUndefined();
  });

  it('a save during an update is not overwritten by the update', async () => {
    await jobStore.save(makeJob());

    await Promise.all([
      jobStore.update('seek:1', { notes: 'edited' }),
      jobStore.save(makeJob({ title: 'Restored title' })),
    ]);

    expect((await jobStore.get('seek:1'))?.title).toBe('Restored title');
  });

  it('a failed write does not block the ones after it', async () => {
    await jobStore.save(makeJob());
    const invalid: JobPatch = { savedAt: 'yesterday' };
    await expect(jobStore.update('seek:1', invalid)).rejects.toThrow();

    await jobStore.update('seek:1', { notes: 'after the failure' });

    expect((await jobStore.get('seek:1'))?.notes).toBe('after the failure');
  });
});

describe('jobStore.transaction', () => {
  it('runs a read then a write with no other write in between', async () => {
    await jobStore.save(makeJob());

    await Promise.all([
      jobStore.transaction(async (ops) => {
        const job = await ops.get('seek:1');
        if (job) await ops.save(applyPatch(job, { notes: 'from the transaction' }, job.updatedAt));
      }),
      jobStore.update('seek:1', { salary: '$150k' }),
    ]);

    expect(await jobStore.get('seek:1')).toMatchObject({
      notes: 'from the transaction',
      salary: '$150k',
    });
  });

  it('gives back whatever the task returns', async () => {
    await jobStore.save(makeJob());
    const count = await jobStore.transaction(async (ops) => (await ops.list()).length);
    expect(count).toBe(1);
  });

  it('can save, saveMany and remove from inside without waiting on itself', async () => {
    await jobStore.transaction(async (ops) => {
      await ops.save(makeJob({ id: 'seek:1' }));
      await ops.saveMany([makeJob({ id: 'seek:2' }), makeJob({ id: 'seek:3' })]);
      await ops.remove('seek:2');
    });
    expect((await jobStore.list()).map((job) => job.id).sort()).toEqual(['seek:1', 'seek:3']);
  });
});

describe('jobStore.onChange', () => {
  it('reports a saved job', async () => {
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    await jobStore.save(makeJob());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ saved: [makeJob()], removed: [] });
  });

  it('reports a changed job with its new values', async () => {
    await jobStore.save(makeJob());
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    const next = await jobStore.update('seek:1', { notes: 'x' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ saved: [next], removed: [] });
  });

  it('reports a removed job by its id, without a warning', async () => {
    await jobStore.save(makeJob());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    await jobStore.remove('seek:1');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ saved: [], removed: ['seek:1'] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports the jobs of one saveMany together', async () => {
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    await jobStore.saveMany([makeJob({ id: 'seek:1' }), makeJob({ id: 'seek:2' })]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const [change] = onChange.mock.calls[0] as [{ saved: Job[]; removed: string[] }];
    expect(change.saved.map((job) => job.id).sort()).toEqual(['seek:1', 'seek:2']);
    expect(change.removed).toEqual([]);
  });

  it('reports a stored value that is not a valid job as removed, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    await fakeBrowser.storage.local.set({ 'job:seek:1': { id: 'nope' } });

    expect(onChange).toHaveBeenCalledWith({ saved: [], removed: ['seek:1'] });
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: 'seek:1' }),
    );
  });

  it('stays quiet for changes that are not jobs', async () => {
    const onChange = vi.fn();
    jobStore.onChange(onChange);

    await jobStore.recordBackup('2026-10-13T01:00:00.000Z');
    await fakeBrowser.storage.local.set({ settings: { theme: 'dark' } });
    await fakeBrowser.storage.session.set({ 'job:seek:1': makeJob() });
    await fakeBrowser.storage.sync.set({ 'job:seek:2': makeJob({ id: 'seek:2' }) });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops calling back once unsubscribed', async () => {
    const onChange = vi.fn();
    const unsubscribe = jobStore.onChange(onChange);
    unsubscribe();

    await jobStore.save(makeJob());

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('jobStore backup note', () => {
  it('has no last backup until one is recorded', async () => {
    expect(await jobStore.getLastBackupAt()).toBeUndefined();
  });

  it('remembers when the last backup was made', async () => {
    await jobStore.recordBackup('2026-10-13T01:00:00.000Z');
    expect(await jobStore.getLastBackupAt()).toBe('2026-10-13T01:00:00.000Z');
  });
});
