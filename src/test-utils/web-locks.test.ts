import { describe, expect, it } from 'vitest';
import './web-locks';

describe('the Web Locks stand-in', () => {
  it('runs requests one at a time, in the order they were made', async () => {
    const order: string[] = [];
    const slow = navigator.locks.request('jobs', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('slow');
    });
    const quick = navigator.locks.request('jobs', async () => {
      order.push('quick');
    });

    await Promise.all([slow, quick]);

    expect(order).toEqual(['slow', 'quick']);
  });

  it('hands a failed task its error and still runs the next request', async () => {
    const failed = navigator.locks.request('jobs', async () => {
      throw new Error('boom');
    });
    const next = navigator.locks.request('jobs', async () => 'ran');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });
});
