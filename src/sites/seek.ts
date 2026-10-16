import type { SiteAdapter } from '@/content/click-listener';
import type { CapturedJob } from '@/messages/click';
import type { JobRef } from '@/store/job';
import { normalizeText } from '@/utils/text';
import { extractJsonLd, extractPageTitle, mergeExtracted, type Extracted } from './job-fields';

/** Host to job id prefix. The old seek.com.au and seek.co.nz domains redirect to these. */
const MARKETS = new Map([
  ['au.seek.com', 'seek'],
  ['nz.seek.com', 'seek-nz'],
]);

/** Where the content script runs: one match pattern per market. */
export const SEEK_MATCHES = Array.from(MARKETS.keys(), (host) => `https://${host}/*`);

/**
 * The job details panel, on both /job/<id> pages and the search split view. The home page's
 * panel carries no such marker.
 */
const DETAILS = '[data-automation="jobDetailsPage"]';

const SELECTORS = {
  title: 'h1[data-automation="job-detail-title"]',
  company: '[data-automation="advertiser-name"]',
  location: '[data-automation="job-detail-location"]',
  workType: '[data-automation="job-detail-work-type"]',
  salary: '[data-automation="job-detail-salary"]',
  // Anchor whose visible text is "Quick apply" (internal) or "Apply" (external company site).
  apply: '[data-automation="job-detail-apply"]',
};

const JOB_ID_FROM_PATH = /^\/job\/(\d+)/;
const JOB_ID_FROM_HREF = /\/job\/(\d+)/;
const QUICK_APPLY = /^quick apply$/i;

/** "/job/123" on job pages, "?jobId=123" on search pages with the split view open. */
function parseJobId(url: URL): string | undefined {
  return (
    url.pathname.match(JOB_ID_FROM_PATH)?.[1] ?? url.searchParams.get('jobId')?.match(/^\d+$/)?.[0]
  );
}

/**
 * Reads the job reference from a Seek URL.
 *
 * @param url - The page's URL.
 * @returns The job's reference, or `undefined` if the URL shows no single Seek job.
 */
export function refFromSeekUrl(url: URL): JobRef | undefined {
  const jobId = parseJobId(url);
  return jobId ? refFor(url.hostname, jobId) : undefined;
}

function refFor(hostname: string, jobId: string): JobRef | undefined {
  const prefix = MARKETS.get(hostname);
  if (!prefix) return undefined;
  return { id: `${prefix}:${jobId}`, source: 'seek', url: `https://${hostname}/job/${jobId}` };
}

/** The job id in the link that wraps a panel's title, which is where the home page holds it. */
const jobIdFromLink = (link: Element | null | undefined) =>
  link?.getAttribute('href')?.match(JOB_ID_FROM_HREF)?.[1];

const readText = (root: Element, selector: string) =>
  normalizeText(root.querySelector(selector)?.textContent) || undefined;

const extractBySelectors = (root: Element): Extracted => ({
  title: readText(root, SELECTORS.title),
  company: readText(root, SELECTORS.company),
  location: readText(root, SELECTORS.location),
  workType: readText(root, SELECTORS.workType),
  salary: readText(root, SELECTORS.salary),
});

function getApplyType(root: Element): CapturedJob['applyType'] {
  const apply = root.querySelector(SELECTORS.apply);
  if (!apply) return 'unknown';
  return QUICK_APPLY.test(normalizeText(apply.textContent)) ? 'quick' : 'external';
}

// Keeps a wrapper around the whole page from passing as an unmarked panel.
const MAX_UNMARKED_PANEL_CHARS = 1500;

/**
 * Finds the job panel around a title heading or a button: the marked details panel or, where the
 * page marks none, the smallest element around it that holds one job title and the company.
 *
 * @param from - A title heading, or a button that may sit in a panel.
 * @returns The panel, or `null` if `from` is outside one.
 */
function findPanel(from: Element): Element | null {
  const marked = from.closest(DETAILS);
  if (marked) return marked;
  for (let node: Element | null = from; node; node = node.parentElement) {
    if (!node.querySelector(SELECTORS.title) || !node.querySelector(SELECTORS.company)) continue;
    const isPanel =
      node.querySelectorAll(SELECTORS.title).length === 1 &&
      normalizeText(node.textContent).length <= MAX_UNMARKED_PANEL_CHARS;
    return isPanel ? node : null;
  }
  return null;
}

/**
 * Reads the job in a panel. Fields come from Seek's markup, then the page's JSON-LD, then its
 * title; anything still missing stays empty so the click handler flags the job for review.
 *
 * The JSON-LD and the title count only when the address names this job.
 *
 * @param doc - The Seek page.
 * @param pageUrl - The page's URL. It holds the job id unless the panel's title link does.
 * @param root - The panel to read. Defaults to the page's marked details panel.
 * @returns The job, or `null` if there is no panel or no Seek job id.
 */
export function extractSeek(
  doc: Document,
  pageUrl: string,
  root: Element | null = doc.querySelector(DETAILS),
): CapturedJob | null {
  if (!root) return null;
  const url = new URL(pageUrl);
  const jobId = jobIdFromLink(root.querySelector(`${SELECTORS.title} a`)) ?? parseJobId(url);
  const jobRef = jobId ? refFor(url.hostname, jobId) : undefined;
  if (!jobRef) return null;

  const fromMarkup = extractBySelectors(root);
  const isOwnPage = refFromSeekUrl(url)?.id === jobRef.id;
  const fields = isOwnPage
    ? mergeExtracted(fromMarkup, extractJsonLd(doc), extractPageTitle(doc))
    : mergeExtracted(fromMarkup);
  return {
    id: jobRef.id,
    source: jobRef.source,
    title: fields.title,
    company: fields.company,
    location: fields.location,
    workType: fields.workType,
    salary: fields.salary,
    applyType: getApplyType(root),
    url: jobRef.url,
  };
}

/**
 * Grows an unmarked panel found from its title to the whole panel: the largest ancestor within the
 * size bound that holds no other job title. The smallest one lacks the location and the buttons.
 */
function growPanel(panel: Element): Element {
  let largest = panel;
  for (let node = panel.parentElement; node; node = node.parentElement) {
    const isPanel =
      node.querySelectorAll(SELECTORS.title).length === 1 &&
      normalizeText(node.textContent).length <= MAX_UNMARKED_PANEL_CHARS;
    if (!isPanel) break;
    largest = node;
  }
  return largest;
}

/**
 * Reads the job a Seek page shows, without a click: the job in the first job panel on the page.
 *
 * @param doc - The Seek page.
 * @param pageUrl - The page's URL.
 * @returns The job, or `null` if the page shows no job panel or no Seek job id.
 */
export function readSeekJob(doc: Document, pageUrl: string): CapturedJob | null {
  for (const heading of doc.querySelectorAll(SELECTORS.title)) {
    const found = findPanel(heading);
    if (found) return extractSeek(doc, pageUrl, found.matches(DETAILS) ? found : growPanel(found));
  }
  return null;
}

/** Seek for the click listener. */
export const seek: SiteAdapter = {
  details: findPanel,
  extract: (details) => extractSeek(document, location.href, details),
};
