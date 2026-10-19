import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, settle } from '@/test-utils/render';
import { renderHook } from '@/test-utils/render-hook';
import { COLUMNS_STORAGE_KEY, useColumnVisibility } from './use-column-visibility';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const setup = () => renderHook(useColumnVisibility);

describe('useColumnVisibility', () => {
  it('starts with every column visible when nothing is stored', async () => {
    const result = await setup();

    expect(result.current[0]).toEqual({});
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps a change for the rest of the visit', async () => {
    const result = await setup();

    await settle(() => result.current[1]({ salary: false }));

    expect(result.current[0]).toEqual({ salary: false });
  });

  it('starts with the choice saved on an earlier visit', async () => {
    const earlier = await setup();
    await settle(() => earlier.current[1]({ salary: false, notes: false }));
    await cleanup();

    const result = await setup();

    expect(result.current[0]).toEqual({ salary: false, notes: false });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('saves the latest choice only', async () => {
    const earlier = await setup();
    await settle(() => earlier.current[1]({ salary: false }));
    await settle(() => earlier.current[1]({ notes: false }));
    await cleanup();

    const result = await setup();

    expect(result.current[0]).toEqual({ notes: false });
  });

  it.each([
    { name: 'text that is not JSON', stored: 'not json' },
    { name: 'a list', stored: '["salary"]' },
    { name: 'null', stored: 'null' },
    { name: 'a number', stored: '3' },
    { name: 'values that are not true or false', stored: '{"salary":"no"}' },
  ])('ignores stored $name and says so', async ({ stored }) => {
    localStorage.setItem(COLUMNS_STORAGE_KEY, stored);

    const result = await setup();

    expect(result.current[0]).toEqual({});
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('starts with every column visible, and says so, when the browser refuses to read the storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const result = await setup();

    expect(result.current[0]).toEqual({});
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('still applies a change for this visit, and says so, when the browser refuses to save it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const result = await setup();

    await settle(() => result.current[1]({ salary: false }));

    expect(result.current[0]).toEqual({ salary: false });
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
