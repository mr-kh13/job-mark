import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForClicks } from './click-listener';
import type { ClickMessage } from '@/messages/click';
import { userClick } from '@/test-utils/user-click';

const PAGE = `
  <div id="filters"><button id="filter">Easy Apply</button></div>
  <div class="panel">
    <h1 id="title">Engineer</h1>
    <button id="apply"><span id="label">Quick apply</span></button>
    <button id="save">Save</button>
    <button id="applied">Applied</button>
    <p id="text">Apply</p>
  </div>
`;

// The document outlives each test, so the listener is registered once for the whole file.
let isReadable = true;
listenForClicks({
  details: (button) => button.closest('.panel'),
  extract: (details) =>
    isReadable
      ? {
          id: 'seek:1',
          source: 'seek',
          title: details.querySelector('h1')?.textContent ?? '',
          company: 'Acme',
          location: 'Sydney',
          applyType: 'quick',
          url: 'https://au.seek.com/job/1',
        }
      : null,
});

let received: ClickMessage[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  received = [];
  fakeBrowser.runtime.onMessage.addListener((message) => {
    received.push(message as ClickMessage);
  });
  document.body.innerHTML = PAGE;
  isReadable = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const get = (id: string) => document.getElementById(id)!;
const click = userClick;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('listenForClicks', () => {
  it('sends the job and click time when Apply is clicked', async () => {
    const warn = vi.spyOn(console, 'warn');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T01:00:00.000Z'));

    click(get('apply'));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    await settle();
    expect(warn).not.toHaveBeenCalled();
    expect(received[0]).toEqual({
      type: 'click',
      kind: 'apply',
      clickedAt: '2026-10-14T01:00:00.000Z',
      job: {
        id: 'seek:1',
        source: 'seek',
        title: 'Engineer',
        company: 'Acme',
        location: 'Sydney',
        applyType: 'quick',
        url: 'https://au.seek.com/job/1',
      },
    });
  });

  it('sends kind "save" when Save is clicked', async () => {
    click(get('save'));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.kind).toBe('save');
  });

  it('counts a click on an element inside the button', async () => {
    click(get('label'));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.kind).toBe('apply');
  });

  it.each([
    ['the heading', 'title'],
    ['a paragraph that reads "Apply"', 'text'],
    ['an Applied button', 'applied'],
    ['an Apply button outside the job panel', 'filter'],
  ])('sends nothing for a click on %s', async (_label, id) => {
    click(get(id));

    await settle();
    expect(received).toEqual([]);
  });

  it('sends nothing for a click that a script on the page dispatched', async () => {
    get('apply').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await settle();
    expect(received).toEqual([]);
  });

  it('sends nothing when the site adapter cannot read the job', async () => {
    isReadable = false;

    click(get('apply'));

    await settle();
    expect(received).toEqual([]);
  });

  it('reads the page before the site reacts to the click', async () => {
    get('apply').addEventListener('click', (event) => {
      event.stopPropagation();
      document.querySelector('.panel')!.innerHTML = '';
    });

    click(get('apply'));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.job.title).toBe('Engineer');
  });

  describe('when the extension cannot be reached', () => {
    const pageErrors: unknown[] = [];
    const recordError = (event: ErrorEvent) => pageErrors.push(event.error);

    beforeEach(() => {
      pageErrors.length = 0;
      window.addEventListener('error', recordError);
    });

    afterEach(() => {
      window.removeEventListener('error', recordError);
    });

    it('warns about a rejected send and leaves the page alone, such as after the service worker went away', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fakeBrowser.runtime.onMessage.removeAllListeners();

      click(get('apply'));

      await settle();
      expect(pageErrors).toEqual([]);
      expect(warn).toHaveBeenCalledWith('Jobmark could not send a message.', expect.any(Error));
    });

    it('warns about a send that throws and leaves the page alone, such as after the extension reloaded', async () => {
      const reason = new Error('Extension context invalidated.');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementationOnce(() => {
        throw reason;
      });

      click(get('apply'));

      await settle();
      expect(pageErrors).toEqual([]);
      expect(warn).toHaveBeenCalledWith('Jobmark could not send a message.', reason);
    });
  });
});
