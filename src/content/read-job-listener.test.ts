import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedJob } from '@/messages/click';
import { listenForReadRequests } from './read-job-listener';

const JOB: CapturedJob = {
  id: 'linkedin:1000000001',
  source: 'linkedin',
  title: 'Senior Frontend Engineer',
  company: 'Fabrikam',
  location: 'Sydney',
  applyType: 'easy',
  url: 'https://www.linkedin.com/jobs/view/1000000001/',
};

const ask = (message: unknown = { type: 'read-job' }) => fakeBrowser.runtime.sendMessage(message);

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listenForReadRequests', () => {
  it('answers a read-job request with the job on the page', async () => {
    listenForReadRequests(() => JOB);

    expect(await ask()).toEqual(JOB);
  });

  it('answers null when the page shows no job', async () => {
    listenForReadRequests(() => null);

    expect(await ask()).toBeNull();
  });

  it('reads the page again for each request', async () => {
    const read = vi.fn<() => CapturedJob | null>().mockReturnValueOnce(JOB).mockReturnValue(null);
    listenForReadRequests(read);

    const answers = [await ask(), await ask()];

    expect(answers).toEqual([JOB, null]);
  });

  it('answers null when reading the page throws, so the caller never waits', async () => {
    listenForReadRequests(() => {
      throw new Error('markup changed');
    });

    expect(await ask()).toBeNull();
  });

  it.each([
    ['another type', { type: 'click' }],
    ['no type', {}],
    ['a string', 'read-job'],
    ['null', null],
  ])('ignores %s and does not read the page', async (_label, message) => {
    const read = vi.fn<() => CapturedJob | null>(() => JOB);
    listenForReadRequests(read);

    const answer = await ask(message);

    expect(answer).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});
