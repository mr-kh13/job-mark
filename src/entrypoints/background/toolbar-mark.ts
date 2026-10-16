import { STATUS_COLOURS, summarizeJob } from '@/store/job-display';
import { jobStore } from '@/store/job-store';

const NAME = 'Jobmark';
const PLAIN_ICON = { 16: 'icon/16.png', 32: 'icon/32.png' };

// One file per status colour and size: the plain icon with a dot in the corner, named by the hex.
const dotIcon = (colour: string) => ({
  16: `icon/mark-${colour.slice(1)}-16.png`,
  32: `icon/mark-${colour.slice(1)}-32.png`,
});

/**
 * Puts a dot on the toolbar icon of one tab when that tab shows a tracked job, in the colour of the
 * job's status. Any other job, or no job, gives the tab the plain icon.
 *
 * @param tabId - The tab to mark.
 * @param jobId - The id of the job the tab shows, or `null` if it shows none.
 */
export async function markToolbar(tabId: number, jobId: string | null): Promise<void> {
  const job = jobId === null ? undefined : await jobStore.get(jobId);
  if (!job) {
    // A tab's title cannot be unset, so it gets the icon's default title back.
    const defaultTitle = await browser.action.getTitle({});
    await Promise.all([
      browser.action.setIcon({ tabId, path: PLAIN_ICON }),
      browser.action.setTitle({ tabId, title: defaultTitle }),
    ]);
    return;
  }
  await Promise.all([
    browser.action.setIcon({ tabId, path: dotIcon(STATUS_COLOURS[job.status]) }),
    browser.action.setTitle({ tabId, title: `${NAME}: ${summarizeJob(job)}` }),
  ]);
}
