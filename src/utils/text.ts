/**
 * Removes zero-width characters, collapses whitespace and trims the ends.
 *
 * @param text - The text to clean; `null` and `undefined` count as empty.
 * @returns The cleaned text.
 */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '') // zero-width characters
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pairs a count with its noun, adding an "s" unless the count is one.
 *
 * @param count - How many.
 * @param noun - The singular noun.
 * @returns For example "1 job" or "3 jobs".
 */
export const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;
