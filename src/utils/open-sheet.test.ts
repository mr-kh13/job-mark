// @vitest-environment node
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubContexts } from '@/test-utils/browser-stubs';
import { jobHash, jobRequestFromHash, openSheet } from './open-sheet';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  fakeBrowser.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const sheetUrl = () => fakeBrowser.runtime.getURL('/sheet.html');

/** An open sheet tab that the browser reports as an extension page. */
const openSheetTab = async (address = sheetUrl()) => {
  const tab = await fakeBrowser.tabs.create({ url: address });
  await fakeBrowser.tabs.create({ url: 'https://au.seek.com/job/1', active: true });
  stubContexts([{ tabId: tab.id, windowId: tab.windowId, documentUrl: address }]);
  return tab;
};

describe('openSheet', () => {
  describe('when no sheet is open', () => {
    it('opens a new tab', async () => {
      stubContexts([]);
      const create = vi.spyOn(fakeBrowser.tabs, 'create');

      await openSheet();

      expect(create).toHaveBeenCalledExactlyOnceWith({ url: sheetUrl() });
    });

    it('opens it on the job when one is given', async () => {
      stubContexts([]);
      const create = vi.spyOn(fakeBrowser.tabs, 'create');

      await openSheet('seek:123');

      expect(create).toHaveBeenCalledExactlyOnceWith({
        url: `${sheetUrl()}#job=seek%3A123&t=${NOW}`,
      });
    });

    it('does not mistake another extension page for the sheet', async () => {
      stubContexts([
        { tabId: 5, windowId: 1, documentUrl: fakeBrowser.runtime.getURL('/other.html') },
      ]);
      const create = vi.spyOn(fakeBrowser.tabs, 'create');

      await openSheet();

      expect(create).toHaveBeenCalledOnce();
    });
  });

  describe('when the sheet is already open', () => {
    it('asks the browser for the extension’s tabs', async () => {
      const getContexts = stubContexts([]);

      await openSheet();

      expect(getContexts).toHaveBeenCalledExactlyOnceWith({ contextTypes: ['TAB'] });
    });

    it('brings that tab and its window to the front instead of opening another', async () => {
      const sheet = await openSheetTab();
      const focusWindow = vi.spyOn(fakeBrowser.windows, 'update');
      const create = vi.spyOn(fakeBrowser.tabs, 'create');

      await openSheet();

      expect((await fakeBrowser.tabs.get(sheet.id!)).active).toBe(true);
      expect(focusWindow).toHaveBeenCalledWith(sheet.windowId, { focused: true });
      expect(create).not.toHaveBeenCalled();
    });

    it('leaves the tab’s address alone when no job is given', async () => {
      const sheet = await openSheetTab();
      const update = vi.spyOn(fakeBrowser.tabs, 'update');

      await openSheet();

      expect(update).toHaveBeenCalledExactlyOnceWith(sheet.id, { active: true });
    });

    it('moves the tab to the job when one is given', async () => {
      const sheet = await openSheetTab();
      const update = vi.spyOn(fakeBrowser.tabs, 'update');

      await openSheet('seek:123');

      expect(update).toHaveBeenCalledExactlyOnceWith(sheet.id, {
        url: `${sheetUrl()}#job=seek%3A123&t=${NOW}`,
        active: true,
      });
    });

    it('recognises a sheet that is already showing a job', async () => {
      await openSheetTab(`${sheetUrl()}#job=seek%3A1&t=5`);
      const create = vi.spyOn(fakeBrowser.tabs, 'create');

      await openSheet('seek:2');

      expect(create).not.toHaveBeenCalled();
    });
  });

  it('gives a second request for the same job a new address, so the open sheet notices it', async () => {
    stubContexts([]);
    const create = vi.spyOn(fakeBrowser.tabs, 'create');

    await openSheet('seek:123');
    vi.setSystemTime(NOW + 1);
    await openSheet('seek:123');

    const [first, second] = create.mock.calls.map(([properties]) => properties.url);
    expect(first).not.toBe(second);
  });

  it('fails when the browser cannot list its tabs', async () => {
    vi.spyOn(fakeBrowser.runtime, 'getContexts').mockRejectedValue(new Error('unsupported'));

    await expect(openSheet()).rejects.toThrow('unsupported');
  });
});

describe('jobHash', () => {
  it('names the job and the time of the request', () => {
    expect(jobHash('seek:123')).toBe(`#job=seek%3A123&t=${NOW}`);
  });

  it('gives a second request for the same job a new hash', () => {
    const first = jobHash('seek:123');
    vi.setSystemTime(NOW + 1);

    expect(jobHash('seek:123')).not.toBe(first);
  });

  it.each([
    'seek:123',
    'seek-nz:9',
    'manual:11111111-1111-4111-8111-111111111111',
    'manual:a&b#c=d e+f',
  ])('can be read back as a request for %j', (id) => {
    expect(jobRequestFromHash(jobHash(id))?.id).toBe(id);
  });
});

describe('jobRequestFromHash', () => {
  it('reads the job id from the hash of the sheet’s address', () => {
    expect(jobRequestFromHash('#job=seek-nz%3A9&t=1')?.id).toBe('seek-nz:9');
  });

  it('gives each hash its own token, so a repeat request is a new one', () => {
    const first = jobRequestFromHash('#job=seek%3A1&t=1');
    const second = jobRequestFromHash('#job=seek%3A1&t=2');

    expect(first?.token).not.toBe(second?.token);
    expect(first?.token).toBe(jobRequestFromHash('#job=seek%3A1&t=1')?.token);
  });

  it.each(['', '#', '#top', '#job=', '#t=5', '#jobs=seek%3A1'])(
    'finds no request in %j',
    (hash) => {
      expect(jobRequestFromHash(hash)).toBeUndefined();
    },
  );

  it.each([
    'seek:123',
    'seek-nz:9',
    'linkedin:42',
    'manual:11111111-1111-4111-8111-111111111111',
    'manual:a&b#c=d e+f',
  ])('reads back the id %j that openSheet put in the address', async (id) => {
    stubContexts([]);
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    await openSheet(id);
    const address = new URL(create.mock.calls[0]![0].url!);

    expect(jobRequestFromHash(address.hash)?.id).toBe(id);
  });
});
