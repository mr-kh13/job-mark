import type { JobRef } from '@/store/job';
import { normalizeUrl, parseUrl } from '@/utils/url';
import { refFromLinkedInUrl } from './linkedin';
import { refFromSeekUrl } from './seek';

/**
 * Finds the reference of the job a page shows. A Seek or LinkedIn job page gets the id and link
 * that the click listener gives that job, so saving it by hand never duplicates it.
 *
 * @param rawUrl - The page's URL.
 * @param uuid - Makes the id of a page that is not a job-site page.
 * @returns The job reference; any other page gets `manual:<uuid>` and the source `other`.
 */
export function refFromUrl(rawUrl: string, uuid: string): JobRef {
  const url = parseUrl(rawUrl);
  const site =
    url &&
    [refFromSeekUrl, refFromLinkedInUrl].map((refFromSite) => refFromSite(url)).find(Boolean);
  return site ?? { id: `manual:${uuid}`, source: 'other', url: normalizeUrl(rawUrl) };
}
