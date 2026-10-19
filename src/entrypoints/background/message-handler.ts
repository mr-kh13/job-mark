import { z } from 'zod';
import { handleClick } from './click-handler';
import { markToolbar } from './toolbar-mark';
import { ClickMessage, type ClickResult } from '@/messages/click';
import { PageJobMessage } from '@/messages/page-job';

const Message = z.discriminatedUnion('type', [ClickMessage, PageJobMessage]);

/** The part of a message's sender that this module reads. */
type Sender = { tab?: { id?: number } };

/**
 * Handles a message from a content script. Anything that is not a valid message is logged and
 * ignored, and a failing write or a toolbar that cannot be marked is logged instead of thrown.
 *
 * @param raw - The message as received; untrusted.
 * @param sender - Who sent it. A page-job message marks the toolbar of the tab it came from.
 * @returns The click result for a click, or `undefined` for anything else or a failure.
 */
export async function handleMessage(
  raw: unknown,
  sender: Sender = {},
): Promise<ClickResult | undefined> {
  const parsed = Message.safeParse(raw);
  if (!parsed.success) {
    console.warn('Ignoring invalid message', parsed.error.issues);
    return undefined;
  }
  try {
    if (parsed.data.type === 'page-job') {
      const tabId = sender.tab?.id;
      if (tabId === undefined) console.warn('Ignoring a page-job message from outside a tab');
      else await markToolbar(tabId, parsed.data.id);
      return undefined;
    }
    return await handleClick(parsed.data);
  } catch (error) {
    console.error('Failed to handle message', error);
    return undefined;
  }
}

/** Answers messages from content scripts with `handleMessage`. Call once from the service worker. */
export function listenForMessages(): void {
  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    void handleMessage(raw, sender).then(sendResponse);
    return true; // keeps the channel open for the async reply
  });
}
