import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, settle } from '@/test-utils/render';
import { renderHook } from '@/test-utils/render-hook';
import { logger } from '@/utils/logger';
import { SETTINGS_STORAGE_KEY, useSettings } from './use-settings';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});

const setup = () => renderHook(useSettings);

describe('useSettings', () => {
  it('starts with the AI line on when nothing is stored', async () => {
    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps a change for the rest of the visit', async () => {
    const result = await setup();

    await settle(() => result.current[1]({ isAiEnabled: false }));

    expect(result.current[0]).toEqual({ isAiEnabled: false });
  });

  it('starts with the choice saved on an earlier visit', async () => {
    const earlier = await setup();
    await settle(() => earlier.current[1]({ isAiEnabled: false }));
    await cleanup();

    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: false });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('saves the latest choice only', async () => {
    const earlier = await setup();
    await settle(() => earlier.current[1]({ isAiEnabled: false }));
    await settle(() => earlier.current[1]({ isAiEnabled: true }));
    await cleanup();

    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: true });
  });

  it('keeps the default for a setting a stored object does not mention', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{}');

    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'text that is not JSON', stored: 'not json' },
    { name: 'a list', stored: '[false]' },
    { name: 'null', stored: 'null' },
    { name: 'a number', stored: '3' },
    { name: 'a value that is not true or false', stored: '{"isAiEnabled":"no"}' },
  ])('ignores stored $name and says so', async ({ stored }) => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, stored);

    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: true });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('starts with the defaults, and says so, when the browser refuses to read the storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const result = await setup();

    expect(result.current[0]).toEqual({ isAiEnabled: true });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('still applies a change for this visit, and says so, when the browser refuses to save it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const result = await setup();

    await settle(() => result.current[1]({ isAiEnabled: false }));

    expect(result.current[0]).toEqual({ isAiEnabled: false });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
