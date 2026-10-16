import type { JobRef } from '@/store/job';
import { jobKey } from '@/store/job-key';
import { sendMessage } from './send-message';

/**
 * Tells the service worker which job the page shows, so it can mark the toolbar icon.
 *
 * The job comes from the page's address and the page itself is not read. The address is checked
 * again after each move inside the site, and the job is sent again when its record changes.
 *
 * @param refFromUrl - Reads a job reference from the page's address.
 */
export function reportPageJob(refFromUrl: (url: URL) => JobRef | undefined): void {
  let reportedId: string | null = null;

  const report = (isForced: boolean) => {
    const id = refFromUrl(new URL(location.href))?.id ?? null;
    if (id === reportedId && !isForced) return;
    reportedId = id;
    void sendMessage({ type: 'page-job', id });
  };
  report(false);

  // The sites are single-page apps, so a move to another job changes the address without a load.
  (window as Window & { navigation?: EventTarget }).navigation?.addEventListener(
    'currententrychange',
    () => report(false),
  );
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && reportedId !== null && Object.hasOwn(changes, jobKey(reportedId))) {
      report(true);
    }
  });
}
