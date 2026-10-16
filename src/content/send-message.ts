import type { ClickMessage } from '@/messages/click';
import type { PageJobMessage } from '@/messages/page-job';

/**
 * Sends a message to the service worker. A failure is logged and does not reach the page.
 *
 * @param message - The message to send.
 */
export async function sendMessage(message: ClickMessage | PageJobMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    // Expected when the extension reloaded or went away while the tab stayed open.
    console.warn('Jobmark could not send a message.', error);
  }
}
