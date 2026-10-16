import type { CapturedJob } from '@/messages/click';
import type { ReadJobMessage } from '@/messages/read-job';

const isReadJob = (message: unknown): message is ReadJobMessage =>
  typeof message === 'object' &&
  message !== null &&
  'type' in message &&
  message.type === 'read-job';

/**
 * Answers the popup's request for the job the page shows. The page is read on each request and
 * never otherwise.
 *
 * @param read - Reads the job on the page now, or returns `null` if there is none.
 */
export function listenForReadRequests(read: () => CapturedJob | null): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isReadJob(message)) return;
    try {
      sendResponse(read());
    } catch (error) {
      // The site's markup may have changed. The popup falls back to the page's generic signals.
      console.warn('Jobmark could not read the job.', error);
      sendResponse(null);
    }
    return true; // keeps the reply channel open until the answer is delivered
  });
}
