import { classifyLabel } from '@/content/click-classifier';
import type { SiteAdapter } from '@/content/click-listener';
import type { CapturedJob } from '@/messages/click';
import type { JobRef } from '@/store/job';
import { normalizeText } from '@/utils/text';

// LinkedIn ships hashed class names and no data attributes, so the selectors anchor on link
// patterns and text.

const HOSTNAME = 'www.linkedin.com';

/**
 * The whole domain: LinkedIn is a single-page app, so a visit that starts on the feed never
 * triggers a fresh injection on a /jobs URL.
 */
export const LINKEDIN_MATCHES = [`https://${HOSTNAME}/*`];

const TITLE_LINKS = 'a[href*="/jobs/view/"]';
const COMPANY_LINKS = 'a[href*="/company/"]';
// "Hybrid" and "Full-time" chips are links back to the search.
const CHIP_LINKS = 'a[href*="/jobs/search-results"]';

/** The job id is in the title link's href. */
const JOB_ID_FROM_HREF = /\/jobs\/view\/(\d+)/;
const JOB_PAGE_PATH = /^\/jobs\/view\/\d+/;

// The location line looks like "Sydney, NSW, Australia · 6 days ago · 44 applicants".
const META_SEPARATOR = '·';
const NOT_LOCATION_LINE = /^(promoted|reposted|actively)/i;

/** Chips longer than this are prose, not work-type labels. */
const MAX_CHIP_CHARS = 40;

// The top card is the smallest ancestor of the clicked button holding both the title and company
// links. Bounding its size and height keeps the filter bar and whole-pane wrappers out.
const TOP_CARD_MAX_CHARS = 1500;
const TOP_CARD_MAX_LEVELS = 10;

/** "/jobs/view/<id>/" on job pages, "?currentJobId=<id>" on search pages. */
function parseJobId(url: URL): string | undefined {
  return (
    url.pathname.match(JOB_ID_FROM_HREF)?.[1] ??
    url.searchParams.get('currentJobId')?.match(/^\d+$/)?.[0]
  );
}

const linkedInRef = (jobId: string): JobRef => ({
  id: `linkedin:${jobId}`,
  source: 'linkedin',
  url: `https://${HOSTNAME}/jobs/view/${jobId}/`,
});

/**
 * Reads the job reference from a LinkedIn URL.
 *
 * @param url - The page's URL.
 * @returns The job's reference, or `undefined` if the URL shows no single LinkedIn job.
 */
export function refFromLinkedInUrl(url: URL): JobRef | undefined {
  const jobId = url.hostname === HOSTNAME ? parseJobId(url) : undefined;
  return jobId ? linkedInRef(jobId) : undefined;
}

const getJobId = (link: Element) => link.getAttribute('href')?.match(JOB_ID_FROM_HREF)?.[1];

const collectJobIds = (root: Element) =>
  new Set(Array.from(root.querySelectorAll(TITLE_LINKS), getJobId).filter(Boolean));

/**
 * Finds the job's top card for a clicked button: the smallest ancestor holding both the title
 * link and the company link, within a size bound.
 */
function findTopCard(button: Element): Element | null {
  let node: Element | null = button;
  for (let level = 0; node && level < TOP_CARD_MAX_LEVELS; level++, node = node.parentElement) {
    if (node.querySelector(TITLE_LINKS) && node.querySelector(COMPANY_LINKS)) {
      // Too big, or showing more than one job: this is a page-level wrapper, not the top card.
      const isSmall = normalizeText(node.textContent).length <= TOP_CARD_MAX_CHARS;
      return isSmall && collectJobIds(node).size === 1 ? node : null;
    }
  }
  return null;
}

const getFirstText = (root: Element, selector: string) =>
  Array.from(root.querySelectorAll(selector), (el) => normalizeText(el.textContent)).find(
    Boolean,
  ) ?? '';

function isLocationLine(line: Element): boolean {
  const text = normalizeText(line.textContent);
  return text.includes(META_SEPARATOR) && !NOT_LOCATION_LINE.test(text);
}

const findLocationLine = (card: Element) =>
  Array.from(card.querySelectorAll('p')).find(isLocationLine);

function getLocation(card: Element): string {
  const line = findLocationLine(card);
  return line ? normalizeText(normalizeText(line.textContent).split(META_SEPARATOR)[0]) : '';
}

/** The chips are the card's links to `selector` with a short text. */
const getChips = (card: Element, selector: string) =>
  Array.from(card.querySelectorAll(selector), (a) => normalizeText(a.textContent)).filter(
    (text) => text && text.length <= MAX_CHIP_CHARS,
  );

const getSalary = (chips: string[]) => chips.find((chip) => chip.includes('$'));

const getWorkType = (chips: string[]) =>
  chips.filter((chip) => !chip.includes('$')).join(', ') || undefined;

function getApplyType(card: Element): CapturedJob['applyType'] {
  for (const control of card.querySelectorAll('button, a')) {
    const text = normalizeText(control.textContent);
    if (classifyLabel(text) !== 'apply') continue;
    return /^easy apply/i.test(text) ? 'easy' : 'external';
  }
  return 'unknown';
}

/** Reads the job shown in a top card, or `null` if the card has no job link. */
function extractLinkedIn(card: Element): CapturedJob | null {
  const titleLink = card.querySelector(TITLE_LINKS);
  const jobId = titleLink && getJobId(titleLink);
  if (!jobId) return null;

  const jobRef = linkedInRef(jobId);
  const chips = getChips(card, CHIP_LINKS);
  return {
    id: jobRef.id,
    source: jobRef.source,
    title: getFirstText(card, TITLE_LINKS),
    company: getFirstText(card, COMPANY_LINKS),
    location: getLocation(card),
    workType: getWorkType(chips),
    salary: getSalary(chips),
    applyType: getApplyType(card),
    url: jobRef.url,
  };
}

// A job page opened directly has no title link, and its chips link to the job itself.
const isJobPage = (url: URL) => url.hostname === HOSTNAME && JOB_PAGE_PATH.test(url.pathname);

/**
 * Finds the top card of a job page: the largest element around `from` that holds the company link
 * and the location line, within a size bound.
 *
 * The smallest such element would miss the chips when `from` sits by the title.
 */
function findJobPageCard(from: Element): Element | null {
  let card: Element | null = null;
  let node: Element | null = from;
  for (let level = 0; node && level < TOP_CARD_MAX_LEVELS; level++, node = node.parentElement) {
    if (node === node.ownerDocument.body) break;
    if (!node.querySelector(COMPANY_LINKS) || !findLocationLine(node)) continue;
    if (normalizeText(node.textContent).length > TOP_CARD_MAX_CHARS) break;
    card = node;
  }
  return card;
}

/** The title of a job page is the paragraph just above the location line, below the company. */
function findTitleLine(card: Element): Element | undefined {
  const lines = Array.from(card.querySelectorAll('p'));
  const location = findLocationLine(card);
  const above = location ? lines[lines.indexOf(location) - 1] : undefined;
  return above && !above.querySelector(COMPANY_LINKS) ? above : undefined;
}

/** Reads the job in the top card of a job page, whose id is in the address. */
function extractJobPage(card: Element, url: URL): CapturedJob | null {
  const jobRef = refFromLinkedInUrl(url);
  const titleLine = findTitleLine(card);
  if (!jobRef || !titleLine) return null;

  const chips = getChips(card, TITLE_LINKS);
  return {
    id: jobRef.id,
    source: jobRef.source,
    title: normalizeText(titleLine.textContent),
    company: getFirstText(card, COMPANY_LINKS),
    location: getLocation(card),
    workType: getWorkType(chips),
    salary: getSalary(chips),
    applyType: getApplyType(card),
    url: jobRef.url,
  };
}

/**
 * Grows a top card found from its title link to the whole card: the largest ancestor within the
 * size bound that holds one job. The smallest one lacks the chips, the location and the buttons.
 */
function growTopCard(card: Element): Element {
  let largest = card;
  let node = card.parentElement;
  for (let level = 0; node && level < TOP_CARD_MAX_LEVELS; level++, node = node.parentElement) {
    const isCard =
      normalizeText(node.textContent).length <= TOP_CARD_MAX_CHARS &&
      collectJobIds(node).size === 1;
    if (!isCard) break;
    largest = node;
  }
  return largest;
}

/**
 * Reads the job a LinkedIn page shows, without a click: the job in the top card of a job page, or
 * in the top card of the search split view.
 *
 * @param doc - The LinkedIn page.
 * @param pageUrl - The page's URL.
 * @returns The job, or `null` if the page shows no top card.
 */
export function readLinkedInJob(doc: Document, pageUrl: string): CapturedJob | null {
  const url = new URL(pageUrl);
  if (isJobPage(url)) {
    const location = Array.from(doc.querySelectorAll('p')).find(isLocationLine);
    const card = location && findJobPageCard(location);
    return card ? extractJobPage(card, url) : null;
  }
  for (const link of doc.querySelectorAll(TITLE_LINKS)) {
    // Only a link in a real top card, with both title and company, not one in the results list.
    const found = normalizeText(link.textContent) ? findTopCard(link) : null;
    if (found) return extractLinkedIn(growTopCard(found));
  }
  return null;
}

const currentPage = () => new URL(location.href);

/** LinkedIn for the click listener. */
export const linkedin: SiteAdapter = {
  details: (button) => (isJobPage(currentPage()) ? findJobPageCard(button) : findTopCard(button)),
  extract: (card) =>
    isJobPage(currentPage()) ? extractJobPage(card, currentPage()) : extractLinkedIn(card),
};
