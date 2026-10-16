import { describe, expect, it } from 'vitest';
import { normalizeText, pluralize } from './text';

describe('normalizeText', () => {
  it('removes zero-width characters that sites hide in labels', () => {
    expect(normalizeText('Apply\u2060')).toBe('Apply');
    expect(normalizeText('Ea\u200bsy\ufeff Apply')).toBe('Easy Apply');
  });

  it('collapses runs of whitespace, including newlines and non-breaking spaces', () => {
    expect(normalizeText('Easy   Apply\n\tnow\u00a0please')).toBe('Easy Apply now please');
  });

  it('trims both ends', () => {
    expect(normalizeText('  Save  ')).toBe('Save');
  });

  it('returns an empty string for null, undefined or blank text', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(' \u200b ')).toBe('');
  });
});

describe('pluralize', () => {
  it('uses the singular for exactly one', () => {
    expect(pluralize(1, 'job')).toBe('1 job');
  });

  it.each([0, 2, 12])('uses the plural for %i', (count) => {
    expect(pluralize(count, 'job')).toBe(`${count} jobs`);
  });
});
