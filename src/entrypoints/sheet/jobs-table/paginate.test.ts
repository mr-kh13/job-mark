import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

describe('paginate', () => {
  it('returns the first page of items', () => {
    expect(paginate(numbers(25), 1, 10).items).toEqual(numbers(10));
  });

  it('returns a later page of items', () => {
    expect(paginate(numbers(25), 2, 10).items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('returns what is left on the last page', () => {
    expect(paginate(numbers(25), 3, 10).items).toEqual([21, 22, 23, 24, 25]);
  });

  it('counts a partly filled last page', () => {
    expect(paginate(numbers(25), 1, 10).pageCount).toBe(3);
  });

  it('counts no extra page when the items fill every page', () => {
    expect(paginate(numbers(20), 1, 10).pageCount).toBe(2);
  });

  it('has one empty page for no items', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, pageCount: 1 });
  });

  it('has one page when the items fit in it', () => {
    expect(paginate(numbers(3), 1, 10)).toEqual({ items: [1, 2, 3], page: 1, pageCount: 1 });
  });

  it('moves a page past the end back to the last page', () => {
    const result = paginate(numbers(25), 9, 10);

    expect(result.page).toBe(3);
    expect(result.items).toEqual([21, 22, 23, 24, 25]);
  });

  it.each([0, -4])('moves page %i forward to the first page', (page) => {
    const result = paginate(numbers(25), page, 10);

    expect(result.page).toBe(1);
    expect(result.items).toEqual(numbers(10));
  });

  it('does not change the array it was given', () => {
    const items = numbers(5);

    paginate(items, 2, 2);

    expect(items).toEqual(numbers(5));
  });
});
