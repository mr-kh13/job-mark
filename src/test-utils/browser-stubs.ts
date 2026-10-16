import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import { vi } from 'vitest';

// The fake browser does not implement these calls. The casts pick the promise form of
// the API, which TypeScript cannot choose from an overloaded function.

type Context = Browser.runtime.ExtensionContext;

/** Makes `runtime.getContexts` answer with these extension pages, such as an open sheet tab. */
export const stubContexts = (contexts: Partial<Context>[]) =>
  vi.spyOn(fakeBrowser.runtime, 'getContexts').mockImplementation((async () => contexts) as never);

/** Makes `tabs.query` answer with these tabs for the active tab of the current window. */
export const stubTabs = (tabs: Partial<Browser.tabs.Tab>[]) =>
  vi
    .spyOn(fakeBrowser.tabs, 'query')
    .mockImplementation((async (query: Browser.tabs.QueryInfo) =>
      query.active && query.currentWindow ? tabs : []) as never);

/** Makes `scripting.executeScript` answer with whatever `run` returns for the target tab. */
export const stubInjection = (run: (tabId: number) => Promise<unknown[]>) =>
  vi
    .spyOn(fakeBrowser.scripting, 'executeScript')
    .mockImplementation((async ({ target }: { target: { tabId: number } }) =>
      run(target.tabId)) as never);

/** Makes `action.setIcon` remember the icon paths set for each tab, and returns them by tab id. */
export const stubTabIcons = () => {
  const icons = new Map<number, unknown>();
  vi.spyOn(fakeBrowser.action, 'setIcon').mockImplementation((async ({
    tabId,
    path,
  }: {
    tabId: number;
    path: unknown;
  }) => {
    icons.set(tabId, path);
  }) as never);
  return icons;
};

/** Makes `tabs.sendMessage` answer with whatever `reply` returns for the tab and message. */
export const stubTabReply = (reply: (tabId: number, message: unknown) => unknown) =>
  vi
    .spyOn(fakeBrowser.tabs, 'sendMessage')
    .mockImplementation((async (tabId: number, message: unknown) =>
      reply(tabId, message)) as never);
