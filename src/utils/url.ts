/**
 * Whether a string is an http or https link. Other schemes such as `javascript:` and `data:`
 * are rejected, so a link that passes is safe to put in an `href`.
 *
 * @param value - The text to check.
 * @returns `true` for an http(s) URL.
 */
export function isWebLink(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|msclkid$|mc_|_hs)/i;

/**
 * Parses a URL without throwing.
 *
 * @param raw - The URL text, absolute or relative to `base`.
 * @param base - The URL a relative `raw` is resolved against.
 * @returns The parsed URL, or `undefined` if `raw` is not one.
 */
export function parseUrl(raw: string, base?: string): URL | undefined {
  try {
    return new URL(raw, base);
  } catch {
    return undefined;
  }
}

/**
 * Drops the hash, tracking parameters and trailing slash, so the same page at a slightly
 * different link compares equal.
 *
 * @param raw - The URL text.
 * @returns The cleaned-up URL, or `raw` trimmed if it is not a URL.
 */
export function normalizeUrl(raw: string): string {
  const url = parseUrl(raw);
  if (!url) return raw.trim();
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  return `${url.protocol}//${url.host}${path}${url.search}`;
}
