import { describe, expect, it } from 'vitest';
import { ClickMessage } from './click';

type Raw = Record<string, unknown>;

const without = (raw: Raw, key: string): Raw =>
  Object.fromEntries(Object.entries(raw).filter(([field]) => field !== key));

const makeCapturedJob = (over: Raw = {}): Raw => ({
  id: over.id ?? 'seek:1',
  source: over.source ?? 'seek',
  title: over.title ?? 'Engineer',
  company: over.company ?? 'Acme',
  location: over.location ?? 'Sydney',
  salary: over.salary,
  workType: over.workType,
  applyType: over.applyType ?? 'quick',
  url: over.url ?? 'https://au.seek.com/job/1',
});

const makeMessage = (over: Raw = {}): Raw => ({
  type: over.type ?? 'click',
  kind: over.kind ?? 'apply',
  job: over.job ?? makeCapturedJob(),
  clickedAt: over.clickedAt ?? '2026-10-14T01:00:00.000Z',
});

describe('ClickMessage', () => {
  it('accepts what the listener sends', () => {
    const result = ClickMessage.safeParse(makeMessage());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ type: 'click', kind: 'apply', job: { id: 'seek:1' } });
  });

  it('accepts the save kind and the optional salary and work type', () => {
    const job = makeCapturedJob({ salary: '$150k', workType: 'Hybrid, Full-time' });

    const result = ClickMessage.safeParse(makeMessage({ kind: 'save', job }));

    expect(result.data).toMatchObject({
      kind: 'save',
      job: { salary: '$150k', workType: 'Hybrid, Full-time' },
    });
  });

  it('drops job fields outside the contract, so a page cannot set status or notes', () => {
    const job = makeCapturedJob();
    job.status = 'Offer';
    job.notes = 'hello';

    const parsed = ClickMessage.parse(makeMessage({ job }));

    expect(parsed.job).not.toHaveProperty('status');
    expect(parsed.job).not.toHaveProperty('notes');
  });

  it.each([
    ['an unknown type', makeMessage({ type: 'capture' })],
    ['an unknown kind', makeMessage({ kind: 'share' })],
    ['a clickedAt that is not ISO', makeMessage({ clickedAt: 'yesterday' })],
    ['a missing job', without(makeMessage(), 'job')],
    ['a job without a title', makeMessage({ job: without(makeCapturedJob(), 'title') })],
    [
      'an id with an unknown site prefix',
      makeMessage({ job: makeCapturedJob({ id: 'indeed:1' }) }),
    ],
    ['an unknown apply type', makeMessage({ job: makeCapturedJob({ applyType: 'maybe' }) })],
    ['a 1,001-character title', makeMessage({ job: makeCapturedJob({ title: 'x'.repeat(1001) }) })],
    [
      'a 1,001-character work type',
      makeMessage({ job: makeCapturedJob({ workType: 'x'.repeat(1001) }) }),
    ],
    [
      'a job link that is not a web link',
      makeMessage({ job: makeCapturedJob({ url: 'javascript:alert(1)' }) }),
    ],
    ['null', null],
    ['a string', 'click'],
  ])('rejects %s', (_label, raw) => {
    expect(ClickMessage.safeParse(raw).success).toBe(false);
  });
});
