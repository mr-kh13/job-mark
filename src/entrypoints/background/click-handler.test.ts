// @vitest-environment node
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { jobStore } from '@/store/job-store';
import { handleClick } from './click-handler';
import type { CapturedJob } from '@/messages/click';

const T1 = '2026-10-13T01:00:00.000Z';
const T2 = '2026-10-14T02:00:00.000Z';

beforeEach(() => {
  fakeBrowser.reset();
});

const makeCaptured = (over: Partial<CapturedJob> = {}): CapturedJob => ({
  id: over.id ?? 'seek:1',
  source: over.source ?? 'seek',
  title: over.title ?? 'Engineer',
  company: over.company ?? 'Acme',
  location: over.location ?? 'Sydney',
  salary: over.salary,
  workType: over.workType,
  applyType: over.applyType ?? 'quick',
  url: over.url ?? 'https://www.seek.com.au/job/1',
});

describe('handleClick on a new job', () => {
  it('creates an Applied job on Apply, with appliedAt set to the click time', async () => {
    const result = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T1 });

    expect(result.outcome).toBe('saved');
    expect(result.job).toMatchObject({
      id: 'seek:1',
      status: 'Applied',
      savedAt: T1,
      appliedAt: T1,
      updatedAt: T1,
      notes: '',
      needsReview: false,
    });
    expect(await jobStore.get('seek:1')).toEqual(result.job);
  });

  it('creates an Interested job on Save, without appliedAt', async () => {
    const result = await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 });

    expect(result.outcome).toBe('saved');
    expect(result.job.status).toBe('Interested');
    expect(result.job.appliedAt).toBeUndefined();
    expect(result.job.savedAt).toBe(T1);
  });

  it('copies the captured fields and splits the raw work type', async () => {
    const job = makeCaptured({ salary: '$150k', workType: 'Hybrid, Full-time' });
    const result = await handleClick({ kind: 'save', job, clickedAt: T1 });

    expect(result.job).toMatchObject({
      title: 'Engineer',
      company: 'Acme',
      location: 'Sydney',
      salary: '$150k',
      applyType: 'quick',
      url: 'https://www.seek.com.au/job/1',
      source: 'seek',
      workArrangement: 'Hybrid',
      employmentType: 'Full-time',
    });
  });

  it.each([
    ['title', { title: '' }],
    ['company', { company: '' }],
    ['company (whitespace only)', { company: '   ' }],
  ])('flags the job for review when the %s is blank', async (_field, over) => {
    const result = await handleClick({
      kind: 'apply',
      job: makeCaptured(over),
      clickedAt: T1,
    });

    expect(result.outcome).toBe('saved');
    expect(result.job.needsReview).toBe(true);
  });
});

describe('handleClick on a tracked job', () => {
  it('upgrades an Interested job on Apply', async () => {
    await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 });
    const result = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 });

    expect(result.outcome).toBe('upgraded');
    expect(result.job).toMatchObject({
      status: 'Applied',
      savedAt: T1,
      appliedAt: T2,
      updatedAt: T2,
    });
    expect(await jobStore.list()).toEqual([result.job]);
  });

  it('keeps the edits the user made while the job was Interested', async () => {
    await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 });
    await jobStore.update('seek:1', { notes: 'referral from Sam', title: 'Senior Engineer' });

    const result = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 });

    expect(result.job.notes).toBe('referral from Sam');
    expect(result.job.title).toBe('Senior Engineer');
  });

  it('takes the apply type from the Apply click when the saved one is unknown', async () => {
    await handleClick({
      kind: 'save',
      job: makeCaptured({ applyType: 'unknown' }),
      clickedAt: T1,
    });

    const result = await handleClick({
      kind: 'apply',
      job: makeCaptured({ applyType: 'quick' }),
      clickedAt: T2,
    });

    expect(result.job.applyType).toBe('quick');
  });

  it('keeps a known apply type when upgrading', async () => {
    await handleClick({ kind: 'save', job: makeCaptured({ applyType: 'easy' }), clickedAt: T1 });

    const result = await handleClick({
      kind: 'apply',
      job: makeCaptured({ applyType: 'quick' }),
      clickedAt: T2,
    });

    expect(result.job.applyType).toBe('easy');
  });

  it('treats a repeated Apply as a duplicate and writes nothing', async () => {
    const first = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T1 });
    const result = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 });

    expect(result.outcome).toBe('duplicate');
    expect(result.job).toEqual(first.job);
    expect(await jobStore.get('seek:1')).toEqual(first.job);
  });

  it('treats a repeated Save as a duplicate', async () => {
    const first = await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 });
    const result = await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T2 });

    expect(result.outcome).toBe('duplicate');
    expect(await jobStore.get('seek:1')).toEqual(first.job);
  });

  it('never downgrades: Save on an Applied job is a duplicate', async () => {
    await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T1 });
    const result = await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T2 });

    expect(result.outcome).toBe('duplicate');
    expect(result.job.status).toBe('Applied');
  });

  it('leaves a job the user moved past Interested alone when Apply is clicked again', async () => {
    await handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 });
    await jobStore.changeStatus('seek:1', 'Rejected');

    const result = await handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 });

    expect(result.outcome).toBe('duplicate');
    expect(result.job.status).toBe('Rejected');
  });
});

describe('handleClick with concurrent clicks', () => {
  it('turns two Apply clicks on a new job into one job and one duplicate', async () => {
    const results = await Promise.all([
      handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T1 }),
      handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 }),
    ]);

    expect(results.map((r) => r.outcome).sort()).toEqual(['duplicate', 'saved']);
    expect(await jobStore.list()).toHaveLength(1);
  });

  it('saves on a Save then upgrades on an Apply when both arrive together', async () => {
    const results = await Promise.all([
      handleClick({ kind: 'save', job: makeCaptured(), clickedAt: T1 }),
      handleClick({ kind: 'apply', job: makeCaptured(), clickedAt: T2 }),
    ]);

    expect(results.map((r) => r.outcome)).toEqual(['saved', 'upgraded']);
    expect((await jobStore.get('seek:1'))?.status).toBe('Applied');
  });
});
