const SHEET_PATH = '/sheet.html';

/** A request, carried in the sheet's address, to show one job. */
export type JobRequest = {
  id: string;
  /** Differs for every request, so asking for the same job twice counts as two requests. */
  token: string;
};

/**
 * Reads the job a sheet address asks for.
 *
 * @param hash - The address's hash, such as "#job=seek%3A123&t=1789".
 * @returns The request, or nothing when the hash names no job.
 */
export function jobRequestFromHash(hash: string): JobRequest | undefined {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('job');
  return id ? { id, token: hash } : undefined;
}

/**
 * Builds the hash of a sheet address that asks to show one job.
 *
 * The time in the hash makes a repeat request for a job a new address, which an open sheet sees
 * as a change.
 *
 * @param jobId - The job to show.
 * @returns The hash, such as "#job=seek%3A123&t=1789".
 */
export function jobHash(jobId: string): string {
  return `#job=${encodeURIComponent(jobId)}&t=${Date.now()}`;
}

/**
 * Brings the sheet to the front: focuses the open sheet tab, or opens a new one.
 *
 * With a job, the sheet shows that job.
 *
 * @param jobId - The job to show, if any.
 * @throws When the browser cannot list or change its tabs.
 */
export async function openSheet(jobId?: string): Promise<void> {
  const sheetUrl = browser.runtime.getURL(SHEET_PATH);
  const url = jobId ? `${sheetUrl}${jobHash(jobId)}` : undefined;
  // getContexts finds the open tab without the "tabs" permission. The address of a sheet showing
  // a job ends in a hash, so the tab is matched by the start of its address.
  const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB'] });
  const open = contexts.find((context) => context.documentUrl?.startsWith(sheetUrl));

  if (open) {
    await browser.tabs.update(open.tabId, url ? { url, active: true } : { active: true });
    await browser.windows.update(open.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url: url ?? sheetUrl });
}
