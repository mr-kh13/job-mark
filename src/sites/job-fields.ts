import type { Job } from '@/store/job';
import { normalizeText } from '@/utils/text';

/** Job fields read from a page. */
export type Extracted = {
  title?: string;
  company?: string;
  location?: string;
  workType?: string;
  salary?: string;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toArray = (value: unknown): unknown[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/** A cleaned string, or `undefined` for anything else or blank text. */
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? normalizeText(value) || undefined : undefined;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function findJobPosting(data: unknown): JsonObject | undefined {
  return toArray(data)
    .filter(isObject)
    .flatMap((item) => [item].concat(toArray(item['@graph']).filter(isObject)))
    .find((node) => toArray(node['@type']).includes('JobPosting'));
}

function readJobPosting(posting: JsonObject): Extracted {
  const organization = posting.hiringOrganization;
  const address = toArray(posting.jobLocation).find(isObject)?.address;
  const locality = isObject(address) ? text(address.addressLocality) : undefined;
  const region = isObject(address) ? text(address.addressRegion) : undefined;
  return {
    title: text(posting.title),
    company: isObject(organization) ? text(organization.name) : undefined,
    location: [locality, region].filter(Boolean).join(', ') || undefined,
    workType: text(posting.employmentType),
  };
}

/**
 * Reads the first schema.org JobPosting from the text of a page's ld+json blocks. Text that is
 * not valid JSON is skipped.
 *
 * @param texts - The text of each ld+json script.
 * @returns The fields found, or an empty object if none holds a JobPosting.
 */
export function extractJsonLdFromTexts(texts: string[]): Extracted {
  for (const raw of texts) {
    const posting = findJobPosting(parseJson(raw));
    if (posting) return readJobPosting(posting);
  }
  return {};
}

/**
 * Reads the first schema.org JobPosting from the page's ld+json blocks.
 *
 * @param doc - The page to read.
 * @returns The fields found, or an empty object if the page has no JobPosting.
 */
export function extractJsonLd(doc: Document): Extracted {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  return extractJsonLdFromTexts(Array.from(scripts, (script) => script.textContent ?? ''));
}

/**
 * Picks a job title from the page's headings.
 *
 * @param h1 - The text of the first h1.
 * @param ogTitle - The og:title content.
 * @param docTitle - The document title.
 * @returns The first of the three that is not blank, cleaned up, or an empty string.
 */
export function pickTitle(h1: string, ogTitle: string, docTitle: string): string {
  return normalizeText(h1) || normalizeText(ogTitle) || normalizeText(docTitle);
}

// How Seek and LinkedIn write the tab title of a job page.
const SITE_TITLES = [
  /^(?<title>.+) \| (?<company>[^|]+) \| LinkedIn$/,
  /^(?<title>.+) \| LinkedIn$/,
  /^(?<title>.+) Job in (?<location>.+?) - SEEK$/,
  /^(?<title>.+) - SEEK$/,
];

/**
 * Splits a tab title written the way Seek or LinkedIn write it ("Title | Company | LinkedIn",
 * "Title Job in Place - SEEK") into its parts. Any other title comes back unchanged.
 *
 * @param pageTitle - The title of the tab.
 * @returns The title, and the company or the place when the tab title holds one.
 */
export function splitPageTitle(pageTitle: string): {
  title: string;
  company?: string;
  location?: string;
} {
  const title = normalizeText(pageTitle);
  for (const pattern of SITE_TITLES) {
    const groups = pattern.exec(title)?.groups;
    if (groups) {
      return {
        title: groups['title'] ?? title,
        company: groups['company'],
        location: groups['location'],
      };
    }
  }
  return { title };
}

/**
 * Last-resort title: the page's first h1, then og:title, then the document title.
 *
 * @param doc - The page to read.
 * @returns The title found, or an empty object if there is none.
 */
export function extractPageTitle(doc: Document): Extracted {
  const title = pickTitle(
    doc.querySelector('h1')?.textContent ?? '',
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    doc.title,
  );
  return title ? { title } : {};
}

/**
 * Combines several readings of one page. Each field takes the first non-empty value in the order
 * given, and a missing title, company or location becomes an empty string.
 *
 * @param sources - The readings, most trusted first.
 * @returns The merged fields.
 */
export function mergeExtracted(...sources: Extracted[]) {
  const pick = (key: keyof Extracted) => sources.map((source) => source[key]).find(Boolean);
  return {
    title: pick('title') ?? '',
    company: pick('company') ?? '',
    location: pick('location') ?? '',
    workType: pick('workType'),
    salary: pick('salary'),
  };
}

type WorkArrangement = NonNullable<Job['workArrangement']>;
type EmploymentType = NonNullable<Job['employmentType']>;

const ARRANGEMENT_PATTERNS: [RegExp, WorkArrangement][] = [
  [/\bremote\b|work from home|\bwfh\b/, 'Remote'],
  [/\bhybrid\b/, 'Hybrid'],
  [/on[\s_-]?site|in[\s_-]?office/, 'On-site'],
];

const EMPLOYMENT_PATTERNS: [RegExp, EmploymentType][] = [
  [/part[\s_-]?time/, 'Part-time'],
  [/full[\s_-]?time/, 'Full-time'],
  [/contract|temp/, 'Contract'],
  [/casual/, 'Casual'],
  [/intern/, 'Internship'],
];

const firstMatch = <T>(text: string, patterns: [RegExp, T][]): T | undefined =>
  patterns.find(([pattern]) => pattern.test(text))?.[1];

/**
 * Splits a site's free-text work type ("Hybrid, Full-time", "PART_TIME") into its two fields.
 *
 * @param text - The raw work type text from the page.
 * @returns The work arrangement and employment type found, each `undefined` if absent.
 */
export function parseWorkType(
  text: string | undefined,
): Pick<Job, 'workArrangement' | 'employmentType'> {
  const lower = (text ?? '').toLowerCase();
  return {
    workArrangement: firstMatch(lower, ARRANGEMENT_PATTERNS),
    employmentType: firstMatch(lower, EMPLOYMENT_PATTERNS),
  };
}
