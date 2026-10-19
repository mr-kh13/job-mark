import { CapturedJob } from '@/messages/click';
import type { ReadJobMessage } from '@/messages/read-job';
import { refFromUrl } from '@/sites/job-ref';
import type { Job, NewJob } from '@/store/job';
import {
  extractJsonLdFromTexts,
  parseWorkType,
  pickTitle,
  splitPageTitle,
} from '@/sites/job-fields';
import { normalizeText } from '@/utils/text';
import { isWebLink, normalizeUrl, parseUrl } from '@/utils/url';

/** The page signals a manual save reads, as plain strings that can pass out of a tab. */
export type PageSnapshot = {
  url: string;
  title: string;
  h1: string;
  ogTitle: string;
  ogSiteName: string;
  canonical: string;
  jsonLd: string[];
};

/**
 * Reads the signals from the page it runs in. It runs inside the user's tab through
 * `scripting.executeScript`, which serialises it, so it uses nothing outside its own body.
 *
 * @returns The page's signals; any the page lacks are empty.
 */
export function snapshotPage(): PageSnapshot {
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content') ?? '';
  return {
    url: location.href,
    title: document.title,
    h1: document.querySelector('h1')?.textContent ?? '',
    ogTitle: meta('meta[property="og:title"]'),
    ogSiteName: meta('meta[property="og:site_name"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .slice(0, 20)
      .map((script) => script.textContent ?? ''),
  };
}

/**
 * A snapshot of the active tab, whether the page itself could be read, and the job that a Seek or
 * LinkedIn page showed to Jobmark's own script.
 */
export type TabSnapshot = { snapshot: PageSnapshot; isReadable: boolean; job: CapturedJob | null };

/**
 * Asks the content script of a tab for the job the tab shows. Every page without that script,
 * such as another site or a tab opened before the extension was installed, gives no answer.
 */
async function readJobFromTab(tabId: number): Promise<CapturedJob | null> {
  try {
    const message: ReadJobMessage = { type: 'read-job' };
    const parsed = CapturedJob.safeParse(await browser.tabs.sendMessage(tabId, message));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Snapshots the tab the user is looking at. A page the extension cannot read, such as a chrome://
 * page or a PDF, is snapshotted from the tab's URL and title alone.
 *
 * @returns The snapshot, or `null` if there is no active tab with a URL.
 */
export async function snapshotActiveTab(): Promise<TabSnapshot | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) return null;
  const job = await readJobFromTab(tab.id);
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: snapshotPage,
    });
    if (injection?.result) return { snapshot: injection.result, isReadable: true, job };
  } catch (error) {
    // Expected on pages the browser protects. Also the symptom of a missing permission.
    console.warn('Could not read the page', error);
  }
  return {
    snapshot: {
      url: tab.url,
      title: tab.title ?? '',
      h1: '',
      ogTitle: '',
      ogSiteName: '',
      canonical: '',
      jsonLd: [],
    },
    isReadable: job !== null,
    job,
  };
}

/** What the save form is prefilled with: a new job without its status and apply type. */
export type Draft = Omit<NewJob, 'status' | 'applyType'>;

/** The page's canonical link when it stays on the same site, otherwise the page's own URL. */
function resolveCanonical(snapshot: PageSnapshot): string {
  const canonical = parseUrl(snapshot.canonical, snapshot.url);
  const isSameSite = canonical?.host === parseUrl(snapshot.url)?.host;
  return canonical && isSameSite ? canonical.href : snapshot.url;
}

/**
 * Makes a best-effort job from a page: the job Jobmark's own script read first, field by field,
 * then a JSON-LD JobPosting, then the page's headings, tab title and site name.
 *
 * @param snapshot - The signals read from the page.
 * @param uuid - Makes the id when the page is not a Seek or LinkedIn job.
 * @param job - The job the content script read from the page, if it answered.
 * @returns The draft. Fields the page does not give are empty, and so is the link of a page that
 * is not a web page.
 */
export function createDraft(
  snapshot: PageSnapshot,
  uuid: string,
  job: CapturedJob | null = null,
): Draft {
  const found = extractJsonLdFromTexts(snapshot.jsonLd);
  const jobRef = job ?? refFromUrl(resolveCanonical(snapshot), uuid);
  const fromTitle = splitPageTitle(
    found.title || pickTitle(snapshot.h1, snapshot.ogTitle, snapshot.title),
  );
  const { workArrangement, employmentType } = parseWorkType(job?.workType || found.workType);
  // Seek and LinkedIn name themselves in the site name, which is no employer.
  const siteName = jobRef.source === 'other' ? normalizeText(snapshot.ogSiteName) : '';
  return {
    id: jobRef.id,
    source: jobRef.source,
    url: isWebLink(jobRef.url) ? jobRef.url : '',
    title: job?.title || fromTitle.title,
    company: job?.company || found.company || fromTitle.company || siteName,
    location: job?.location || found.location || fromTitle.location || '',
    workArrangement,
    employmentType,
    salary: job?.salary,
  };
}

/**
 * Finds the tracked job a draft would duplicate: the job with the same id or, for a draft from a
 * page outside Seek and LinkedIn, the job saved from the same link.
 *
 * @param jobs - The tracked jobs.
 * @param draft - The draft's id and link. A draft without a link never matches by link.
 * @returns The matching job, or `undefined` if the draft is new.
 */
export function findExisting(
  jobs: readonly Job[],
  draft: Pick<Draft, 'id' | 'url'>,
): Job | undefined {
  const url = normalizeUrl(draft.url);
  const isLinkable = draft.id.startsWith('manual:') && url !== '';
  return jobs.find((job) => job.id === draft.id || (isLinkable && normalizeUrl(job.url) === url));
}
